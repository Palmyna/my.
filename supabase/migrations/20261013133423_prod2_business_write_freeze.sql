begin;

-- One authoritative row. Never read a JWT, header, role GUC or user metadata
-- to grant an exception. Only the actual PostgreSQL session identity counts.
create table private.business_write_freeze (
  singleton boolean primary key default true check (singleton),
  frozen boolean not null default false,
  revision bigint not null default 0 check (revision >= 0),
  changed_at timestamptz not null default clock_timestamp(),
  changed_by text not null default session_user
);
alter table private.business_write_freeze enable row level security;
revoke all on table private.business_write_freeze from public, anon, authenticated,
  service_role, supabase_auth_admin, my_notification_publisher;
insert into private.business_write_freeze(singleton) values (true);

-- INVOKER + private ACL + session identity: even a future exposed definer
-- cannot turn an authenticator/service-role request into an operator session.
create function private.set_business_write_freeze(p_frozen boolean)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare state private.business_write_freeze;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'business_write_freeze_operator_required';
  end if;
  if p_frozen is null then
    raise exception using errcode = '22023', message = 'business_write_freeze_input_invalid';
  end if;
  -- UPDATE conflicts with every writer's FOR SHARE, held through COMMIT.
  -- Always update, including retries: a stale RR/SERIALIZABLE snapshot fails
  -- rather than admitting a write using an earlier open state.
  update private.business_write_freeze set frozen = p_frozen, revision = revision + 1,
    changed_at = clock_timestamp(), changed_by = session_user
    where singleton returning * into state;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  return to_jsonb(state) - 'singleton';
end;
$$;

create function private.get_business_write_freeze()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare state private.business_write_freeze;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'business_write_freeze_operator_required';
  end if;
  select * into state from private.business_write_freeze where singleton;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  return to_jsonb(state) - 'singleton';
end;
$$;

create function private.require_business_writes_open()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare closed boolean;
begin
  -- Trusted direct SQL only. SECURITY DEFINER changes current_user, never
  -- session_user. Auth connects as supabase_auth_admin; REST as authenticator.
  if session_user in ('postgres', 'supabase_admin') then return; end if;
  select frozen into closed from private.business_write_freeze where singleton for share;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  if closed then
    raise exception using errcode = 'PT503', message = 'business_writes_frozen';
  end if;
end;
$$;

create function private.guard_business_write_freeze()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Publisher has no direct table DML. Its two existing private functions
  -- can only publish/withdraw announcements. No exception on user states.
  if session_user = 'my_notification_publisher'
    and tg_table_schema = 'private' and tg_table_name = 'notification_announcements'
    and tg_op in ('INSERT', 'UPDATE') then return null; end if;
  perform private.require_business_writes_open();
  return null;
end;
$$;

revoke all on function private.set_business_write_freeze(boolean),
  private.get_business_write_freeze(), private.require_business_writes_open(),
  private.guard_business_write_freeze()
  from public, anon, authenticated, service_role, supabase_auth_admin, my_notification_publisher;
grant execute on function private.set_business_write_freeze(boolean), private.get_business_write_freeze()
  to postgres, supabase_admin;
-- supabase_admin is the platform's trusted superuser. No new role/member,
-- table privilege, schema usage or API privilege is added to any service role.

