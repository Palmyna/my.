begin;

alter table public.collection_items add column is_hidden boolean not null default false;
alter table public.collection_items add constraint collection_items_hidden_origin_check
  check (not is_hidden or origin = 'automatic');
comment on column public.collection_items.is_hidden is
  'Owner masking of automatic items only. New/converted items visible; retained automatic identities preserve state. No effect on order or possession.';

-- Extend the existing parent invariant. Parent type is already immutable under
-- collections_check_update, including privileged writes; no second mechanism.
create or replace function private.check_collection_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.origin = 'automatic' and exists (
    select 1 from public.collections c
    where c.id = new.collection_id and c.collection_type = 'free'
  ) then
    raise exception using errcode = '23514', message = 'Free collections only contain manual items';
  end if;
  if new.is_hidden and (new.origin <> 'automatic' or not exists (
    select 1 from public.collections c where c.id = new.collection_id and c.collection_type = 'automatic'
  )) then
    raise exception using errcode = '23514', message = 'collection_item_hidden_invalid';
  end if;
  if tg_op = 'UPDATE' then
    if old.origin = 'manual' and new.origin = 'automatic' and new.is_hidden then
      raise exception using errcode = '23514', message = 'collection_item_hidden_invalid';
    end if;
  end if;
  return new;
end;
$$;

create function public.set_collection_item_hidden(
  p_collection_id uuid, p_collection_item_id uuid, p_is_hidden boolean,
  p_expected_revision bigint, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  parent_type text;
  revision bigint;
  item_origin text;
  hidden boolean;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  -- No catalogue dependency. Lock parent, then reread ownership/mode/revision
  -- after any wait, as in all structural writers and receipt consultation.
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  select order_contract_version, collection_type, personal_revision into contract_version, parent_type, revision
    from public.collections where id = p_collection_id and owner_id = caller_id;
  if not found then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;
  if parent_type <> 'automatic' then
    raise exception using errcode = '23514', message = 'collection_item_hidden_invalid';
  end if;
  if p_collection_item_id is null or p_is_hidden is null or p_operation_id is null
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'set_collection_item_hidden', p_collection_id, p_collection_item_id,
    p_is_hidden, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'hide' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  select origin, is_hidden into item_origin, hidden from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'collection_item_unavailable';
  end if;
  if item_origin <> 'automatic' then
    raise exception using errcode = '23514', message = 'collection_item_hidden_invalid';
  end if;
  if hidden <> p_is_hidden then
    update public.collection_items set is_hidden = p_is_hidden
      where id = p_collection_item_id and collection_id = p_collection_id;
    revision := revision + 1;
    update public.collections set personal_revision = revision where id = p_collection_id;
  end if;
  result := jsonb_build_object('operation_id', p_operation_id,
    'outcome', case when hidden = p_is_hidden then 'noop' else 'changed' end,
    'personal_revision', revision::text, 'collection_item_id', p_collection_item_id);
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'hide', request_hash, revision, result);
  return result;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    return private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm in ('order_contract_upgrade_required', 'collection_item_hidden_invalid')) then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$$;
revoke all on function public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid) to authenticated;

create or replace function public.get_collection_content_v2(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'order_contract_version', c.order_contract_version,
    'personal_revision', c.personal_revision::text,
    'items', (
      select coalesce(jsonb_agg(content.item || jsonb_build_object('is_hidden', persisted.is_hidden)
        order by content.ordinal), '[]'::jsonb)
      from jsonb_array_elements(public.get_collection_content(c.id))
        with ordinality as content(item, ordinal)
      join public.collection_items persisted on persisted.collection_id = c.id
        and persisted.id = (content.item->>'collection_item_id')::uuid
    )
  ) from public.collections c where c.id = p_collection_id;
$$;
comment on function public.get_collection_content_v2(uuid) is
  'Complete snapshot for contracts 1/2, including hidden items; unchanged v1 fields/order/owner possession, exact revision and persisted is_hidden. Invisible parent returns SQL NULL.';

create or replace view public.dashboard_collections with (security_invoker = true) as
select collection.id as collection_id,
  collection.name,
  collection.collection_type,
  case when collection.owner_id = (select auth.uid()) then 'owned'::text else 'shared'::text end as access,
  collection.automatic_target_type as target_type,
  case collection.automatic_target_type
    when 'pokemon' then pokemon.name_fr
    when 'set' then target_set.name_fr
    else null::text
  end as target_name,
  progress.owned_count,
  progress.total_count,
  case when collection.automatic_target_type = 'pokemon' then pokemon.primary_type else null::text end as target_primary_type,
  case when collection.automatic_target_type = 'pokemon' then pokemon.secondary_type else null::text end as target_secondary_type,
  case collection.automatic_target_type
    when 'pokemon' then collection.target_pokemon_id::text
    when 'set' then collection.target_set_id::text
    else null::text
  end as target_id
from public.collections as collection
left join public.pokemon as pokemon on pokemon.id = collection.target_pokemon_id
left join public.tcg_sets as target_set on target_set.id = collection.target_set_id
cross join lateral (
  select count(*) as total_count,
    count(*) filter (where exists (
      select 1 from public.physical_copies as copy
      where copy.user_id = collection.owner_id and copy.variant_id = item.variant_id
    )) as owned_count
  from public.collection_items as item
  where item.collection_id = collection.id and not (item.origin = 'automatic' and item.is_hidden)
) as progress;
comment on view public.dashboard_collections is
  'Read-only Dashboard/overview/share summaries under caller RLS. Both counts exclude hidden automatic items; owner-copy EXISTS counts each included item once. No persisted counters.';

-- Rollback: withdraw the new mutation by revoking its EXECUTE in an additive
-- migration. Preserve is_hidden, revisions, journal, receipts and coherent
-- readers/progression. Never reopen legacy writers for contract 2.
commit;
