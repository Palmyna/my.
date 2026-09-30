begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('private', 'delete_account_data_for_auth_user', array[]::text[], 'Private deletion trigger exists');
select has_trigger('auth', 'users', 'auth_user_deleting_account', 'Auth hard delete invokes account cleanup');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.delete_account_data_for_auth_user()'::regprocedure), 'Cleanup uses narrow definer with empty search_path');
select ok(not has_function_privilege(role_name, 'private.delete_account_data_for_auth_user()', 'EXECUTE'), role_name || ' cannot invoke deletion helper')
  from unnest(array['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) role_name;
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'Private schema remains inaccessible');
select ok(not has_table_privilege('authenticated', 'auth.users', 'DELETE'), 'Ordinary client cannot delete Auth users');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'Ordinary client cannot delete profiles');
select ok(has_function_privilege('authenticated', 'private.has_my_profile()', 'EXECUTE'), 'RLS may evaluate the current caller predicate');
select ok(not has_function_privilege('anon', 'private.has_my_profile()', 'EXECUTE'), 'Anon cannot execute profile predicate');
select is((select count(*) from pg_policies where schemaname = 'public' and policyname = 'require_my_profile' and permissive = 'RESTRICTIVE' and cmd = 'ALL' and roles = array['authenticated']::name[] and qual is not null and with_check is not null), 13::bigint, 'All application tables deny deleted identities on read and write');
select is((select count(*) from pg_policies where schemaname = 'public' and policyname = 'require_mfa'), 13::bigint, 'Existing MFA policies preserved');
select is((select confdeltype::text from pg_constraint where conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass), 'r', 'Profile/Auth FK stays RESTRICT');

insert into auth.users(id) values
  ('90000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000002'),
  ('90000000-0000-0000-0000-000000000003');
insert into pokemon(id, dex_number) overriding system value values (-904, 900904);
insert into tcg_series(id, tcgdex_id) overriding system value values (-904, 'deletion-test-series');
insert into tcg_sets(id, tcgdex_id, series_id) overriding system value values (-904, 'deletion-test-set', -904);
insert into source_cards(id, tcgdex_id, set_id, origin, source_present) overriding system value values (-904, 'deletion-test-card', -904, 'my', false);
insert into catalog_variants(id, source_card_id, variant_key, origin, source_present) overriding system value values (-904, -904, 'deletion-test', 'my', false);
insert into card_pokemon values (-904, -904);
insert into automatic_target_states(target_type, pokemon_id, generation_version, content_hash) values ('pokemon', -904, 1, 'deletion-test');
insert into collections(id, owner_id, name, collection_type) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Owned shared', 'free'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'Owned private', 'free'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', 'Other shared', 'free');
insert into collection_items(collection_id, variant_id, origin, sort_position)
  select id, -904, 'manual', 1 from collections where id::text like '91000000-%';
insert into physical_copies(user_id, variant_id, name, note) values
  ('90000000-0000-0000-0000-000000000001', -904, 'Owned copy', 'Owned note'),
  ('90000000-0000-0000-0000-000000000001', -904, null, 'Owned other copy'),
  ('90000000-0000-0000-0000-000000000002', -904, 'Other copy', 'Other note');
insert into user_preferences(user_id) values ('90000000-0000-0000-0000-000000000001'), ('90000000-0000-0000-0000-000000000002');
insert into collection_shares(collection_id, recipient_user_id) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003');

create function pg_temp.fingerprint(schema_name text, table_name text, predicate text default 'true')
returns text language plpgsql as $$
declare result text;
begin
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text, '''' order by to_jsonb(t)::text), '''')) from %I.%I t where %s', schema_name, table_name, predicate) into result;
  return result;
end;
$$;
create temporary table catalogue_before as
  select 'public' as schema_name, tab, pg_temp.fingerprint('public', tab) as hash
  from unnest(array['pokemon','tcg_series','tcg_sets','source_cards','catalog_variants','card_pokemon','automatic_target_states']) tab
  union all select 'private', tab, pg_temp.fingerprint('private', tab)
  from unnest(array['catalog_sync_runs','catalog_overrides','catalog_entity_keys']) tab;
