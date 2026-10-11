begin;

create table private.collection_notification_reads (
  collection_id uuid primary key references public.collections(id) on delete cascade,
  read_target_version bigint not null check (read_target_version > 0),
  read_at timestamptz not null check (isfinite(read_at))
);

create table private.notification_announcements (
  id uuid primary key default gen_random_uuid(),
  publication_key text not null unique
    check (publication_key ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  category text not null check (category in ('changelog','announcement')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  app_version text,
  action jsonb check (action is null or jsonb_typeof(action) = 'object'),
  requires_action boolean not null,
  include_new_users boolean not null default false,
  published_at timestamptz not null check (isfinite(published_at)),
  expires_at timestamptz,
  withdrawn_at timestamptz,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  published_by text not null check (btrim(published_by) <> ''),
  publication_context jsonb not null check (jsonb_typeof(publication_context) = 'object'),
  constraint notification_announcements_version_check check (
    (category <> 'changelog' or app_version is not null)
    and (app_version is null or (char_length(app_version) <= 64 and app_version ~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'))
  ),
  constraint notification_announcements_dates_check check (
    (expires_at is null or (isfinite(expires_at) and expires_at > published_at))
    and (withdrawn_at is null or (isfinite(withdrawn_at) and withdrawn_at >= published_at))
  )
);
create index notification_announcements_publication_idx
  on private.notification_announcements(published_at desc, id);

create table private.notification_announcement_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  announcement_id uuid not null references private.notification_announcements(id) on delete cascade,
  read_at timestamptz check (read_at is null or isfinite(read_at)),
  processed_at timestamptz,
  primary key (user_id, announcement_id),
  constraint notification_announcement_states_processed_check check (
    processed_at is null or (read_at is not null and isfinite(processed_at) and processed_at >= read_at)
  )
);
-- The user-leading PK serves the centre. This index also bounds FK cascades.
create index notification_announcement_states_announcement_idx
  on private.notification_announcement_states(announcement_id);

alter table private.collection_notification_reads enable row level security;
alter table private.notification_announcements enable row level security;
alter table private.notification_announcement_states enable row level security;
revoke all on table private.collection_notification_reads, private.notification_announcements,
  private.notification_announcement_states from public, anon, authenticated, service_role;

-- Only the first withdrawal is mutable. Corrections use a new publication key.
-- No publisher role or publication function is provisioned in 8G.1.
create function private.guard_notification_announcement_publication()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'withdrawn_at') is distinct from (to_jsonb(old) - 'withdrawn_at')
    or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at) then
    raise exception using errcode = '23514', message = 'notification_publication_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_notification_announcement_publication()
  from public, anon, authenticated, service_role;
create trigger notification_announcements_immutable
  before update on private.notification_announcements for each row
  execute function private.guard_notification_announcement_publication();

-- Single owner of the 8E structural predicate. Pure verified inputs, no reads,
-- locks or mutations. NULL means inconsistent; false means no useful update.
-- The locked 8E caller raises its existing safe error on NULL; centre projection
-- excludes that parent. Hidden items, manual conversions and personal positions
-- do not replace the applied AUTOMATIC canonical sequence.
create function private.collection_update_available(
  p_applied_version bigint, p_target_version bigint, p_target_hash text,
  p_canonical private.collection_order_canonical_entry[],
  p_items private.collection_order_item_entry[]
) returns boolean language plpgsql immutable parallel safe security invoker set search_path = ''
as $$
declare
  target_ids bigint[];
  applied_ids bigint[];
  structure_hash text;
  automatic_count bigint;
begin
  if p_applied_version is null or p_applied_version < 1 or p_target_version is null
    or p_target_version < p_applied_version or p_target_hash is null
    or p_target_hash !~ '^[a-f0-9]{64}$' or p_canonical is null or p_items is null then
    return null;
  end if;
  select coalesce(array_agg(c.variant_id order by c.automatic_rank), '{}'::bigint[]),
    encode(sha256(convert_to('[' || coalesce(string_agg(to_json(c.variant_id::text)::text,
      ',' order by c.automatic_rank), '') || ']', 'UTF8')), 'hex')
    into target_ids, structure_hash from unnest(p_canonical) c;
  if structure_hash is distinct from p_target_hash
    or exists (select 1 from unnest(p_canonical) with ordinality c
      where c.variant_id is null or c.automatic_rank is distinct from c.ordinality)
    or cardinality(target_ids) <> (select count(distinct c.variant_id) from unnest(p_canonical) c) then
    return null;
  end if;
  select count(*), coalesce(array_agg(i.variant_id order by i.automatic_rank), '{}'::bigint[])
    into automatic_count, applied_ids from unnest(p_items) i where i.origin = 'automatic';
  if exists (select 1 from unnest(p_items) i where i.variant_id is null or i.origin is null
      or i.origin not in ('manual','automatic') or (i.origin = 'manual' and (i.automatic_rank is not null or i.is_hidden))
      or (i.origin = 'automatic' and (i.automatic_rank is null or i.automatic_rank < 1)))
    or (select count(distinct i.automatic_rank) <> automatic_count
        or coalesce(max(i.automatic_rank), 0) <> automatic_count
      from unnest(p_items) i where i.origin = 'automatic')
    or (select count(distinct i.variant_id) <> cardinality(p_items) from unnest(p_items) i)
    or (p_target_version = p_applied_version and applied_ids <> target_ids) then
    return null;
  end if;
  return p_target_version > p_applied_version and applied_ids <> target_ids;
end;
$$;
revoke all on function private.collection_update_available(bigint,bigint,text,
  private.collection_order_canonical_entry[],private.collection_order_item_entry[])
  from public, anon, authenticated, service_role;

-- Internal trusted input: future public RPCs must authorize auth.uid()/aal2/
-- profile and pass only that caller. INVOKER, no API ACL, no definer bypass.
-- STABLE supplies ONE statement snapshot to every nested canonical read.
-- Canonical computed once per distinct target; items aggregated for all owned
-- candidates together. No per-parent status RPC, lock loop or journal replay.
create function private.read_collection_update_notifications(p_owner_id uuid)
returns table (
  notification_key text, collection_id uuid, collection_name text,
  applied_target_version bigint, target_version bigint, updated_at timestamptz, is_read boolean
) language sql stable security invoker set search_path = ''
as $$
  with parents as materialized (
    select c.*, case c.automatic_target_type when 'pokemon' then c.target_pokemon_id
      when 'set' then c.target_set_id end as target_id
    from public.collections c where c.owner_id = p_owner_id
      and c.collection_type = 'automatic' and c.order_contract_version = 2
  ), targets as materialized (
    select distinct p.automatic_target_type as target_type, p.target_id
    from parents p
    where (p.automatic_target_type = 'pokemon' and exists (select 1 from public.pokemon t where t.id = p.target_id))
      or (p.automatic_target_type = 'set' and exists (select 1 from public.tcg_sets t where t.id = p.target_id))
  ), canonicals as materialized (
    select t.target_type, t.target_id, s.generation_version, s.content_hash, s.updated_at,
      array(select row(v.variant_id,v.automatic_rank)::private.collection_order_canonical_entry
        from private.canonical_collection_variants(t.target_type,t.target_id) v order by v.automatic_rank) as canonical
    from targets t join public.automatic_target_states s on s.target_type = t.target_type
      and ((s.target_type = 'pokemon' and s.pokemon_id = t.target_id) or (s.target_type = 'set' and s.set_id = t.target_id))
  ), items as materialized (
    select i.collection_id, array_agg(row(i.collection_id,i.id,i.variant_id,i.origin,i.automatic_rank,
      i.introduced_revision,i.is_hidden)::private.collection_order_item_entry order by i.id) as entries
    from public.collection_items i join parents p on p.id = i.collection_id group by i.collection_id
  )
  select 'collection:' || p.id::text, p.id, p.name, p.applied_target_version, c.generation_version, c.updated_at,
    coalesce(r.read_target_version >= c.generation_version, false)
  from parents p join canonicals c on c.target_type = p.automatic_target_type and c.target_id = p.target_id
  left join items i on i.collection_id = p.id
  left join private.collection_notification_reads r on r.collection_id = p.id
  where private.collection_update_available(p.applied_target_version,c.generation_version,c.content_hash,
    c.canonical,coalesce(i.entries,'{}'::private.collection_order_item_entry[])) is true;
$$;
revoke all on function private.read_collection_update_notifications(uuid) from public, anon, authenticated, service_role;

comment on table private.collection_notification_reads is
  '8G.1 explicit read storage only; owner from collection. Absence means unread. Never populated by sync, status or preview. Monotone writes arrive in 8G.2.';
comment on table private.notification_announcements is
  '8G.1 immutable shared publication storage. JSON object envelopes only here; strict action union, context justification/resolution, normalized hash and server timestamp validation at publication in 8G.3. No publication path or operator role yet.';
comment on table private.notification_announcement_states is
  '8G.1 sparse per-profile read/process state; processed implies read. Audience later derives from auth.users.created_at, active dates and include_new_users, without signup fanout or duplicated registration date.';
comment on function private.read_collection_update_notifications(uuid) is
  '8G.1 private owner projection for future authorized centre/count. One STABLE snapshot, no business writes or row/advisory locks. One canonical per distinct target; shared 8E validity/delta predicate. Invalid, applied, obsolete, legacy, free and shared-recipient parents excluded. Exact SQL BIGINTs; serialize as decimal strings at future public boundary.';

create or replace function private.read_collection_update_context(p_collection_id uuid, p_require_v2 boolean)
returns private.collection_update_context
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  parent public.collections;
  context private.collection_update_context;
  target_id bigint;
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

  -- Verified canonical/items share the 8G.1 pure predicate with notifications.
  select coalesce(array_agg(row(c.variant_id,c.automatic_rank)::private.collection_order_canonical_entry
      order by c.automatic_rank), '{}'::private.collection_order_canonical_entry[])
    into context.canonical from private.canonical_collection_variants(parent.automatic_target_type, target_id) c;
  select coalesce(array_agg(row(i.collection_id,i.id,i.variant_id,i.origin,i.automatic_rank,
      i.introduced_revision,i.is_hidden)::private.collection_order_item_entry order by i.id),
      '{}'::private.collection_order_item_entry[])
    into context.items from public.collection_items i where i.collection_id = p_collection_id;
  context.update_available := private.collection_update_available(parent.applied_target_version,
    context.target_version,context.target_hash,context.canonical,context.items);
  if context.update_available is null then
    raise exception using errcode = '23514', message = 'collection_update_state_invalid';
  end if;
  context.collection_id := parent.id;
  context.order_contract_version := parent.order_contract_version;
  context.applied_target_version := parent.applied_target_version;
  context.personal_revision := parent.personal_revision;
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
    -- Explicit terminal guard for plpgsql_check, even if the raising helper were changed.
    raise exception using errcode = '40001', message = 'collection_structure_conflict';
  when others then
    if (sqlstate = '42501' and sqlerrm = 'collection_update_unavailable')
      or (sqlstate = '23514' and sqlerrm in ('collection_update_ineligible', 'order_contract_upgrade_required', 'collection_update_state_invalid'))
      or sqlstate = 'PGRST' then raise; end if;
    raise exception using errcode = 'XX000', message = 'collection_update_unexpected';
end;
$$;

-- Forward: additive storage/projection, existing readers/writers compatible.
-- Software rollback: disable future callers, retain sparse states and immutable
-- publications. No data backfill, contraction, reset or destructive rollback.
commit;
