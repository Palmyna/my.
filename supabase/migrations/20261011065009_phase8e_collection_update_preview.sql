begin;

-- One locked, verified snapshot for both public readers and the future 8F caller.
-- No business DML, UUID reservation, receipt or preview storage.
create type private.collection_update_context as (
  collection_id uuid,
  order_contract_version smallint,
  applied_target_version bigint,
  target_version bigint,
  target_hash text,
  personal_revision bigint,
  update_available boolean,
  canonical private.collection_order_canonical_entry[],
  items private.collection_order_item_entry[],
  intents private.collection_order_intents[]
);
revoke all on type private.collection_update_context from public, anon, authenticated, service_role;

create function private.read_collection_update_context(p_collection_id uuid, p_require_v2 boolean)
returns private.collection_update_context
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  parent public.collections;
  context private.collection_update_context;
  target_id bigint;
  target_ids bigint[];
  applied_ids bigint[];
  structure_hash text;
  automatic_count bigint;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    perform private.raise_collection_structure_conflict();
  end if;

  -- Before ANY catalogue read and before the parent. Sync never locks a parent.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  -- Fresh READ COMMITTED statement after lock waits, including current profile.
  select c.* into parent from public.collections c where c.id = p_collection_id and c.owner_id = caller_id;
  if not found or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  if parent.collection_type <> 'automatic' then
    raise exception using errcode = '23514', message = 'collection_update_ineligible';
  end if;
  if p_require_v2 and parent.order_contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;
  target_id := case parent.automatic_target_type when 'pokemon' then parent.target_pokemon_id
    when 'set' then parent.target_set_id end;
  if target_id is null or parent.applied_target_version is null or parent.applied_target_version < 1
    or (parent.automatic_target_type = 'pokemon' and not exists (select 1 from public.pokemon where id = target_id))
    or (parent.automatic_target_type = 'set' and not exists (select 1 from public.tcg_sets where id = target_id)) then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;
  select s.generation_version, s.content_hash into context.target_version, context.target_hash
    from public.automatic_target_states s where s.target_type = parent.automatic_target_type
      and ((s.target_type = 'pokemon' and s.pokemon_id = target_id) or (s.target_type = 'set' and s.set_id = target_id));
  if not found or context.target_version < parent.applied_target_version
    or context.target_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;

  -- Call canonical once; the verified array is the actual engine input.
  select coalesce(array_agg(row(c.variant_id,c.automatic_rank)::private.collection_order_canonical_entry
      order by c.automatic_rank), '{}'::private.collection_order_canonical_entry[]),
    coalesce(array_agg(c.variant_id order by c.automatic_rank), '{}'::bigint[]),
    encode(sha256(convert_to('[' || coalesce(string_agg(to_json(c.variant_id::text)::text,
      ',' order by c.automatic_rank), '') || ']', 'UTF8')), 'hex')
  into context.canonical, target_ids, structure_hash
  from private.canonical_collection_variants(parent.automatic_target_type, target_id) c;
  if structure_hash is distinct from context.target_hash
    or exists (select 1 from unnest(context.canonical) with ordinality c where c.automatic_rank <> c.ordinality)
    or cardinality(target_ids) <> (select count(distinct c.variant_id) from unnest(context.canonical) c) then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;
  select coalesce(array_agg(row(i.collection_id,i.id,i.variant_id,i.origin,i.automatic_rank,
      i.introduced_revision,i.is_hidden)::private.collection_order_item_entry order by i.id),
      '{}'::private.collection_order_item_entry[])
    into context.items from public.collection_items i where i.collection_id = p_collection_id;
  select count(*), coalesce(array_agg(i.variant_id order by i.automatic_rank), '{}'::bigint[])
    into automatic_count, applied_ids from unnest(context.items) i where i.origin = 'automatic';
  if exists (select 1 from unnest(context.items) i where
      i.origin not in ('manual','automatic') or (i.origin = 'manual' and (i.automatic_rank is not null or i.is_hidden))
      or (i.origin = 'automatic' and (i.automatic_rank is null or i.automatic_rank < 1)))
    or (select count(distinct i.automatic_rank) <> automatic_count
        or coalesce(max(i.automatic_rank), 0) <> automatic_count
      from unnest(context.items) i where i.origin = 'automatic')
    or (select count(distinct i.variant_id) <> cardinality(context.items) from unnest(context.items) i)
    -- Same version with a different materialized canonical is not an update.
    or (context.target_version = parent.applied_target_version and applied_ids <> target_ids) then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;
  context.collection_id := parent.id;
  context.order_contract_version := parent.order_contract_version;
  context.applied_target_version := parent.applied_target_version;
  context.personal_revision := parent.personal_revision;
  context.update_available := context.target_version > parent.applied_target_version and applied_ids <> target_ids;
  context.intents := '{}'::private.collection_order_intents[];
  if p_require_v2 then
    select coalesce(array_agg(e order by e.sequence), '{}'::private.collection_order_intents[])
      into context.intents from private.collection_order_intents e where e.collection_id = p_collection_id;
    if exists (select 1 from unnest(context.intents) e where e.sequence > parent.personal_revision)
      or exists (select 1 from unnest(context.items) i where i.introduced_revision > parent.personal_revision) then
      raise exception using errcode = '23514', message = 'collection_update_state_invalid';
    end if;
  end if;
  return context;
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    perform private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_update_unavailable')
      or (sqlstate = '23514' and sqlerrm in ('collection_update_ineligible', 'order_contract_upgrade_required', 'collection_update_state_invalid'))
      or sqlstate = 'PGRST' then raise; end if;
    raise exception using errcode = 'XX000', message = 'collection_update_unexpected';
