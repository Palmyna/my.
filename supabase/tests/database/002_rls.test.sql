begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Synthetic fixtures only; all tests roll back. No TCGdex data or Auth signup.
insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004');
insert into public.profiles (id) select id from auth.users where id::text like '10000000-%';
insert into public.pokemon (id, dex_number, name_fr) overriding system value values (-1, 900001, 'Test Pokemon');
insert into public.tcg_series (id, tcgdex_id) overriding system value values (-1, 'test-series');
insert into public.tcg_sets (id, tcgdex_id, series_id) overriding system value values (-1, 'test-set', -1);
insert into public.source_cards (id, tcgdex_id, set_id, origin, source_present) overriding system value
  values (-1, 'test-card', -1, 'my', false);
insert into public.catalog_variants (id, source_card_id, variant_key, origin, source_present, french_availability)
  overriding system value values
  (-1, -1, 'test-a', 'my', false, 'confirmed'),
  (-2, -1, 'test-b', 'my', false, 'confirmed'),
  (-3, -1, 'test-c', 'my', false, 'unknown');
insert into public.card_pokemon values (-1, -1);
insert into public.automatic_target_states (target_type, pokemon_id, generation_version, content_hash)
  values ('pokemon', -1, 1, 'synthetic-structure');
insert into public.collections (id, owner_id, name, collection_type) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Shared test', 'free'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Private test', 'free');
insert into public.collections (id, owner_id, name, collection_type, automatic_target_type, target_pokemon_id, applied_target_version)
  values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Automatic test', 'automatic', 'pokemon', -1, 1);
insert into public.collection_items (id, collection_id, variant_id, origin, sort_position, automatic_rank) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', -1, 'manual', 1, null),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', -2, 'manual', 1, null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', -1, 'automatic', 1, 1);
insert into public.physical_copies (id, user_id, variant_id, note) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', -1, 'Shared copy A'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', -1, 'Shared copy B'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', -2, 'Private copy'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', -1, 'Third party same variant');
insert into public.collection_shares (id, collection_id, recipient_user_id) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004');

