begin;

alter table public.user_preferences
  add column binder_default_format text not null default '3x3'
    check (binder_default_format in ('2x2', '3x3', '4x3'));
comment on column public.user_preferences.binder_default_format is
  'Account-wide binder format. Missing collection override inherits this value dynamically.';
grant insert (binder_default_format), update (binder_default_format)
  on public.user_preferences to authenticated;

create table public.collection_view_preferences (
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  binder_format text not null check (binder_format in ('2x2', '3x3', '4x3')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);
-- The PK starts with user_id; this index also supports collection deletion cascades.
create index collection_view_preferences_collection_id_idx
  on public.collection_view_preferences(collection_id);
comment on table public.collection_view_preferences is
  'Explicit viewer + collection binder format overrides only. Delete to inherit the current account default. V1 binder organization is continuous, in authoritative collection order.';
create trigger collection_view_preferences_updated_at
  before update on public.collection_view_preferences
  for each row execute function private.set_updated_at();

alter table public.collection_view_preferences enable row level security;
revoke all on public.collection_view_preferences from public, anon, authenticated, service_role;
grant select, delete on public.collection_view_preferences to authenticated;
grant insert (user_id, collection_id, binder_format)
  on public.collection_view_preferences to authenticated;
grant update (binder_format) on public.collection_view_preferences to authenticated;
grant select, insert, update, delete on public.collection_view_preferences to service_role;

create policy collection_view_preferences_own on public.collection_view_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Reuse collections_read under RLS: ownership OR current share recipient.
-- This dependency is one-way and adds no collections <-> shares RLS cycle.
create policy require_collection_access on public.collection_view_preferences
  as restrictive for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id))
  with check (exists (select 1 from public.collections c where c.id = collection_id));
create policy require_mfa on public.collection_view_preferences
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy require_my_profile on public.collection_view_preferences
  as restrictive for all to authenticated
  using ((select private.has_my_profile()))
  with check ((select private.has_my_profile()));

commit;