create temporary table others_before as
  select tab, predicate, pg_temp.fingerprint('public', tab, predicate) as hash from (values
    ('profiles', 'id <> ''90000000-0000-0000-0000-000000000001'''),
    ('user_preferences', 'user_id <> ''90000000-0000-0000-0000-000000000001'''),
    ('collections', 'owner_id <> ''90000000-0000-0000-0000-000000000001'''),
    ('collection_items', 'collection_id = ''91000000-0000-0000-0000-000000000003'''),
    ('physical_copies', 'user_id <> ''90000000-0000-0000-0000-000000000001'''),
    ('collection_shares', 'collection_id = ''91000000-0000-0000-0000-000000000003'' and recipient_user_id <> ''90000000-0000-0000-0000-000000000001''')
  ) as snapshots(tab, predicate);

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok($$select private.delete_account_data_for_auth_user()$$, '42501', null, 'Cannot call privileged deletion even at aal2');
select throws_ok($$delete from auth.users where id = '90000000-0000-0000-0000-000000000002'$$, '42501', null, 'Cannot delete another Auth identity');
select throws_ok($$delete from profiles where id = '90000000-0000-0000-0000-000000000002'$$, '42501', null, 'Cannot delete another profile');
select is((select count(*) from collections where id::text like '91000000-%'), 3::bigint, 'Caller sees owned and received collections before deletion');
reset role;

-- Fail late, after dependency DELETEs have run. The whole Auth statement rolls back.
create table private.deletion_test_blocker(profile_id uuid references public.profiles(id) on delete restrict);
insert into private.deletion_test_blocker values ('90000000-0000-0000-0000-000000000001');
select throws_ok($$delete from auth.users where id = '90000000-0000-0000-0000-000000000001'$$, '23503', null, 'Late SQL failure aborts entire deletion');
select is((select count(*) from auth.users where id = '90000000-0000-0000-0000-000000000001'), 1::bigint, 'Failure preserves Auth identity');
select is((select count(*) from profiles where id = '90000000-0000-0000-0000-000000000001'), 1::bigint, 'Failure preserves profile');
select is((select count(*) from collections where owner_id = '90000000-0000-0000-0000-000000000001'), 2::bigint, 'Failure restores collections');
select is((select count(*) from collection_items where collection_id in ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002')), 2::bigint, 'Failure restores items');
select is((select count(*) from collection_shares where collection_id::text like '91000000-%'), 3::bigint, 'Failure restores both sharing directions');
select is((select count(*) from physical_copies where user_id = '90000000-0000-0000-0000-000000000001'), 2::bigint, 'Failure restores copies');
select is((select count(*) from user_preferences where user_id = '90000000-0000-0000-0000-000000000001'), 1::bigint, 'Failure preserves preferences');
drop table private.deletion_test_blocker;

select lives_ok($$delete from auth.users where id = '90000000-0000-0000-0000-000000000001'$$, 'Privileged Auth deletion cleans all application dependencies');
select is((select count(*) from auth.users where id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'Auth identity deleted');
select is((select count(*) from profiles where id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'Profile deleted');
select is((select count(*) from user_preferences where user_id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'Preferences deleted');
select is((select count(*) from collections where owner_id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'All owned collections deleted');
select is((select count(*) from collection_items where collection_id in ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002')), 0::bigint, 'Owned collection items deleted');
select is((select count(*) from collection_shares where collection_id = '91000000-0000-0000-0000-000000000001'), 0::bigint, 'Outgoing shares deleted');
select is((select count(*) from collection_shares where recipient_user_id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'Received shares deleted');
select is((select count(*) from physical_copies where user_id = '90000000-0000-0000-0000-000000000001'), 0::bigint, 'Copies with names and notes deleted');
select is(pg_temp.fingerprint('public', tab, predicate), hash, 'Other user rows unchanged: ' || tab) from others_before;
select is(pg_temp.fingerprint(schema_name, tab), hash, 'Catalogue unchanged: ' || schema_name || '.' || tab) from catalogue_before;
select lives_ok($$delete from auth.users where id = '90000000-0000-0000-0000-000000000001'$$, 'Repeated privileged deletion has no further effect');

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","aal":"aal2"}';
select results_eq(format('select count(*) from public.%I', tab), array[0::bigint], 'Residual aal2 JWT cannot read ' || tab)
  from unnest(array['pokemon','tcg_series','tcg_sets','source_cards','catalog_variants','card_pokemon','automatic_target_states','profiles','collections','collection_items','physical_copies','collection_shares','user_preferences']) tab;
select throws_ok($$insert into collections(name, collection_type) values ('Residual token', 'free')$$, '42501', null, 'Residual JWT cannot create collections');
select throws_ok($$insert into physical_copies(variant_id) values (-904)$$, '42501', null, 'Residual JWT cannot create copies');
select throws_ok($$insert into user_preferences(user_id) values (auth.uid())$$, '42501', null, 'Residual JWT cannot recreate preferences');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select count(*) from collections where id::text like '91000000-%'), 1::bigint, 'Other owner keeps its collection but loses the deleted shared collection');
select is((select count(*) from collection_items where collection_id = '91000000-0000-0000-0000-000000000003'), 1::bigint, 'Other owner keeps its items');
select is((select count(*) from physical_copies where variant_id = -904), 1::bigint, 'Other owner keeps its copy');
reset role;
select * from finish();
rollback;