-- Verify object privileges independently of row policies.
select ok(not has_table_privilege('anon', 'public.pokemon', 'SELECT'), 'anon has no SELECT grant on pokemon');
select ok(not has_table_privilege('authenticated', 'public.pokemon', 'TRUNCATE'), 'authenticated cannot TRUNCATE pokemon');
select ok(not has_table_privilege('anon', 'public.tcg_series', 'SELECT'), 'anon has no SELECT grant on tcg_series');
select ok(not has_table_privilege('authenticated', 'public.tcg_series', 'TRUNCATE'), 'authenticated cannot TRUNCATE tcg_series');
select ok(not has_table_privilege('anon', 'public.tcg_sets', 'SELECT'), 'anon has no SELECT grant on tcg_sets');
select ok(not has_table_privilege('authenticated', 'public.tcg_sets', 'TRUNCATE'), 'authenticated cannot TRUNCATE tcg_sets');
select ok(not has_table_privilege('anon', 'public.source_cards', 'SELECT'), 'anon has no SELECT grant on source_cards');
select ok(not has_table_privilege('authenticated', 'public.source_cards', 'TRUNCATE'), 'authenticated cannot TRUNCATE source_cards');
select ok(not has_table_privilege('anon', 'public.catalog_variants', 'SELECT'), 'anon has no SELECT grant on catalog_variants');
select ok(not has_table_privilege('authenticated', 'public.catalog_variants', 'TRUNCATE'), 'authenticated cannot TRUNCATE catalog_variants');
select ok(not has_table_privilege('anon', 'public.card_pokemon', 'SELECT'), 'anon has no SELECT grant on card_pokemon');
select ok(not has_table_privilege('authenticated', 'public.card_pokemon', 'TRUNCATE'), 'authenticated cannot TRUNCATE card_pokemon');
select ok(not has_table_privilege('anon', 'public.automatic_target_states', 'SELECT'), 'anon has no SELECT grant on automatic_target_states');
select ok(not has_table_privilege('authenticated', 'public.automatic_target_states', 'TRUNCATE'), 'authenticated cannot TRUNCATE automatic_target_states');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon has no SELECT grant on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE'), 'authenticated cannot TRUNCATE profiles');
select ok(not has_table_privilege('anon', 'public.collections', 'SELECT'), 'anon has no SELECT grant on collections');
select ok(not has_table_privilege('authenticated', 'public.collections', 'TRUNCATE'), 'authenticated cannot TRUNCATE collections');
select ok(not has_table_privilege('anon', 'public.collection_items', 'SELECT'), 'anon has no SELECT grant on collection_items');
select ok(not has_table_privilege('authenticated', 'public.collection_items', 'TRUNCATE'), 'authenticated cannot TRUNCATE collection_items');
select ok(not has_table_privilege('anon', 'public.physical_copies', 'SELECT'), 'anon has no SELECT grant on physical_copies');
select ok(not has_table_privilege('authenticated', 'public.physical_copies', 'TRUNCATE'), 'authenticated cannot TRUNCATE physical_copies');
select ok(not has_table_privilege('anon', 'public.collection_shares', 'SELECT'), 'anon has no SELECT grant on collection_shares');
select ok(not has_table_privilege('authenticated', 'public.collection_shares', 'TRUNCATE'), 'authenticated cannot TRUNCATE collection_shares');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'No general authenticated private schema access');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'No anonymous private schema access');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'No API schema creation');
select ok(not has_function_privilege('anon', 'private.owns_collection(uuid)', 'EXECUTE'), 'Owner predicate not executable by anon');
select ok(has_function_privilege('authenticated', 'private.owns_collection(uuid)', 'EXECUTE'), 'Authenticated policy can evaluate private predicate by OID');
select ok(not has_function_privilege('authenticated', 'private.set_updated_at()', 'EXECUTE'), 'Technical timestamp trigger not callable directly');
select ok(not has_function_privilege('authenticated', 'private.set_profile_public_id()', 'EXECUTE'), 'Public ID trigger not callable directly');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where pronamespace = 'private'::regnamespace), 'Every private function has a safe search_path');
create table public.phase1_future_table(id integer);
select ok(not has_table_privilege('anon', 'public.phase1_future_table', 'SELECT'), 'Future table has no inherited anonymous grant');
select ok(not has_table_privilege('authenticated', 'public.phase1_future_table', 'SELECT'), 'Future table has no inherited authenticated grant');
create function public.phase1_future_function() returns integer language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.phase1_future_function()', 'EXECUTE'), 'Future functions closed to anon');
select ok(not has_function_privilege('authenticated', 'public.phase1_future_function()', 'EXECUTE'), 'Future functions closed to authenticated');

