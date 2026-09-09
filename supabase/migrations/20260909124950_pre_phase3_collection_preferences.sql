begin;

-- Keep collections_target_check unchanged: a free collection has no target,
-- and an automatic collection has exactly one compatible, non-null target.
create unique index collections_owner_pokemon_unique
  on public.collections(owner_id, target_pokemon_id)
  where collection_type = 'automatic' and automatic_target_type = 'pokemon';
create unique index collections_owner_set_unique
  on public.collections(owner_id, target_set_id)
  where collection_type = 'automatic' and automatic_target_type = 'set';

alter table public.collections drop constraint collections_name_check;
alter table public.collections add constraint collections_name_check check (
  -- Same boundary whitespace as JavaScript String.trim(). Count characters,
  -- not UTF-8 bytes; preserve the stored name and its internal spaces.
  char_length(btrim(name, E' \t\n\r\f' || U&'\000B\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) >= 3
);

create table public.user_preferences (
  user_id uuid primary key default auth.uid()
    references public.profiles(id) on delete cascade,
  catalog_default_view text not null default 'last_used'
    check (catalog_default_view in ('list', 'cards', 'last_used')),
  collection_default_view text not null default 'last_used'
    check (collection_default_view in ('list', 'cards', 'binder', 'last_used')),
  last_catalog_view text not null default 'list'
    check (last_catalog_view in ('list', 'cards')),
  last_collection_view text not null default 'list'
    check (last_collection_view in ('list', 'cards', 'binder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'Private view preferences, at most one row per profile. No signup trigger; absent row uses the same defaults until first save.';
comment on column public.user_preferences.catalog_default_view is
  'Fixed opening view, or last_used: reuse last_catalog_view across all catalogue pages.';
comment on column public.user_preferences.collection_default_view is
  'Fixed opening view, or last_used: reuse last_collection_view across collections.';
comment on column public.user_preferences.last_catalog_view is
  'Last catalogue mode explicitly selected by the user, independent of the opening preference.';
comment on column public.user_preferences.last_collection_view is
  'Last collection mode explicitly selected by the user, independent of the opening preference.';

create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from public, anon, authenticated, service_role;
grant select on public.user_preferences to authenticated;
-- Explicit user_id permits an owner-scoped upsert; RLS checks it on INSERT.
grant insert (user_id, catalog_default_view, collection_default_view, last_catalog_view, last_collection_view)
  on public.user_preferences to authenticated;
grant update (catalog_default_view, collection_default_view, last_catalog_view, last_collection_view)
  on public.user_preferences to authenticated;
grant select, insert, update, delete on public.user_preferences to service_role;

create policy user_preferences_read_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;
