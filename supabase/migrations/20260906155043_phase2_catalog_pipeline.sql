begin;

-- Preserve every pre-existing scalar stamp as one element, including nonempty historical text.
alter table public.catalog_variants alter column stamp type text[]
  using case when stamp is null then '{}'::text[] else array[stamp] end;
alter table public.catalog_variants alter column stamp set default '{}'::text[];
alter table public.catalog_variants alter column stamp set not null;
alter table public.catalog_variants add constraint catalog_variants_stamp_no_null
  check (array_position(stamp, null) is null);

create table private.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  repository text not null check (repository = 'https://github.com/tcgdex/cards-database'),
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  source_committed_at timestamptz not null,
  overrides_hash text not null check (overrides_hash ~ '^[a-f0-9]{64}$'),
  pipeline_version text not null,
  report jsonb not null default '{}'::jsonb,
  error_summary text,
  check ((status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null))
);

create table private.catalog_overrides (
  id text primary key,
  reason text not null check (length(btrim(reason)) > 0),
  action text not null,
  target jsonb not null,
  source_value jsonb not null,
  effective_value jsonb not null,
  redundant boolean not null,
  is_applied boolean not null,
  last_run_id uuid not null references private.catalog_sync_runs(id) on delete restrict
);
create index catalog_overrides_last_run_idx on private.catalog_overrides(last_run_id);

-- Sparse identity aliases: local additions and corrected variants only. Git remains authoritative.
-- Keeping removed aliases permits reactivation/reversion without breaking user foreign keys.
create table private.catalog_entity_keys (
  entity_key text primary key,
  source_card_id bigint references public.source_cards(id) on delete restrict,
  variant_id bigint references public.catalog_variants(id) on delete restrict,
  check (num_nonnulls(source_card_id, variant_id) = 1)
);
create index catalog_entity_keys_card_idx on private.catalog_entity_keys(source_card_id);
create index catalog_entity_keys_variant_idx on private.catalog_entity_keys(variant_id);

alter table private.catalog_sync_runs enable row level security;
alter table private.catalog_overrides enable row level security;
alter table private.catalog_entity_keys enable row level security;
revoke all on schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role;
-- No policies, API grants, RPC or SECURITY DEFINER function are needed for the direct local tool.

commit;