-- Owner positive cases and structural write boundaries.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from profiles ), 1::bigint, 'Owner reads only own profile');
select is((select count(*) from collections ), 3::bigint, 'Owner reads all owned collections');
select is((select count(*) from collection_items ), 3::bigint, 'Owner reads all owned items');
select is((select count(*) from physical_copies ), 3::bigint, 'Owner reads own copies only');
select is((select count(*) from collection_shares ), 2::bigint, 'Owner sees all recipients');
select lives_ok($$insert into collections(name, collection_type) values ('Browser free', 'free')$$, 'Owner creates free collection with server identity');
select lives_ok($$update collections set name = 'Renamed' where id = '20000000-0000-0000-0000-000000000001'$$, 'Owner renames collection');
select is((select count(*) from collections where name = 'Renamed'), 1::bigint, 'Rename persisted');
select throws_ok($$insert into collections(owner_id, name, collection_type) values ('10000000-0000-0000-0000-000000000002', 'Forged', 'free')$$, '42501', null, 'Cannot choose collection owner');
select throws_ok($$update collections set owner_id = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$$, '42501', null, 'Cannot transfer collection through API');
select throws_ok($$update collections set applied_target_version = 42 where id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, 'Cannot forge applied version');
select throws_ok($$update collections set target_pokemon_id = -1 where id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, 'Cannot retarget automatic collection through API');
select throws_ok($$insert into collections(name, collection_type) values ('Forbidden', 'automatic')$$, '42501', null, 'Automatic collection creation requires future operation');
select throws_ok($$insert into collection_items(collection_id, variant_id, origin, sort_position) values ('20000000-0000-0000-0000-000000000003', -2, 'manual', 2)$$, '42501', null, 'Item insertion awaits controlled operation');
select throws_ok($$update collection_items set automatic_rank = 9 where collection_id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, 'Owner cannot forge automatic ranks');
select throws_ok($$update collection_items set sort_position = 9 where collection_id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, 'Owner cannot move automatic items arbitrarily');
select throws_ok($$delete from collection_items where collection_id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, 'Owner cannot delete automatic items arbitrarily');
select throws_ok($$update profiles set public_id = 'MY-22222-22222-22222-22222'$$, '42501', null, 'Owner cannot write public ID');
select throws_ok($$insert into profiles(id) values ('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'No profile insertion before Auth integration');
select throws_ok($$insert into collection_shares(collection_id, recipient_user_id) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002')$$, '42501', null, 'Share creation awaits public-ID operation');
select lives_ok($$insert into physical_copies(variant_id, condition, note) values (-3, 'Unspecified test', 'Browser copy')$$, 'Owner creates individual copy');
select is((select count(*) from physical_copies ), 4::bigint, 'Copy assigned to caller');
select lives_ok($$update physical_copies set note = 'Edited', is_graded = true, grading_score = 'A+' where variant_id = -3$$, 'Owner edits copy');
select throws_ok($$update physical_copies set user_id = '10000000-0000-0000-0000-000000000002' where variant_id = -3$$, '42501', null, 'Cannot transfer copy through API');
select throws_ok($$insert into physical_copies(user_id, variant_id) values ('10000000-0000-0000-0000-000000000002', -1)$$, '42501', null, 'Cannot create copy for another user');
select lives_ok($$delete from physical_copies where variant_id = -3$$, 'Owner deletes own copy');
select is((select count(*) from physical_copies ), 3::bigint, 'Own copy deletion persisted');
select results_eq($$delete from physical_copies where user_id <> auth.uid() returning id$$, $$select null::uuid where false$$, 'Owner cannot delete third-party copy');
select ok((select count(*) > 0 from pokemon), 'Authenticated catalogue read: pokemon');
select throws_ok($$delete from pokemon$$, '42501', null, 'Authenticated catalogue DELETE denied: pokemon');
select ok((select count(*) > 0 from tcg_series), 'Authenticated catalogue read: tcg_series');
select throws_ok($$delete from tcg_series$$, '42501', null, 'Authenticated catalogue DELETE denied: tcg_series');
select ok((select count(*) > 0 from tcg_sets), 'Authenticated catalogue read: tcg_sets');
select throws_ok($$delete from tcg_sets$$, '42501', null, 'Authenticated catalogue DELETE denied: tcg_sets');
select ok((select count(*) > 0 from source_cards), 'Authenticated catalogue read: source_cards');
select throws_ok($$delete from source_cards$$, '42501', null, 'Authenticated catalogue DELETE denied: source_cards');
select ok((select count(*) > 0 from catalog_variants), 'Authenticated catalogue read: catalog_variants');
select throws_ok($$delete from catalog_variants$$, '42501', null, 'Authenticated catalogue DELETE denied: catalog_variants');
select ok((select count(*) > 0 from card_pokemon), 'Authenticated catalogue read: card_pokemon');
select throws_ok($$delete from card_pokemon$$, '42501', null, 'Authenticated catalogue DELETE denied: card_pokemon');
select ok((select count(*) > 0 from automatic_target_states), 'Authenticated catalogue read: automatic_target_states');
select throws_ok($$delete from automatic_target_states$$, '42501', null, 'Authenticated catalogue DELETE denied: automatic_target_states');
select throws_ok($$insert into pokemon(dex_number) values (900002)$$, '42501', null, 'Catalogue INSERT denied');
select throws_ok($$update catalog_variants set is_active = false$$, '42501', null, 'Catalogue UPDATE denied');
select throws_ok($$select private.owns_collection('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'Private helper inaccessible through direct schema lookup');

-- Recipient gets only the shared collection, its items and relevant owner copies.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select is((select count(*) from profiles ), 1::bigint, 'Recipient only sees own profile');
select results_eq($$select id from collections$$, $$values ('20000000-0000-0000-0000-000000000001'::uuid)$$, 'Recipient sees exactly shared collection');
select is((select count(*) from collection_items ), 1::bigint, 'Recipient sees only shared items');
select is((select count(*) from physical_copies ), 2::bigint, 'Recipient sees both relevant owner copies');
select is((select count(*) from physical_copies where variant_id = -2), 0::bigint, 'No other owner variants');
select is((select count(*) from physical_copies where user_id = '10000000-0000-0000-0000-000000000003'), 0::bigint, 'Same variant belonging to another owner stays private');
select results_eq($$select id from collection_shares$$, $$values ('50000000-0000-0000-0000-000000000001'::uuid)$$, 'Recipient cannot enumerate other recipients');
select results_eq($$update collections set name = 'Hacked' where id = '20000000-0000-0000-0000-000000000001' returning id$$, $$select null::uuid where false$$, 'Recipient cannot rename shared collection');
select results_eq($$delete from collections where id = '20000000-0000-0000-0000-000000000001' returning id$$, $$select null::uuid where false$$, 'Recipient cannot delete shared collection');
select throws_ok($$update collection_items set sort_position = 99 where collection_id = '20000000-0000-0000-0000-000000000001'$$, '42501', null, 'Recipient cannot modify shared items');
select throws_ok($$insert into collection_items(collection_id, variant_id, origin, sort_position) values ('20000000-0000-0000-0000-000000000001', -2, 'manual', 2)$$, '42501', null, 'Recipient cannot add shared item');
select throws_ok($$delete from collection_items$$, '42501', null, 'Recipient cannot delete shared item');
select results_eq($$update physical_copies set note = 'Hacked' returning id$$, $$select null::uuid where false$$, 'Recipient cannot modify owner copies');
select results_eq($$delete from physical_copies returning id$$, $$select null::uuid where false$$, 'Recipient cannot delete owner copies');
select results_eq($$delete from collection_shares where id = '50000000-0000-0000-0000-000000000002' returning id$$, $$select null::uuid where false$$, 'Recipient cannot remove other recipient');
select throws_ok($$update collection_shares set recipient_user_id = '10000000-0000-0000-0000-000000000003' where id = '50000000-0000-0000-0000-000000000001'$$, '42501', null, 'Recipient cannot redirect share');

-- Unrelated authenticated caller and anonymous role.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select is((select count(*) from collections ), 0::bigint, 'Third party sees no collections');
select is((select count(*) from collection_items ), 0::bigint, 'Third party sees no collection_items');
select is((select count(*) from collection_shares ), 0::bigint, 'Third party sees no collection_shares');
select is((select count(*) from physical_copies where user_id = '10000000-0000-0000-0000-000000000001'), 0::bigint, 'Third party cannot read owner copies');
select is((select count(*) from profiles ), 1::bigint, 'Third party cannot browse other profiles');
select is((select count(*) from physical_copies ), 1::bigint, 'Third party still reads own independent copy');
select results_eq($$delete from collection_shares returning id$$, $$select null::uuid where false$$, 'Third party cannot revoke shares');
select results_eq($$update collections set name = 'Hacked' returning id$$, $$select null::uuid where false$$, 'Third party cannot rename collections');
select results_eq($$delete from collections returning id$$, $$select null::uuid where false$$, 'Third party cannot delete collections');
select results_eq($$update physical_copies set note = 'Hacked' where user_id = '10000000-0000-0000-0000-000000000001' returning id$$, $$select null::uuid where false$$, 'Third party cannot edit owner copies');
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok($$select * from pokemon$$, '42501', null, 'Anonymous read denied: pokemon');
select throws_ok($$select * from tcg_series$$, '42501', null, 'Anonymous read denied: tcg_series');
select throws_ok($$select * from tcg_sets$$, '42501', null, 'Anonymous read denied: tcg_sets');
select throws_ok($$select * from source_cards$$, '42501', null, 'Anonymous read denied: source_cards');
select throws_ok($$select * from catalog_variants$$, '42501', null, 'Anonymous read denied: catalog_variants');
select throws_ok($$select * from card_pokemon$$, '42501', null, 'Anonymous read denied: card_pokemon');
select throws_ok($$select * from automatic_target_states$$, '42501', null, 'Anonymous read denied: automatic_target_states');
select throws_ok($$select * from profiles$$, '42501', null, 'Anonymous read denied: profiles');
select throws_ok($$select * from collections$$, '42501', null, 'Anonymous read denied: collections');
select throws_ok($$select * from collection_items$$, '42501', null, 'Anonymous read denied: collection_items');
select throws_ok($$select * from physical_copies$$, '42501', null, 'Anonymous read denied: physical_copies');
select throws_ok($$select * from collection_shares$$, '42501', null, 'Anonymous read denied: collection_shares');
select throws_ok($$insert into collections(name, collection_type) values ('Anon', 'free')$$, '42501', null, 'Anonymous writes denied');

-- Grant-independent RLS checks: temporarily give write privileges in this test
-- transaction to demonstrate that WITH CHECK also rejects owner reassignment.
reset role;
grant update(user_id) on physical_copies to authenticated;
grant update(owner_id) on collections to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select throws_ok($$update physical_copies set user_id = '10000000-0000-0000-0000-000000000002' where id = '40000000-0000-0000-0000-000000000001'$$, '42501', null, 'Copy WITH CHECK independently rejects ownership reassignment');
select throws_ok($$update collections set owner_id = '10000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000002'$$, '42501', null, 'Collection WITH CHECK independently rejects ownership reassignment');
reset role;
revoke update(user_id) on physical_copies from authenticated;
revoke update(owner_id) on collections from authenticated;

-- Both parties can remove a share, with immediate loss of access and no cascade.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select lives_ok($$delete from collection_shares where id = '50000000-0000-0000-0000-000000000001'$$, 'Recipient removes own share');
select is((select count(*) from collections ), 0::bigint, 'Recipient loses collection access after removal');
select is((select count(*) from collection_items ), 0::bigint, 'Recipient loses item access after removal');
select is((select count(*) from physical_copies ), 0::bigint, 'Recipient loses owner-copy access after removal');
reset role;
select is((select count(*) from collections ), 4::bigint, 'Share deletion preserved all collections');
select is((select count(*) from collection_items ), 3::bigint, 'Share deletion preserved all items');
select is((select count(*) from physical_copies ), 4::bigint, 'Share deletion preserved all copies');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select lives_ok($$delete from collection_shares where id = '50000000-0000-0000-0000-000000000002'$$, 'Owner removes another share');
select is((select count(*) from collection_shares ), 0::bigint, 'Owner removal persisted');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
select is((select count(*) from collections ), 0::bigint, 'Second recipient loses collection access');
select is((select count(*) from physical_copies ), 0::bigint, 'Second recipient loses copy access');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select lives_ok($$delete from collections where id = '20000000-0000-0000-0000-000000000002'$$, 'Owner deletes owned collection through RLS');
select is((select count(*) from physical_copies ), 3::bigint, 'Owner collection deletion preserves copies');

-- Trusted role uses actual grants and triggers, without a browser JWT.
reset role;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000005');
set local role service_role;
set local request.jwt.claim.sub = '';
select lives_ok($$insert into pokemon(dex_number) values (900002)$$, 'Trusted role writes catalogue using identity sequence');
select lives_ok($$insert into profiles(id) values ('10000000-0000-0000-0000-000000000005')$$, 'Trusted role profile insertion invokes private generation trigger');
select throws_ok($$select private.set_updated_at()$$, '42501', null, 'Trusted role cannot directly call trigger helper');
reset role;
select * from finish();
rollback;
