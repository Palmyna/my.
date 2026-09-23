begin;

-- Prepared only. Apply manually after the previous Phase 6 migrations.
-- All browser item writes remain closed; this is the only order-writing API.
-- One snapshot and one array: no REST row cap or drift between pagination requests.
create function public.get_collection_item_order(p_collection_id uuid)
returns uuid[] language sql stable security invoker set search_path = ''
as $$
  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[])
  from public.collection_items where collection_id = p_collection_id;
$$;
revoke all on function public.get_collection_item_order(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_collection_item_order(uuid) to authenticated;

create function public.reorder_collection_item(
  p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_ids uuid[];
  remaining_ids uuid[];
  final_ids uuid[];
  insertion_index integer;
  lower_position numeric;
  upper_position numeric;
  candidate numeric;
  has_ties boolean;
begin
  -- Match the restrictions bypassed by SECURITY DEFINER, including deleted profiles.
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'reorder_not_authorized';
  end if;
  -- PostgREST uses READ COMMITTED. A fixed transaction snapshot must not compute
  -- neighbours from an order that predates another committed reorder.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'reorder_refresh_required';
  end if;

  -- Serialize same-collection reorders (and parent deletion) until transaction end.
  -- READ COMMITTED statements below read the latest committed order after waiting.
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'reorder_not_authorized';
  end if;
  if p_placement is null or p_placement not in ('start', 'end', 'before', 'after')
    or (p_placement in ('start', 'end') and p_anchor_id is not null)
    or (p_placement in ('before', 'after') and (p_anchor_id is null or p_anchor_id = p_item_id)) then
    raise exception using errcode = '22023', message = 'reorder_invalid_move';
  end if;

  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[]),
    count(*) <> count(distinct sort_position)
  into current_ids, has_ties from public.collection_items where collection_id = p_collection_id;
  if p_item_id is null or not (p_item_id = any(current_ids))
    or (p_anchor_id is not null and not (p_anchor_id = any(current_ids))) then
    raise exception using errcode = 'P0002', message = 'reorder_item_unavailable';
  end if;

  remaining_ids := array_remove(current_ids, p_item_id);
  insertion_index := case p_placement
    when 'start' then 1
    when 'end' then cardinality(remaining_ids) + 1
    when 'before' then array_position(remaining_ids, p_anchor_id)
    when 'after' then array_position(remaining_ids, p_anchor_id) + 1 end;
  final_ids := remaining_ids[1:insertion_index - 1] || array[p_item_id]
    || remaining_ids[insertion_index:cardinality(remaining_ids)];

  -- Repeated requests are idempotent. Tied legacy positions are repaired in their
  -- deterministic (position, UUID) order even when the requested move is a no-op.
  if final_ids = current_ids and not has_ties then return; end if;
  select sort_position into lower_position from public.collection_items
    where id = final_ids[insertion_index - 1];
  select sort_position into upper_position from public.collection_items
    where id = final_ids[insertion_index + 1];
  candidate := case
    when lower_position is null and upper_position is null then 1
    when lower_position is null then upper_position - 1
    when upper_position is null then lower_position + 1
    else round((lower_position + upper_position) / 2, 20) end;

  -- Round before comparing: a midpoint that rounds onto a neighbour is not safe.
  -- Also avoid NUMERIC(40,20) overflow at either edge; no floating-point arithmetic.
  if not has_ties and abs(candidate) < 100000000000000000000
    and (lower_position is null or candidate > lower_position)
    and (upper_position is null or candidate < upper_position) then
    update public.collection_items set sort_position = candidate where id = p_item_id;
  else
    -- Bounded to this collection, retaining exactly the requested logical order.
    update public.collection_items as item set sort_position = ordered.rank::numeric(40,20)
    from unnest(final_ids) with ordinality as ordered(id, rank)
    where item.id = ordered.id and item.collection_id = p_collection_id
      and item.sort_position is distinct from ordered.rank::numeric(40,20);
  end if;
  -- Existing updated_at triggers still run. No origin/rank/target/version writes.
end;
$$;

revoke all on function public.reorder_collection_item(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reorder_collection_item(uuid, uuid, text, uuid) to authenticated;
comment on function public.reorder_collection_item(uuid, uuid, text, uuid) is
  'Owner-only aal2 reorder: start/end or before/after a same-collection item. Parent row lock serializes reorders; exact midpoint or deterministic collection rebalance. No direct item grants.';

-- Rollback before commit leaves data untouched. After rollout, reverting requires
-- only a new migration dropping these functions; stored positions remain valid.
commit;