do $$
declare relation text;
begin
  foreach relation in array array[
    'public.pokemon', 'public.tcg_series', 'public.tcg_sets', 'public.source_cards',
    'public.catalog_variants', 'public.card_pokemon', 'public.automatic_target_states',
    'public.profiles', 'public.collections', 'public.collection_items', 'public.physical_copies',
    'public.collection_shares', 'public.user_preferences', 'public.collection_view_preferences',
    'private.catalog_entity_keys', 'private.catalog_overrides', 'private.catalog_sync_runs',
    'private.collection_order_intents', 'private.collection_operation_receipts',
    'private.collection_notification_reads', 'private.notification_announcements',
    'private.notification_announcement_states'
  ] loop
    execute format('create trigger business_write_freeze before insert or update or delete or truncate on %s
      for each statement execute function private.guard_business_write_freeze()', relation);
  end loop;
end;
$$;

-- Protect account creation/destruction before MY.'s row triggers, even when
-- there is no profile to mutate. Do not interfere with UPDATEs used by login,
-- email/password, MFA or session security. Auth is not a fully frozen service.
create trigger business_write_freeze before insert or delete on auth.users
  for each statement execute function private.guard_business_write_freeze();

comment on table private.business_write_freeze is
  'PROD.2 persistent ordinary business write freeze. Only direct trusted PostgreSQL operators. No expiry. Effective after setter transaction COMMIT; readers never take the barrier.';
comment on function private.require_business_writes_open() is
  'PROD.2 session_user boundary, not current_user/JWT/GUC. FOR SHARE of singleton through transaction end; missing state fails closed. PT503 maps to HTTP 503. No user EXECUTE.';
comment on function private.set_business_write_freeze(boolean) is
  'PROD.2 direct PostgreSQL operator only. UPDATE waits for admitted ordinary writers. Result inside a transaction is provisional until COMMIT; verify with a fresh connection. Never changes application permissions.';

-- Existing public writer definitions follow. Only entry barrier and PT503
-- propagation are added. Signatures, owners, ACLs, checks and business bodies
-- are preserved by CREATE OR REPLACE. Readers/receipt recovery remain pure.

CREATE OR REPLACE FUNCTION public.add_manual_collection_item(p_collection_id uuid, p_variant_id bigint, p_placement text DEFAULT 'end'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  item_id uuid;
  first_position numeric;
  last_position numeric;
  candidate numeric;
  item_count bigint;
  has_ties boolean;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  if exists (select 1 from public.collections
    where id = p_collection_id and order_contract_version = 2) then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
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
  when sqlstate 'PT503' then raise;
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'manual_item_invalid_placement')
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_variant_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'already_present') then raise; end if;
    raise exception using errcode = 'XX000', message = 'manual_item_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_manual_collection_item_v2(p_collection_id uuid, p_variant_id bigint, p_placement text, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  when sqlstate 'PT503' then raise;
  when serialization_failure or deadlock_detected or lock_not_available then
    return private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_variant_unavailable')
      or (sqlstate = '23505' and sqlerrm in ('already_present', 'operation_id_conflict'))
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_collection_update(p_collection_id uuid, p_preview_token jsonb, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  when sqlstate 'PT503' then raise;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_automatic_collection(p_name text, p_target_type text, p_target_id bigint)
 RETURNS TABLE(collection_id uuid, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  target_version bigint;
  target_hash text;
  structure_hash text;
  variant_ids bigint[];
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
  -- Definer bypasses RLS: identity, MFA and profile checks must be explicit.
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception using errcode = '42501', message = 'Authenticated aal2 session required';
  end if;
  if not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'MY. profile required';
  end if;
  if p_target_type is null or p_target_type not in ('pokemon', 'set') then
    raise exception using errcode = '22023', message = 'Invalid automatic target type';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'Automatic target ID is required';
  end if;

  -- Same key as the catalogue writer's exclusive lock. Held through transaction end.
  -- This precedes every target/state/structure read and allows concurrent creators.
  perform pg_catalog.pg_advisory_xact_lock_shared(771402);
  loop
    select existing.id into collection_id
    from public.collections as existing
    where existing.owner_id = caller_id and existing.collection_type = 'automatic'
      and existing.automatic_target_type = p_target_type
      and ((p_target_type = 'pokemon' and existing.target_pokemon_id = p_target_id)
        or (p_target_type = 'set' and existing.target_set_id = p_target_id))
    for key share;
    if found then
      created := false;
      return next;
      return;
    end if;

    if (p_target_type = 'pokemon' and not exists (select 1 from public.pokemon where id = p_target_id))
      or (p_target_type = 'set' and not exists (select 1 from public.tcg_sets where id = p_target_id)) then
      raise exception using errcode = 'P0002', message = 'Automatic target does not exist';
    end if;
    select state.generation_version, state.content_hash into target_version, target_hash
    from public.automatic_target_states as state
    where state.target_type = p_target_type
      and ((p_target_type = 'pokemon' and state.pokemon_id = p_target_id)
        or (p_target_type = 'set' and state.set_id = p_target_id));
    if not found then
      raise exception using errcode = 'P0002', message = 'automatic_target_state_missing';
    end if;

    -- Materialize once: the verified ordered IDs are exactly those inserted below.
    -- Compact JSON of decimal strings, including bigint IDs beyond JS safe integers.
    select coalesce(array_agg(canonical.variant_id order by canonical.automatic_rank), '{}'::bigint[]),
      encode(extensions.digest(convert_to('[' || coalesce(string_agg(
        to_json(canonical.variant_id::text)::text, ',' order by canonical.automatic_rank), '') || ']', 'UTF8'), 'sha256'), 'hex')
    into variant_ids, structure_hash
    from private.canonical_collection_variants(p_target_type, p_target_id) as canonical;
    if structure_hash is distinct from target_hash then
      raise exception using errcode = '23514', message = 'automatic_target_hash_mismatch';
    end if;
    if cardinality(variant_ids) = 0 then
      raise exception using errcode = '23514', message = 'automatic_collection_empty';
    end if;

    -- The existing name CHECK/NOT NULL is authoritative; store the supplied name unchanged.
    insert into public.collections as inserted (owner_id, name, collection_type,
      automatic_target_type, target_pokemon_id, target_set_id, applied_target_version, order_contract_version, personal_revision)
    values (caller_id, p_name, 'automatic', p_target_type,
      case when p_target_type = 'pokemon' then p_target_id end,
      case when p_target_type = 'set' then p_target_id end, target_version, 2, 0)
    on conflict do nothing
    returning inserted.id into collection_id;
    if found then
      insert into public.collection_items(collection_id, variant_id, origin, automatic_rank, sort_position)
      select collection_id, item.variant_id, 'automatic', item.rank, item.rank::numeric(40,20)
      from unnest(variant_ids) with ordinality as item(variant_id, rank);
      created := true;
      return next;
      return;
    end if;
    -- A unique index resolved a race. A separate statement sees the committed winner
    -- at READ COMMITTED; retry also handles a winner deleted before this next lookup.
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_key text, p_observed_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := private.notification_caller();
  subject_id uuid;
  observed_version bigint;
  current_version bigint;
  announcement record;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'notification_isolation_invalid';
  end if;
  if p_notification_key is null or p_observed_revision is null
    or p_notification_key !~ '^(collection|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'notification_input_invalid';
  end if;
  subject_id := split_part(p_notification_key,':',2)::uuid;
  if p_notification_key like 'collection:%' then
    if p_observed_revision !~ '^[1-9][0-9]{0,18}$'
      or (length(p_observed_revision) = 19 and p_observed_revision collate "C" > '9223372036854775807' collate "C") then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    observed_version := p_observed_revision::bigint;
    -- Catalogue BEFORE parent; sync/apply/delete cannot invalidate our write.
    perform pg_catalog.pg_advisory_xact_lock_shared(771402);
    perform 1 from public.collections where id = subject_id and owner_id = caller_id for update;
    if not found then return jsonb_build_object('outcome','obsolete'); end if;
    perform private.notification_caller();
    select c.target_version into current_version from private.read_collection_update_notifications(caller_id) c
      where c.collection_id = subject_id;
    if current_version is null or observed_version > current_version then
      return jsonb_build_object('outcome','obsolete');
    end if;
    insert into private.collection_notification_reads as r (collection_id,read_target_version,read_at)
      values (subject_id,observed_version,clock_timestamp())
      on conflict (collection_id) do update set read_target_version = excluded.read_target_version,
        read_at = excluded.read_at where r.read_target_version < excluded.read_target_version;
  else
    if p_observed_revision !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    -- Serialize this caller/event even before the first sparse state exists.
    -- Hash collisions only serialize unrelated pairs. Then SHARE publication
    -- allows other users, conflicts with withdrawal/delete. Recheck after waits,
    -- including expiration; no processed date cleared.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'my.notification.state:' || caller_id::text || ':' || subject_id::text,0));
    perform 1 from private.notification_announcements where id = subject_id for share;
    if not found then return jsonb_build_object('outcome','obsolete'); end if;
    perform private.notification_caller();
    select * into announcement from private.read_notification_announcements(caller_id,clock_timestamp()) a
      where a.announcement_id = subject_id and a.processed_at is null;
    if not found or announcement.content_hash is distinct from p_observed_revision then
      return jsonb_build_object('outcome','obsolete');
    end if;
    insert into private.notification_announcement_states as s (user_id,announcement_id,read_at)
      values (caller_id,subject_id,clock_timestamp())
      on conflict (user_id,announcement_id) do update set read_at = excluded.read_at
        where s.read_at is null and s.processed_at is null;
  end if;
  return jsonb_build_object('outcome','recorded');
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_announcement_notification(p_announcement_id uuid, p_observed_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id uuid := private.notification_caller(); announcement record; recorded_at timestamptz;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'notification_isolation_invalid';
  end if;
  if p_announcement_id is null or p_observed_hash is null or p_observed_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'notification_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'my.notification.state:' || caller_id::text || ':' || p_announcement_id::text,0));
  perform 1 from private.notification_announcements where id = p_announcement_id for share;
  if not found then return jsonb_build_object('outcome','obsolete'); end if;
  perform private.notification_caller();
  select * into announcement from private.read_notification_announcements(caller_id,clock_timestamp()) a
    where a.announcement_id = p_announcement_id;
  if not found or announcement.content_hash is distinct from p_observed_hash then
    return jsonb_build_object('outcome','obsolete');
  end if;
  -- No supported server resolution exists in 8G.2. A click/hash is never proof.
  if announcement.requires_action then
    raise exception using errcode = '42501', message = 'notification_action_unresolved';
  end if;
  recorded_at := clock_timestamp();
  insert into private.notification_announcement_states as s (user_id,announcement_id,read_at,processed_at)
    values (caller_id,p_announcement_id,recorded_at,recorded_at)
    on conflict (user_id,announcement_id) do update set
      read_at = coalesce(s.read_at,excluded.read_at),
      processed_at = coalesce(s.processed_at,greatest(s.read_at,excluded.processed_at))
      where s.processed_at is null;
  return jsonb_build_object('outcome','recorded');
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_manual_collection_item(p_collection_id uuid, p_collection_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  item_origin text;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  if exists (select 1 from public.collections
    where id = p_collection_id and order_contract_version = 2) then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
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
  when sqlstate 'PT503' then raise;
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required')
      or (sqlstate = 'P0002' and sqlerrm = 'manual_item_unavailable')
      or (sqlstate = '23514' and sqlerrm = 'automatic_item_removal_forbidden') then raise; end if;
    raise exception using errcode = 'XX000', message = 'manual_item_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_manual_collection_item_v2(p_collection_id uuid, p_collection_item_id uuid, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  item_origin text;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- No catalogue dependency. Serialize with all structural writers and parent
  -- deletion, then reread current ownership/mode/revision after any lock wait.
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
  if p_collection_item_id is null or p_operation_id is null
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Same canonical versioned request tuple as the other v2 writers. Historical
  -- retries precede revision/presence checks: the removed identity stays absent.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'remove_manual_collection_item_v2', p_collection_id,
    p_collection_item_id, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'remove' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;
  select origin into item_origin from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'collection_item_unavailable';
  end if;
  if item_origin <> 'manual' then
    raise exception using errcode = '23514', message = 'automatic_item_removal_forbidden';
  end if;

  -- R3: subject FK cascades every own placement, including manual_add. Other
  -- subjects' immutable historical UUIDs have no FK; receipts belong to parent.
  -- No position compaction, catalogue access, or physical-copy mutation.
  delete from public.collection_items
    where id = p_collection_item_id and collection_id = p_collection_id and origin = 'manual';
  revision := revision + 1;
  update public.collections set personal_revision = revision where id = p_collection_id;
  result := jsonb_build_object(
    'operation_id', p_operation_id, 'outcome', 'changed',
    'personal_revision', revision::text, 'collection_item_id', p_collection_item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'remove', request_hash, revision, result);
  return result;
exception
  when sqlstate 'PT503' then raise;
  when serialization_failure or deadlock_detected or lock_not_available then
    return private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm in ('order_contract_upgrade_required', 'automatic_item_removal_forbidden')) then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_collection_item(p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  if exists (select 1 from public.collections
    where id = p_collection_id and order_contract_version = 2) then
    raise exception using errcode = '23514', message = 'order_contract_upgrade_required';
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
$function$;

CREATE OR REPLACE FUNCTION public.reorder_collection_item_v2(p_collection_id uuid, p_item_id uuid, p_placement text, p_anchor_id uuid, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := auth.uid();
  contract_version smallint;
  revision bigint;
  request_hash text;
  receipt private.collection_operation_receipts;
  result jsonb;
  current_ids uuid[];
  remaining_ids uuid[];
  final_ids uuid[];
  insertion_index integer;
  normalized_anchor uuid;
  fallback_ids uuid[];
  lower_position numeric;
  upper_position numeric;
  candidate numeric;
  has_ties boolean;
begin
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id) then
    raise exception using errcode = '42501', message = 'collection_action_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  -- Same parent lock as all legacy writers. Recheck authoritative ownership/mode
  -- and revision in a fresh READ COMMITTED statement after any lock wait.
  perform 1 from public.collections
    where id = p_collection_id and owner_id = caller_id for update;
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
  if p_item_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_placement is null or p_placement not in ('start', 'end', 'before', 'after')
    or (p_placement in ('start', 'end') and p_anchor_id is not null)
    or (p_placement in ('before', 'after') and (p_anchor_id is null or p_anchor_id = p_item_id)) then
    raise exception using errcode = '22023', message = 'collection_operation_invalid';
  end if;

  -- Versioned canonical tuple of validated request parameters, NOT the mutable
  -- normalized destination. UUIDs/native BIGINT casts have one canonical spelling.
  request_hash := encode(sha256(convert_to(jsonb_build_array(
    'reorder_collection_item_v2', p_collection_id, p_item_id, p_placement,
    p_anchor_id, p_expected_revision::text
  )::text, 'UTF8')), 'hex');
  select r.* into receipt from private.collection_operation_receipts r
    where r.collection_id = p_collection_id and r.operation_id = p_operation_id;
  if found then
    if receipt.kind <> 'move' or receipt.request_hash <> request_hash then
      raise exception using errcode = '23505', message = 'operation_id_conflict';
    end if;
    return receipt.result;
  end if;
  if p_expected_revision <> revision then
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  end if;

  select coalesce(array_agg(id order by sort_position, id), '{}'::uuid[]),
    count(*) <> count(distinct sort_position)
  into current_ids, has_ties from public.collection_items where collection_id = p_collection_id;
  if not (p_item_id = any(current_ids))
    or (p_anchor_id is not null and not (p_anchor_id = any(current_ids))) then
    raise exception using errcode = 'P0002', message = 'collection_item_unavailable';
  end if;
  remaining_ids := array_remove(current_ids, p_item_id);
  insertion_index := case p_placement
    when 'start' then 1
    when 'end' then cardinality(remaining_ids) + 1
    when 'before' then array_position(remaining_ids, p_anchor_id)
    when 'after' then array_position(remaining_ids, p_anchor_id) + 1 end;
  normalized_anchor := remaining_ids[insertion_index];
  final_ids := remaining_ids[1:insertion_index - 1] || array[p_item_id]
    || remaining_ids[insertion_index:cardinality(remaining_ids)];

  -- R4: permutation equality, including ties, never creates a new gesture.
  -- A noop leaves numeric positions untouched and still gets a durable receipt.
  if final_ids <> current_ids then
    -- R1: original complete pre-move suffix strictly after normalized anchor.
    -- Subject excluded, every other automatic/manual item retained in order.
    fallback_ids := case when normalized_anchor is null then '{}'::uuid[] else
      array_remove(current_ids[array_position(current_ids, normalized_anchor) + 1:cardinality(current_ids)], p_item_id) end;

    -- Exact NUMERIC midpoint/rebalance algorithm from the legacy reorder.
    select sort_position into lower_position from public.collection_items
      where id = final_ids[insertion_index - 1] and collection_id = p_collection_id;
    select sort_position into upper_position from public.collection_items
      where id = final_ids[insertion_index + 1] and collection_id = p_collection_id;
    candidate := case
      when lower_position is null and upper_position is null then 1
      when lower_position is null then upper_position - 1
      when upper_position is null then lower_position + 1
      else round((lower_position + upper_position) / 2, 20) end;
    if not has_ties and abs(candidate) < 100000000000000000000
      and (lower_position is null or candidate > lower_position)
      and (upper_position is null or candidate < upper_position) then
      update public.collection_items set sort_position = candidate
        where id = p_item_id and collection_id = p_collection_id;
    else
      update public.collection_items as item set sort_position = ordered.rank::numeric(40,20)
      from unnest(final_ids) with ordinality as ordered(id, rank)
      where item.id = ordered.id and item.collection_id = p_collection_id
        and item.sort_position is distinct from ordered.rank::numeric(40,20);
    end if;
    revision := revision + 1;
    update public.collections set personal_revision = revision where id = p_collection_id;
    insert into private.collection_order_intents(
      collection_id, sequence, operation_id, subject_item_id, kind, destination, anchor_item_id, fallback_item_ids
    ) values (
      p_collection_id, revision, p_operation_id, p_item_id, 'move',
      case when normalized_anchor is null then 'end' else 'before' end, normalized_anchor, fallback_ids
    );
  end if;
  result := jsonb_build_object(
    'operation_id', p_operation_id,
    'outcome', case when final_ids = current_ids then 'noop' else 'changed' end,
    'personal_revision', revision::text,
    'collection_item_id', p_item_id
  );
  insert into private.collection_operation_receipts(
    collection_id, operation_id, kind, request_hash, accepted_revision, result
  ) values (p_collection_id, p_operation_id, 'move', request_hash, revision, result);
  return result;
exception
  when sqlstate 'PT503' then raise;
  when serialization_failure or deadlock_detected or lock_not_available then
    return private.raise_collection_structure_conflict();
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_action_unavailable')
      or (sqlstate = '22023' and sqlerrm = 'collection_operation_invalid')
      or (sqlstate = 'P0002' and sqlerrm = 'collection_item_unavailable')
      or (sqlstate = '23505' and sqlerrm = 'operation_id_conflict')
      or (sqlstate = '23514' and sqlerrm = 'order_contract_upgrade_required') then raise; end if;
    raise exception using errcode = 'XX000', message = 'phase8_operation_unexpected';
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_collection_item_hidden(p_collection_id uuid, p_collection_item_id uuid, p_is_hidden boolean, p_expected_revision bigint, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- PROD.2: barrier before business locks, including no-op/replay paths.
  perform private.require_business_writes_open();
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
  when sqlstate 'PT503' then raise;
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
$function$;

commit;