end;
$$;
revoke all on function private.read_collection_update_context(uuid,boolean) from public, anon, authenticated, service_role;

-- Version 1 serialization: UTF8 of PostgreSQL JSONB text of this positional tuple.
-- Arrays preserve delta/structural order. Only exact strings, boolean, null and
-- the numeric format version occur. Objects are converted to fixed-field tuples.
create function private.collection_update_plan_hash(p_collection_id uuid, p_plan jsonb)
returns text language sql immutable parallel safe security invoker set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_array('my.collection-update-plan', 1, p_collection_id,
    (select coalesce(jsonb_agg(jsonb_build_array(e->'variant_id',e->'automatic_rank') order by n),'[]')
      from jsonb_array_elements(p_plan->'added') with ordinality a(e,n)),
    (select coalesce(jsonb_agg(jsonb_build_array(e->'collection_item_id',e->'variant_id',e->'automatic_rank') order by n),'[]')
      from jsonb_array_elements(p_plan->'removed') with ordinality a(e,n)),
    (select coalesce(jsonb_agg(jsonb_build_array(e->'collection_item_id',e->'variant_id',e->'automatic_rank') order by n),'[]')
      from jsonb_array_elements(p_plan->'converted') with ordinality a(e,n)),
    (select coalesce(jsonb_agg(jsonb_build_array(e->'collection_item_id',e->'variant_id',e->'previous_rank',e->'next_rank') order by n),'[]')
      from jsonb_array_elements(p_plan->'rank_changes') with ordinality a(e,n)),
    (select coalesce(jsonb_agg(jsonb_build_array(e->'collection_item_id',e->'variant_id',e->'origin',e->'automatic_rank',e->'is_hidden') order by n),'[]')
      from jsonb_array_elements(p_plan->'final_order') with ordinality a(e,n))
  )::text,'UTF8')),'hex');
$$;
revoke all on function private.collection_update_plan_hash(uuid,jsonb) from public, anon, authenticated, service_role;

create function private.collection_update_plan(p_context private.collection_update_context)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  plan jsonb;
begin
  plan := private.merge_collection_relative_order(p_context.collection_id, p_context.canonical, p_context.items, p_context.intents) - 'replay';
  return plan || jsonb_build_object('collection_id',p_context.collection_id,
    'update_available',p_context.update_available,'target_empty',cardinality(p_context.canonical)=0,
    'token',jsonb_build_object('contract_version',1,'applied_target_version',p_context.applied_target_version::text,
      'target_version',p_context.target_version::text,'target_hash',p_context.target_hash,
      'personal_revision',p_context.personal_revision::text,'plan_hash',private.collection_update_plan_hash(p_context.collection_id,plan)));
exception when others then
  if sqlstate = '22023' and sqlerrm = 'collection_order_input_invalid' then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;
  raise exception using errcode = 'XX000', message = 'collection_update_unexpected';
end;
$$;
revoke all on function private.collection_update_plan(private.collection_update_context) from public, anon, authenticated, service_role;

create function public.get_collection_update_status(p_collection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare context private.collection_update_context;
begin
  context := private.read_collection_update_context(p_collection_id,false);
  return jsonb_build_object('collection_id',context.collection_id,'order_contract_version',context.order_contract_version,
    'applied_target_version',context.applied_target_version::text,'target_version',context.target_version::text,
    'target_hash',context.target_hash,'update_available',context.update_available);
end;
$$;
create function public.preview_collection_update(p_collection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  return private.collection_update_plan(private.read_collection_update_context(p_collection_id,true));
end;
$$;
revoke all on function public.get_collection_update_status(uuid), public.preview_collection_update(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_collection_update_status(uuid), public.preview_collection_update(uuid) to authenticated;
comment on function public.get_collection_update_status(uuid) is
  '8E pure owner aal2/profile automatic status, legacy readable. READ COMMITTED, shared catalogue 771402 before parent FOR UPDATE and authoritative reread. Compare applied automatic ranks to verified current ordered canonical; versions alone do not imply a useful update.';
comment on function public.preview_collection_update(uuid) is
  '8E pure owner aal2/profile automatic contract 2 preview. Same locked snapshot, complete items (hidden included) and chronological live journal through unchanged 8B.2 engine. Exact decimal BIGINTs, NULL new identities, version-1 deterministic plan SHA256. No writes, UUID allocation or notification acknowledgement.';
comment on function private.collection_update_plan_hash(uuid,jsonb) is
  'Format v1: SHA256 UTF8 PostgreSQL JSONB text of [my.collection-update-plan,1,parent,added tuples [variant,rank],removed tuples [item,variant,rank],converted tuples [item,variant,rank],rank_changes tuples [item,variant,previous,next],final tuples [item/null,variant,origin,rank/null,hidden]]. Array order preserved; no labels, timestamps, copies, notes, random UUIDs. Six token fields compared after recalculation in future 8F.';

-- Forward: additive readers only. Rollback software: close callers/revoke public
-- EXECUTE in a future additive migration. Keep all existing data and v1/v2 guards.
commit;
