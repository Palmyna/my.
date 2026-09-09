begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The real Auth service role is exercised separately by the local HTTP signup smoke.
insert into auth.users(id, raw_user_meta_data) values
  ('70000000-0000-0000-0000-000000000001', '{"public_id":"MY-22222-22222-22222-22222","aal":"aal2"}'),
  ('70000000-0000-0000-0000-000000000002', '{}');
select is((select count(*) from profiles where id::text like '70000000-%'), 2::bigint, 'Auth insert creates exactly one profile per user');
select ok((select bool_and(public_id::text ~ '^MY-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-){3}[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$') from profiles where id::text like '70000000-%'), 'Automatic profiles reuse the canonical generator');
select isnt((select public_id::text from profiles where id = '70000000-0000-0000-0000-000000000001'), 'MY-22222-22222-22222-22222', 'Client metadata cannot provide public_id');
select is((select count(*) from user_preferences where user_id::text like '70000000-%'), 0::bigint, 'Signup does not precreate preferences');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.create_profile_for_auth_user()'::regprocedure), 'Signup trigger has narrowly scoped definer privileges and empty search_path');
select ok(not has_function_privilege(role_name, 'private.create_profile_for_auth_user()', 'EXECUTE'), role_name || ' cannot invoke signup helper')
  from unnest(array['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) role_name;
select is((select count(*) from pg_policies where schemaname = 'public' and policyname = 'require_mfa' and permissive = 'RESTRICTIVE' and cmd = 'ALL' and roles = array['authenticated']::name[] and qual is not null and with_check is not null), 13::bigint, 'All 13 application tables restrict reads AND writes to aal2');

insert into pokemon(id, dex_number) overriding system value values (-703, 900703);
insert into tcg_series(id, tcgdex_id) overriding system value values (-703, 'auth-test-series');
insert into tcg_sets(id, tcgdex_id, series_id) overriding system value values (-703, 'auth-test-set', -703);
insert into source_cards(id, tcgdex_id, set_id, origin, source_present) overriding system value values (-703, 'auth-test-card', -703, 'my', false);
insert into catalog_variants(id, source_card_id, variant_key, origin, source_present) overriding system value values (-703, -703, 'auth-test', 'my', false);
insert into card_pokemon values (-703, -703);
insert into automatic_target_states(target_type, pokemon_id, generation_version, content_hash) values ('pokemon', -703, 1, 'auth-test');
insert into collections(id, owner_id, name, collection_type) values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Auth test', 'free');
insert into collection_items(collection_id, variant_id, origin, sort_position) values ('71000000-0000-0000-0000-000000000001', -703, 'manual', 1);
insert into physical_copies(user_id, variant_id) values ('70000000-0000-0000-0000-000000000001', -703);
insert into collection_shares(collection_id, recipient_user_id) values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002');
insert into user_preferences(user_id) values ('70000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","aal":"aal1","user_metadata":{"aal":"aal2"}}';
select results_eq(format('select count(*) from public.%I', tab), array[0::bigint], 'aal1 cannot read ' || tab)
  from unnest(array['pokemon','tcg_series','tcg_sets','source_cards','catalog_variants','card_pokemon','automatic_target_states','profiles','collections','collection_items','physical_copies','collection_shares','user_preferences']) tab;
select throws_ok($$insert into collections(name, collection_type) values ('Denied', 'free')$$, '42501', null, 'aal1 cannot create collection');
select throws_ok($$insert into physical_copies(variant_id) values (-703)$$, '42501', null, 'aal1 cannot create copy');
select throws_ok($$insert into user_preferences(user_id) values (auth.uid()) on conflict (user_id) do update set last_catalog_view = 'cards'$$, '42501', null, 'aal1 cannot upsert preferences');
select results_eq($$update collections set name = 'Denied' returning id$$, $$select null::uuid where false$$, 'aal1 cannot update collections');
select results_eq($$update physical_copies set note = 'Denied' returning id$$, $$select null::uuid where false$$, 'aal1 cannot update copies');
select results_eq($$update user_preferences set last_catalog_view = 'cards' returning user_id$$, $$select null::uuid where false$$, 'aal1 cannot update preferences');
select results_eq($$delete from collection_shares returning id$$, $$select null::uuid where false$$, 'aal1 cannot revoke shares');
select results_eq($$delete from physical_copies returning id$$, $$select null::uuid where false$$, 'aal1 cannot delete copies');
select results_eq($$delete from collections returning id$$, $$select null::uuid where false$$, 'aal1 cannot delete collections');

set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000002","aal":"aal1"}';
select is((select count(*) from collections), 0::bigint, 'aal1 recipient cannot bypass MFA through sharing');
select throws_ok($$insert into user_preferences(user_id) values (auth.uid())$$, '42501', null, 'aal1 cannot insert new preferences');
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001"}';
select is((select count(*) from profiles), 0::bigint, 'Missing AAL fails closed');
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","aal":"aal3"}';
select is((select count(*) from profiles), 0::bigint, 'Unknown AAL fails closed');

set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","aal":"aal2"}';
select results_eq(format('select count(*) > 0 from public.%I', tab), array[true], 'aal2 reads permitted data in ' || tab)
  from unnest(array['pokemon','tcg_series','tcg_sets','source_cards','catalog_variants','card_pokemon','automatic_target_states','profiles','collections','collection_items','physical_copies','collection_shares','user_preferences']) tab;
select is((select count(*) from profiles), 1::bigint, 'aal2 still reads only its own profile');
select lives_ok($$insert into collections(name, collection_type) values ('Allowed', 'free')$$, 'aal2 creates own free collection');
select lives_ok($$update user_preferences set last_catalog_view = 'cards' where user_id = auth.uid()$$, 'aal2 edits own preferences');
select is((select last_catalog_view from user_preferences), 'cards', 'aal2 update actually persisted');
select throws_ok($$insert into profiles(id) values (auth.uid())$$, '42501', null, 'aal2 cannot create profiles');
select throws_ok($$update profiles set public_id = 'MY-22222-22222-22222-22222'$$, '42501', null, 'aal2 cannot change public ID');

set local role service_role;
set local request.jwt.claims = '{}';
select ok((select count(*) >= 2 from profiles), 'service_role reads profiles without AAL');
select lives_ok($$update user_preferences set last_catalog_view = 'list' where user_id = '70000000-0000-0000-0000-000000000001'$$, 'service_role maintenance writes without AAL');
select lives_ok($$update pokemon set name_fr = 'Auth fixture' where id = -703$$, 'service_role catalogue maintenance unaffected');
select throws_ok($$update profiles set public_id = 'MY-22222-22222-22222-22222' where id = '70000000-0000-0000-0000-000000000001'$$, '23514', 'public_id is immutable', 'Trusted maintenance still respects identity immutability');
reset role;

-- Deterministically exercise the improbable collision path. All DDL rolls back.
-- Sequence increments survive the trigger subtransaction and count retry attempts.
create temporary sequence collision_attempts;
create function pg_temp.force_profile_collision() returns trigger language plpgsql as $$
begin
  if nextval('pg_temp.collision_attempts') <= tg_argv[0]::integer then
    new.public_id := (select public_id from public.profiles where id = '70000000-0000-0000-0000-000000000001');
  end if;
  return new;
end;
$$;
create trigger zz_test_collision before insert on profiles for each row execute function pg_temp.force_profile_collision('1');
select lives_ok($$insert into auth.users(id) values ('70000000-0000-0000-0000-000000000010')$$, 'Signup retries a generated public ID collision');
select is((select last_value from pg_temp.collision_attempts), 2::bigint, 'Collision retried exactly once');
select is((select count(*) from profiles where id = '70000000-0000-0000-0000-000000000010'), 1::bigint, 'Retried signup has exactly one profile');
drop trigger zz_test_collision on profiles;
alter sequence pg_temp.collision_attempts restart with 1;
create trigger zz_test_collision before insert on profiles for each row execute function pg_temp.force_profile_collision('5');
select throws_ok($$insert into auth.users(id) values ('70000000-0000-0000-0000-000000000011')$$, '23505', null, 'Persistent collision fails signup instead of leaving an orphan');
select is((select last_value from pg_temp.collision_attempts), 5::bigint, 'Retries are bounded');
select is((select count(*) from auth.users where id = '70000000-0000-0000-0000-000000000011'), 0::bigint, 'Failed profile creation rolls back Auth user');

select * from finish();
rollback;
