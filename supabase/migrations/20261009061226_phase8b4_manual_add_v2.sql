begin;

-- Initial identity belongs to the item's lifecycle, including after conversion.
-- NULL legacy introductions and native automatic items remain legal.
create function private.protect_collection_item_introduction()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.introduced_revision is not null
    and exists (select 1 from public.collections where id = old.collection_id and order_contract_version = 2)
    and (new.id is distinct from old.id or new.collection_id is distinct from old.collection_id
      or new.variant_id is distinct from old.variant_id
      or new.introduced_revision is distinct from old.introduced_revision) then
    raise exception using errcode = '23514', message = 'collection_item_introduction_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_collection_item_introduction() from public, anon, authenticated, service_role;
create trigger collection_items_introduction_immutable
  before update of id, collection_id, variant_id, introduced_revision on public.collection_items
  for each row execute function private.protect_collection_item_introduction();

-- Check final state rather than the intermediate item-without-journal state.
-- Validate both sides: a manual_add on a native automatic item is also invalid.
-- PK (collection_id,sequence) plus the matching subject makes introductions unique.
create function private.check_collection_initial_placement()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  parent_ids uuid[];
  parent_id uuid;
  revision bigint;
begin
  if tg_table_name = 'collections' then
    parent_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    parent_ids := array[new.collection_id];
  elsif tg_op = 'DELETE' then
    parent_ids := array[old.collection_id];
  else
    parent_ids := array[old.collection_id, new.collection_id];
  end if;
  for parent_id in select distinct id from unnest(parent_ids) id order by id loop
    -- No catalogue access. Serialize privileged structural writes as well, then
    -- reread after a possible wait. A deleted parent/subject is legal (cascade).
    perform 1 from public.collections where id = parent_id and order_contract_version = 2 for update;
    if not found then continue; end if;
    select personal_revision into revision from public.collections where id = parent_id and order_contract_version = 2;
    if not found then continue; end if;
    if exists (
      select 1 from public.collection_items i
      where i.collection_id = parent_id and (i.origin = 'manual' or i.introduced_revision is not null)
        and (i.introduced_revision is null or i.introduced_revision > revision
          or (select count(*) from private.collection_order_intents e
            where e.collection_id = parent_id and e.subject_item_id = i.id and e.kind = 'manual_add') <> 1
          or not exists (select 1 from private.collection_order_intents e
            where e.collection_id = parent_id and e.subject_item_id = i.id
              and e.kind = 'manual_add' and e.sequence = i.introduced_revision))
    ) or exists (
      select 1 from private.collection_order_intents e
      join public.collection_items i on i.collection_id = e.collection_id and i.id = e.subject_item_id
      where e.collection_id = parent_id
        and ((e.kind = 'manual_add' and e.sequence is distinct from i.introduced_revision)
          or e.sequence < i.introduced_revision)
    ) then
      raise exception using errcode = '23514', message = 'collection_initial_placement_invalid';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.check_collection_initial_placement() from public, anon, authenticated, service_role;
create constraint trigger collection_items_initial_placement
  after insert or update of id, collection_id, origin, introduced_revision or delete on public.collection_items
  deferrable initially deferred for each row execute function private.check_collection_initial_placement();
create constraint trigger collection_intents_initial_placement
  after insert or update or delete on private.collection_order_intents
  deferrable initially deferred for each row execute function private.check_collection_initial_placement();
create constraint trigger collections_initial_placement
  after insert or update of order_contract_version, personal_revision on public.collections
  deferrable initially deferred for each row execute function private.check_collection_initial_placement();

