begin;

-- Additive business operations. Browser table writes and existing RLS stay closed.
create function public.add_manual_collection_item(
  p_collection_id uuid, p_variant_id bigint, p_placement text default 'end'
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  item_id uuid;
  first_position numeric;
  last_position numeric;
  candidate numeric;
  item_count bigint;
  has_ties boolean;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  -- Same parent lock and isolation contract as reorder 6A.3. Subsequent statements
  -- see committed structural changes after waiting; the lock lasts until commit.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  perform 1 from public.collections
    where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if p_placement is null or p_placement not in ('start', 'end') then
    raise exception using errcode = '22023', message = 'manual_item_invalid_placement';
  end if;
  -- Existing items keep their identity/origin/order, even if now ineligible.
  if exists (select 1 from public.collection_items
    where collection_id = p_collection_id and variant_id = p_variant_id) then
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  if not exists (
    select 1 from public.catalog_variants v
    join public.source_cards card on card.id = v.source_card_id
    join public.tcg_sets card_set on card_set.id = card.set_id
    where v.id = p_variant_id and v.is_active and v.french_availability = 'confirmed'
      and card.is_active and card_set.is_active
  ) then
    raise exception using errcode = 'P0002', message = 'manual_variant_unavailable';
  end if;

  select min(sort_position), max(sort_position), count(*),
    count(*) <> count(distinct sort_position)
  into first_position, last_position, item_count, has_ties
  from public.collection_items where collection_id = p_collection_id;
  candidate := case when item_count = 0 then 1
    when p_placement = 'start' then first_position - 1 else last_position + 1 end;
  -- Unconstrained NUMERIC arithmetic first: never overflow NUMERIC(40,20).
  -- Repair ties in the authoritative UUID order, without changing origin/rank.
  if has_ties or abs(candidate) >= 100000000000000000000 then
    with ordered as (
      select id, row_number() over (order by sort_position, id) as rank
      from public.collection_items where collection_id = p_collection_id
    )
    update public.collection_items item set sort_position = ordered.rank::numeric(40,20)
    from ordered where item.id = ordered.id and item.collection_id = p_collection_id
      and item.sort_position is distinct from ordered.rank::numeric(40,20);
    candidate := case when p_placement = 'start' then 0 else item_count + 1 end;
  end if;

  insert into public.collection_items(collection_id, variant_id, origin, automatic_rank, sort_position)
  values (p_collection_id, p_variant_id, 'manual', null, candidate)
  on conflict (collection_id, variant_id) do nothing
  returning id into item_id;
  if not found then
    -- UNIQUE is the final arbiter, including writers outside these RPCs.
    -- Raising also rolls back any rebalance performed by this failed call.
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  return item_id;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'manual_item_invalid_placement')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_variant_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'already_present') then raise; end if;
    raise exception using errcode = 'XX000', message = 'manual_item_unexpected';
end;
$$;

create function public.remove_manual_collection_item(p_collection_id uuid, p_collection_item_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  item_origin text;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  perform 1 from public.collections
    where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  select origin into item_origin from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'manual_item_unavailable';
  end if;
  if item_origin <> 'manual' then
    raise exception using errcode = '23514', message = 'automatic_item_removal_forbidden';
  end if;
  delete from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id and origin = 'manual';
  -- No compaction; copies belong to (user, variant), never to collection_items.
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_item_unavailable')
      or (sqlstate = '23514' and sqlerrm = 'automatic_item_removal_forbidden') then raise; end if;
    raise exception using errcode = 'XX000', message = 'manual_item_unexpected';
end;
$$;

revoke all on function public.add_manual_collection_item(uuid, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.remove_manual_collection_item(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_manual_collection_item(uuid, bigint, text) to authenticated;
grant execute on function public.remove_manual_collection_item(uuid, uuid) to authenticated;
comment on function public.add_manual_collection_item(uuid, bigint, text) is
  'Owner aal2/profile only. Add one eligible exact BIGINT variant as manual, rank NULL, at start/end (default end). Parent lock serializes with reorder/removal/deletion; duplicates raise already_present. Returns item UUID.';
comment on function public.remove_manual_collection_item(uuid, uuid) is
  'Owner aal2/profile only. Parent lock serializes structural writes. Remove only a manual item from this collection; automatic items refused, physical copies and remaining positions preserved.';

-- Atomic migration; no existing rows rewritten. Old readers/reorder remain valid.
-- Rollback after rollout: new migration dropping only these two RPCs once unused.
-- Already-added items remain valid; do not delete user data to roll back the API.
commit;
