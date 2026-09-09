begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Return only Auth additions to the pre-3A state inside this transaction.
drop trigger auth_user_created_profile on auth.users;
drop function private.create_profile_for_auth_user();
do $$
declare
  table_name text;
begin
  for table_name in select tablename from pg_policies where schemaname = 'public' and policyname = 'require_mfa' loop
    execute format('drop policy require_mfa on public.%I', table_name);
  end loop;
end;
$$;
insert into auth.users(id) values ('80000000-0000-0000-0000-000000000001'), ('80000000-0000-0000-0000-000000000002');
insert into profiles(id) values ('80000000-0000-0000-0000-000000000001');
create temporary table preserved_profile as select * from profiles where id = '80000000-0000-0000-0000-000000000001';
select is((select count(*) from profiles where id::text like '80000000-%'), 1::bigint, 'Legacy fixture has one profile and one orphan Auth user');

\ir phase3a_auth.generated.inc

select results_eq($$select * from profiles where id = '80000000-0000-0000-0000-000000000001'$$, $$select * from preserved_profile$$, 'Backfill preserves existing profile and timestamps exactly');
select is((select count(*) from profiles where id::text like '80000000-%'), 2::bigint, 'Migration repairs missing legacy profile');
select ok((select public_id::text ~ '^MY-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-){3}[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$' from profiles where id = '80000000-0000-0000-0000-000000000002'), 'Backfill uses the existing cryptographic generator');
select is((select count(*) from auth.users u where not exists (select 1 from profiles p where p.id = u.id)), 0::bigint, 'No Auth identity remains without profile');
insert into auth.users(id) values ('80000000-0000-0000-0000-000000000003');
select is((select count(*) from profiles where id = '80000000-0000-0000-0000-000000000003'), 1::bigint, 'New signup still works after backfill');
select is((select count(*) from pg_policies where schemaname = 'public' and policyname = 'require_mfa'), 13::bigint, 'Migration installs all MFA policies');

select * from finish();
rollback;
