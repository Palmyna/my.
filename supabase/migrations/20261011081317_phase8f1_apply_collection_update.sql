begin;

-- A stale preview is definitive, like the 8B.8 revision conflict. PostgREST
-- must not retry SQLSTATE 40001 internally with the same obsolete token.
create function private.raise_collection_preview_stale()
returns jsonb language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if nullif(pg_catalog.current_setting('request.method', true), '') is not null then
    raise sqlstate 'PGRST' using
      message = '{"code":"40001","message":"preview_stale","details":null,"hint":null}',
      detail = '{"status":409,"headers":{}}';
  end if;
  raise exception using errcode = '40001', message = 'preview_stale';
end;
$$;
revoke all on function private.raise_collection_preview_stale() from public, anon, authenticated, service_role;

create function public.apply_collection_update(
  p_collection_id uuid, p_preview_token jsonb, p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  parent public.collections;
  context private.collection_update_context;
  token jsonb;
  plan jsonb;
  request_hash text;
  receipt private.collection_operation_receipts;
  created_items jsonb;
  revision bigint;
  result jsonb;
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    return private.raise_collection_structure_conflict();
  end if;

  -- Receipt retries need current authorization, but never the old catalogue or
  -- old live items. Do not call the full 8E context reader before this gate.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
  perform 1 from public.collections where id = p_collection_id and owner_id = caller_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  select c.* into parent from public.collections c where c.id = p_collection_id and c.owner_id = caller_id;
  if not found or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_update_unavailable';
  end if;
  if parent.collection_type <> 'automatic' then
    raise exception using errcode = '23514', message = 'collection_update_ineligible';
  end if;
  if parent.order_contract_version <> 2 then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
  end if;

  if p_operation_id is null or pg_catalog.jsonb_typeof(p_preview_token) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;
  if (select pg_catalog.array_agg(k order by k) from pg_catalog.jsonb_object_keys(p_preview_token) k)
      is distinct from array['applied_target_version','contract_version','personal_revision','plan_hash','target_hash','target_version']
    or p_preview_token->'contract_version' is distinct from '1'::jsonb
    or exists (select 1 from pg_catalog.unnest(array['applied_target_version','target_version','personal_revision','target_hash','plan_hash']) k
      where pg_catalog.jsonb_typeof(p_preview_token->k) is distinct from 'string')
    or (p_preview_token->>'applied_target_version') !~ '^[1-9][0-9]{0,18}$'
    or (p_preview_token->>'target_version') !~ '^[1-9][0-9]{0,18}$'
    or (p_preview_token->>'personal_revision') !~ '^(0|[1-9][0-9]{0,18})$'
    or (p_preview_token->>'target_hash') !~ '^[a-f0-9]{64}$'
    or (p_preview_token->>'plan_hash') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;
  begin
    token := pg_catalog.jsonb_build_object('contract_version',1,
      'applied_target_version',(p_preview_token->>'applied_target_version')::bigint::text,
      'target_version',(p_preview_token->>'target_version')::bigint::text,
      'target_hash',p_preview_token->>'target_hash',
      'personal_revision',(p_preview_token->>'personal_revision')::bigint::text,
      'plan_hash',p_preview_token->>'plan_hash');
  exception when numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end;
  -- Format 1 request fingerprint: SHA256 of UTF8 PostgreSQL JSONB tuple text.
  -- JSONB normalizes object key order; exact decimal strings remain exact.
  request_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('apply_collection_update',p_collection_id,token)::text,'UTF8')),'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'apply' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;

  -- Locks above are reentrant. The unchanged 8E reader rechecks the parent and
  -- verifies one current canonical input; the unchanged planner owns all replay.
  context := private.read_collection_update_context(p_collection_id,true);
  plan := private.collection_update_plan(context);
  if token is distinct from plan->'token' then
    return private.raise_collection_preview_stale();
  end if;
  if not context.update_available then
    raise exception using errcode = '23514', message = 'collection_update_not_available';
  end if;

  delete from public.collection_items i where i.collection_id = p_collection_id
    and i.id in (select (e->>'collection_item_id')::uuid
      from pg_catalog.jsonb_array_elements(plan->'removed') e);

  -- Only placeholders allocate UUIDs. Positions come directly from the full
  -- plan's ordinality, never from another sort or merge. Introductions stay NULL.
  with inserted as (
    insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,
      sort_position,is_hidden,introduced_revision)
    select pg_catalog.gen_random_uuid(),p_collection_id,(e->>'variant_id')::bigint,'automatic',
      (e->>'automatic_rank')::bigint,n::numeric(40,20),false,null
    from pg_catalog.jsonb_array_elements(plan->'final_order') with ordinality a(e,n)
    where e->'collection_item_id' = 'null'::jsonb
    returning id,variant_id,automatic_rank
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'variant_id',variant_id::text,'collection_item_id',id) order by automatic_rank),'[]'::jsonb)
    into created_items from inserted;

  -- Existing identities include converted manuals and hidden automatics.
  -- Updating origin/rank/order/mask does not touch introductions or intentions.
  update public.collection_items i set origin=e->>'origin',
    automatic_rank=(e->>'automatic_rank')::bigint,sort_position=n::numeric(40,20),
    is_hidden=(e->>'is_hidden')::boolean
  from pg_catalog.jsonb_array_elements(plan->'final_order') with ordinality a(e,n)
  where i.collection_id = p_collection_id and i.id = (e->>'collection_item_id')::uuid;

  revision := context.personal_revision + 1;
  update public.collections set applied_target_version=context.target_version,personal_revision=revision
    where id = p_collection_id;
  result := pg_catalog.jsonb_build_object('operation_id',p_operation_id,'outcome','applied',
    'personal_revision',revision::text,'applied_target_version',context.target_version::text,
    'created_items',created_items);
  insert into private.collection_operation_receipts(collection_id,operation_id,kind,request_hash,accepted_revision,result)
    values(p_collection_id,p_operation_id,'apply',request_hash,revision,result);
  return result;
exception
  when serialization_failure then
    -- Preserve the business code if a SQL-direct stale-token error reaches here.
    if sqlerrm = 'preview_stale' then return private.raise_collection_preview_stale(); end if;
    return private.raise_collection_structure_conflict();
  when deadlock_detected or lock_not_available then
    return private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_update_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm in ('collection_update_ineligible','order_contract_upgrade_required',
        'collection_update_state_invalid','collection_update_not_available'))
      or sqlstate = 'PGRST' then raise; end if;
    raise exception using errcode = 'XX000', message = 'collection_update_unexpected';
end;
$$;
revoke all on function public.apply_collection_update(uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.apply_collection_update(uuid,jsonb,uuid) to authenticated;
comment on function public.apply_collection_update(uuid,jsonb,uuid) is
  '8F.1 owner aal2/profile automatic contract-2 writer. READ COMMITTED, shared catalogue 771402 before parent FOR UPDATE, current authorization then historical receipt before canonical reads. Strict six-field normalized token, unchanged 8E context/plan, exact 1..N plan materialization, one revision/version/atomic apply receipt. New UUIDs only for placeholders; no new move intent, copy/note or notification write.';

-- Additive forward path. Software rollback: revoke this RPC in a future
-- migration and close callers. Retain committed items, versions and receipts;
-- no legacy conversion, data backfill or destructive rollback is introduced.
commit;
