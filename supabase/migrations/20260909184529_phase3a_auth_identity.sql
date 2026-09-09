begin;

-- Serialize signup with installation/backfill. No change to the existing ID generator.
lock table auth.users in share row exclusive mode;

create function private.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  failed_constraint text;
begin
  -- NEW.id comes from the Auth row, never from caller metadata or an RPC argument.
  for attempt in 1..5 loop
    begin
      insert into public.profiles(id) values (new.id);
      return new;
    exception when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint <> 'profiles_public_id_key' or attempt = 5 then
        raise;
      end if;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function private.create_profile_for_auth_user()
  from public, anon, authenticated, service_role, supabase_auth_admin;

create trigger auth_user_created_profile after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

-- Repair pre-existing Auth identities atomically, preserving every existing profile.
do $$
declare
  failed_constraint text;
begin
  for attempt in 1..5 loop
    begin
      insert into public.profiles(id)
        select u.id from auth.users u
        where not exists (select 1 from public.profiles p where p.id = u.id);
      exit;
    exception when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint <> 'profiles_public_id_key' or attempt = 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- AND with the existing permissive business policies, for every API operation.
-- service_role retains its existing grants and BYPASSRLS; private maintenance is unchanged.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pokemon', 'tcg_series', 'tcg_sets', 'source_cards', 'catalog_variants',
    'card_pokemon', 'automatic_target_states', 'profiles', 'collections',
    'collection_items', 'physical_copies', 'collection_shares', 'user_preferences'
  ] loop
    execute format(
      'create policy require_mfa on public.%I as restrictive for all to authenticated
       using ((select auth.jwt()->>''aal'') = ''aal2'')
       with check ((select auth.jwt()->>''aal'') = ''aal2'')', table_name
    );
  end loop;
end;
$$;

commit;
