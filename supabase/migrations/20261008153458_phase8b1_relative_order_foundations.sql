begin;

-- Expand only: existing and newly-created parents still use the legacy writers.
alter table public.collections
  add column personal_revision bigint not null default 0,
  add column order_contract_version smallint not null default 1,
  add constraint collections_personal_revision_check check (personal_revision >= 0),
  add constraint collections_order_contract_version_check check (order_contract_version in (1, 2));

alter table public.collection_items
  add column introduced_revision bigint,
  add constraint collection_items_introduced_revision_check check (introduced_revision > 0),
  add constraint collection_items_collection_id_id_key unique (collection_id, id);

comment on column public.collections.personal_revision is
  'Prepared v2 structural revision. Legacy writers leave zero; no v2 activation in Phase 8B.1.';
comment on column public.collections.order_contract_version is
  '1 = legacy, 2 = complete relative-order journal. Defaults to 1 until coordinated server activation.';
comment on column public.collection_items.introduced_revision is
  'Prepared initial manual placement revision, retained on conversion. NULL is valid for historical/legacy items.';

-- CHECK cannot contain an unnest subquery. This pure validator also rejects
-- non-list array shapes before array_position (which requires one dimension).
create function private.collection_order_fallback_is_valid(item_ids uuid[], subject_id uuid, anchor_id uuid)
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select case
    when item_ids is null then false
    when cardinality(item_ids) = 0 then true
    when array_ndims(item_ids) <> 1 or array_lower(item_ids, 1) <> 1 then false
    else array_position(item_ids, null) is null
      and array_position(item_ids, subject_id) is null
      and (anchor_id is null or array_position(item_ids, anchor_id) is null)
      and cardinality(item_ids) = (select count(distinct item_id) from unnest(item_ids) item_id)
  end;
$$;
revoke all on function private.collection_order_fallback_is_valid(uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;

create table private.collection_order_intents (
  collection_id uuid not null references public.collections(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  operation_id uuid not null,
  subject_item_id uuid not null,
  kind text not null check (kind in ('manual_add', 'move')),
  destination text not null check (destination in ('before', 'end')),
  -- Historical identities deliberately have no FK to currently living items.
  anchor_item_id uuid,
  fallback_item_ids uuid[] not null,
  accepted_at timestamptz not null default now(),
  primary key (collection_id, sequence),
  unique (collection_id, operation_id),
  constraint collection_order_intents_subject_fkey foreign key (collection_id, subject_item_id)
    references public.collection_items(collection_id, id) on delete cascade,
  constraint collection_order_intents_placement_check check (
    (destination = 'end' and anchor_item_id is null and cardinality(fallback_item_ids) = 0)
    or (destination = 'before' and anchor_item_id is not null and anchor_item_id <> subject_item_id)
  ),
  constraint collection_order_intents_fallback_check check (
    private.collection_order_fallback_is_valid(fallback_item_ids, subject_item_id, anchor_item_id)
  )
);
create index collection_order_intents_subject_idx
  on private.collection_order_intents(collection_id, subject_item_id);

-- Append-only acceptance context. Real subject/parent removal still cascades.
create function private.reject_collection_order_intent_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new is distinct from old then
    raise exception using errcode = '23514', message = 'collection_order_intent_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_collection_order_intent_update()
  from public, anon, authenticated, service_role;
create trigger collection_order_intents_immutable before update on private.collection_order_intents
  for each row execute function private.reject_collection_order_intent_update();

create table private.collection_operation_receipts (
  collection_id uuid not null references public.collections(id) on delete cascade,
  operation_id uuid not null,
  kind text not null check (kind in ('move', 'add', 'remove', 'hide', 'apply')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  accepted_revision bigint not null check (accepted_revision >= 0),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  accepted_at timestamptz not null default now(),
  primary key (collection_id, operation_id)
);

alter table private.collection_order_intents enable row level security;
alter table private.collection_operation_receipts enable row level security;
revoke all on table private.collection_order_intents, private.collection_operation_receipts
  from public, anon, authenticated, service_role;
-- No policy, API, sequence allocator or grant on existing objects is added.
comment on table private.collection_order_intents is
  'Prepared chronological v2 placements. Historical anchor/fallback UUIDs remain immutable when referenced items disappear. No business writer yet.';
comment on table private.collection_operation_receipts is
  'Prepared collection-scoped idempotency receipts, retained until parent deletion. No retry processing or business writer yet.';

-- Before commit: atomic rollback. After commit: keep this unused additive
-- storage and legacy defaults; no destructive down migration or data conversion.
commit;
