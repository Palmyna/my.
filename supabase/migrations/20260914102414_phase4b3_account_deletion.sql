begin;

-- Auth Admin's hard delete and this trigger execute in the same transaction.
-- No callable deletion RPC, no caller-supplied UUID, no change to existing FKs.
create function private.delete_account_data_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Block new FK references while dependencies are removed. Concurrent writers
  -- either finish before this lock or fail against the deleted parent afterwards.
  perform 1 from public.profiles where id = old.id for update;
  delete from public.collection_shares where recipient_user_id = old.id;
  delete from public.collections where owner_id = old.id;
  -- Items and outgoing shares cascade from collections; preferences from profile.
  delete from public.physical_copies where user_id = old.id;
  delete from public.profiles where id = old.id;
  return old;
end;
$$;
revoke all on function private.delete_account_data_for_auth_user()
  from public, anon, authenticated, service_role, supabase_auth_admin;

create trigger auth_user_deleting_account before delete on auth.users
  for each row execute function private.delete_account_data_for_auth_user();

-- Previously issued JWTs remain cryptographically valid after Auth deletion.
-- Require the caller's profile as well as the existing MFA/ownership policies.
-- No private schema USAGE: policies call this pre-resolved predicate by OID.
create function private.has_my_profile()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles where id = (select auth.uid())
  );
$$;
revoke all on function private.has_my_profile()
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function private.has_my_profile() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pokemon', 'tcg_series', 'tcg_sets', 'source_cards', 'catalog_variants',
    'card_pokemon', 'automatic_target_states', 'profiles', 'collections',
    'collection_items', 'physical_copies', 'collection_shares', 'user_preferences'
  ] loop
    execute format(
      'create policy require_my_profile on public.%I as restrictive for all to authenticated
       using ((select private.has_my_profile()))
       with check ((select private.has_my_profile()))', table_name
    );
  end loop;
end;
$$;

commit;