create function public.add_manual_collection_item_v2(
  p_collection_id uuid, p_variant_id bigint, p_placement text,
  p_expected_revision bigint, p_operation_id uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
  item_id uuid;
  current_ids uuid[];
  normalized_anchor uuid;
  fallback_ids uuid[];
  first_position numeric;
  last_position numeric;
  candidate numeric;
  has_ties boolean;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- Catalogue -> parent -> items -> private writes, never the reverse.
  -- Shared lock held through commit prevents eligibility from a partial sync.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  select order_contract_version, personal_revision into contract_version, revision
    from public.collections where id = p_collection_id and owner_id = caller_id;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;
  if p_variant_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_placement is null or p_placement not in ('start', 'end') then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Same versioned canonical tuple and receipt store as reorder v2. Include the
  -- exact BIGINT request, never the destination normalized from mutable state.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'add_manual_collection_item_v2', p_collection_id, p_variant_id::text,
    p_placement, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'add' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  if exists (select 1 from public.collection_items where collection_id = p_collection_id and variant_id = p_variant_id) then
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  -- Exactly the legacy eligibility predicates: no target/canonical restriction.
  if not exists (
    select 1 from public.catalog_variants v
    join public.source_cards card on card.id = v.source_card_id
    join public.tcg_sets card_set on card_set.id = card.set_id
    where v.id = p_variant_id and v.is_active and v.french_availability = 'confirmed'
      and card.is_active and card_set.is_active
  ) then
    raise exception using errcode = 'P0002', message = 'manual_variant_unavailable';
  end if;

  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[]),
    min(sort_position), max(sort_position), count(*) <> count(distinct sort_position)
  into current_ids, first_position, last_position, has_ties
  from public.collection_items where collection_id = p_collection_id;
  normalized_anchor := case when p_placement = 'start' then current_ids[1] else null end;
  fallback_ids := case when normalized_anchor is null then '{}'::uuid[]
    else current_ids[2:cardinality(current_ids)] end;
  -- Exact legacy NUMERIC allocation. Rebalance only on ties/overflow, keeping
  -- the complete pre-add permutation and changing no origin or canonical rank.
  candidate := case when cardinality(current_ids) = 0 then 1
    when p_placement = 'start' then first_position - 1 else last_position + 1 end;
  if has_ties or abs(candidate) >= 100000000000000000000 then
    update public.collection_items item set sort_position = ordered.rank::numeric(40,20)
    from unnest(current_ids) with ordinality as ordered(id, rank)
    where item.id = ordered.id and item.collection_id = p_collection_id
      and item.sort_position is distinct from ordered.rank::numeric(40,20);
    candidate := case when p_placement = 'start' then 0 else cardinality(current_ids) + 1 end;
  end if;
  revision := revision + 1;
  insert into public.collection_items(collection_id, variant_id, origin, automatic_rank, sort_position, introduced_revision)
  values (p_collection_id, p_variant_id, 'manual', null, candidate, revision)
  on conflict (collection_id, variant_id) do nothing returning id into item_id;
  if not found then
    raise exception using errcode = '23505', message = 'already_present';
  end if;
  update public.collections set personal_revision = revision where id = p_collection_id;
  insert into private.collection_order_intents(
    collection_id, sequence, operation_id, subject_item_id, kind, destination, anchor_item_id, fallback_item_ids
  ) values (
    p_collection_id, revision, p_operation_id, item_id, 'manual_add',
    case when normalized_anchor is null then 'end' else 'before' end, normalized_anchor, fallback_ids
  );
  result := jsonb_build_object(
    'operation_id', p_operation_id, 'outcome', 'changed',
    'personal_revision', revision::text, 'collection_item_id', item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'add', request_hash, revision, result);
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_variant_unavailable')
      or (sqlstate = '23505' and sqlerrm in ('already_present', 'operation_id_conflict'))
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$$;
revoke all on function public.add_manual_collection_item_v2(uuid, bigint, text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_manual_collection_item_v2(uuid, bigint, text, bigint, uuid) to authenticated;
comment on function public.add_manual_collection_item_v2(uuid, bigint, text, bigint, uuid) is
  'Owner aal2/profile, contract 2 READ COMMITTED only. Catalogue-before-parent locks, exact manual placement, mandatory initial intent/revision and atomic v2 idempotency receipt.';
comment on column public.collection_items.introduced_revision is
  'Initial manual placement revision; required with matching manual_add on contract 2, immutable and retained on conversion. Legacy NULL remains legal.';
comment on table private.collection_order_intents is
  'Chronological v2 placements. Reorder and manual add capture immutable server R1; deferred initial placement integrity includes converted items. Subject/parent deletion cascades.';
comment on table private.collection_operation_receipts is
  'Collection-scoped atomic v2 reorder/add idempotency receipts retained until parent deletion; retry requires current owner and identical canonical parameters.';

-- No activation, backfill or existing object rewrite. Before commit: rollback.
-- After commit: retain data/invariants/legacy guards; close the new RPC in a
-- future migration if needed. Never downgrade a journalled collection to v1.
commit;
