begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'pokemon', 'pokemon exists');
select ok((select relrowsecurity from pg_class where oid = 'public.pokemon'::regclass), 'pokemon explicitly enables RLS');
select has_table('public', 'tcg_series', 'tcg_series exists');
select ok((select relrowsecurity from pg_class where oid = 'public.tcg_series'::regclass), 'tcg_series explicitly enables RLS');
select has_table('public', 'tcg_sets', 'tcg_sets exists');
select ok((select relrowsecurity from pg_class where oid = 'public.tcg_sets'::regclass), 'tcg_sets explicitly enables RLS');
select has_table('public', 'source_cards', 'source_cards exists');
select ok((select relrowsecurity from pg_class where oid = 'public.source_cards'::regclass), 'source_cards explicitly enables RLS');
select has_table('public', 'catalog_variants', 'catalog_variants exists');
select ok((select relrowsecurity from pg_class where oid = 'public.catalog_variants'::regclass), 'catalog_variants explicitly enables RLS');
select has_table('public', 'card_pokemon', 'card_pokemon exists');
select ok((select relrowsecurity from pg_class where oid = 'public.card_pokemon'::regclass), 'card_pokemon explicitly enables RLS');
select has_table('public', 'automatic_target_states', 'automatic_target_states exists');
select ok((select relrowsecurity from pg_class where oid = 'public.automatic_target_states'::regclass), 'automatic_target_states explicitly enables RLS');
select has_table('public', 'profiles', 'profiles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles explicitly enables RLS');
select has_table('public', 'collections', 'collections exists');
select ok((select relrowsecurity from pg_class where oid = 'public.collections'::regclass), 'collections explicitly enables RLS');
select has_table('public', 'collection_items', 'collection_items exists');
select ok((select relrowsecurity from pg_class where oid = 'public.collection_items'::regclass), 'collection_items explicitly enables RLS');
select has_table('public', 'physical_copies', 'physical_copies exists');
select ok((select relrowsecurity from pg_class where oid = 'public.physical_copies'::regclass), 'physical_copies explicitly enables RLS');
select has_table('public', 'collection_shares', 'collection_shares exists');
select ok((select relrowsecurity from pg_class where oid = 'public.collection_shares'::regclass), 'collection_shares explicitly enables RLS');

select col_is_pk('public', 'profiles', 'id', 'Profile ID is its primary key');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'Profile references Auth identity');
select fk_ok('public', 'physical_copies', 'variant_id', 'public', 'catalog_variants', 'id', 'Copies reference variants');
select fk_ok('public', 'collection_items', 'collection_id', 'public', 'collections', 'id', 'Items reference collections');
select col_type_is('public', 'source_cards', 'effective_release_date', 'date', 'Full effective release date');
select col_type_is('public', 'collection_items', 'sort_position', 'numeric(40,20)', 'Exact fractional positioning');
select col_type_is('public', 'profiles', 'public_id', 'citext', 'Public ID equality ignores case');
select hasnt_column('public', 'physical_copies', 'collection_id', 'Copies are independent of collections');
select hasnt_column('public', 'physical_copies', 'quantity', 'One row per physical copy');
select hasnt_column('public', 'collection_shares', 'status', 'Share existence means active');
select is((select count(*) from information_schema.tables where table_schema = 'private'), 3::bigint, 'Phase 2 pipeline tables remain private');

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

select ok((select bool_and(public_id::text ~ '^MY-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-){3}[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$') from profiles), 'Every profile receives a valid canonical public ID');
select is((select count(distinct public_id) from profiles), 4::bigint, 'Generated IDs differ');
select is((select count(*) from profiles where public_id = (select lower(public_id::text)::citext from profiles limit 1)), 1::bigint, 'Case-insensitive lookup returns the same profile');
select throws_ok($$update profiles set public_id = lower(public_id::text)$$, '23514', 'public_id is immutable', 'Case-only update also forbidden');
select throws_ok($$update profiles set public_id = 'MY-22222-22222-22222-22222'$$, '23514', 'public_id is immutable', 'Changing public ID forbidden');
select throws_ok($$update profiles set public_id = null$$, '23514', 'public_id is immutable', 'Clearing public ID forbidden');
select lives_ok($$update profiles set public_id = public_id$$, 'Keeping existing public ID is harmless');
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000005');
select is((select count(*) from profiles), 4::bigint, 'No premature Auth signup trigger');
select throws_ok($$insert into profiles(id, public_id) values ('10000000-0000-0000-0000-000000000005', 'MY-22222-22222-22222-22222')$$, '23514', 'public_id must be generated by MY.', 'Caller cannot choose public ID');
-- Inspect constraints independently of generation, only as administrator in this rollback.
alter table profiles disable trigger profiles_public_id;
select throws_ok($$insert into profiles(id, public_id) select '10000000-0000-0000-0000-000000000005', public_id from profiles limit 1$$, '23505', null, 'Public ID unique constraint rejects duplicates');
select throws_ok($$insert into profiles(id, public_id) values ('10000000-0000-0000-0000-000000000005', 'MY-00000-22222-22222-22222')$$, '23514', null, 'Ambiguous characters fail SQL format constraint');
select throws_ok($$insert into profiles(id, public_id) values ('10000000-0000-0000-0000-000000000005', 'my-aaaaa-aaaaa-aaaaa-aaaaa')$$, '23514', null, 'Stored lowercase forbidden by SQL constraint');
select throws_ok($$insert into profiles(id, public_id) values ('10000000-0000-0000-0000-000000000005', 'MY-22222')$$, '23514', null, 'Short public ID forbidden');
-- Temporarily remove format check to isolate the case-insensitive unique index itself.
alter table profiles drop constraint profiles_public_id_format;
select throws_ok($$insert into profiles(id, public_id) select '10000000-0000-0000-0000-000000000005', lower(public_id::text)::citext from profiles limit 1$$, '23505', null, 'Uniqueness also rejects lowercase duplicate independently of format');
alter table profiles add constraint profiles_public_id_format check (
 public_id::text collate "C" ~ '^MY-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-){3}[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'
);
alter table profiles enable trigger profiles_public_id;
select throws_ok($$insert into profiles(id) values ('10000000-0000-0000-0000-000000000099')$$, '23503', null, 'Profile cannot exist without Auth user');
select throws_ok($$delete from auth.users where id = '10000000-0000-0000-0000-000000000001'$$, '23503', null, 'No account deletion cascade');

select throws_ok($$insert into pokemon(dex_number) values (900001)$$, '23505', null, 'Dex number unique');
select throws_ok($$insert into pokemon(dex_number) values (null)$$, '23502', null, 'Dex number required');
select throws_ok($$insert into tcg_series(tcgdex_id) values ('test-series')$$, '23505', null, 'Series external ID unique');
select throws_ok($$insert into tcg_sets(tcgdex_id, series_id) values ('test-set', -1)$$, '23505', null, 'Set external ID unique');
select throws_ok($$insert into source_cards(tcgdex_id, set_id, origin, source_present) values ('test-card', -1, 'my', false)$$, '23505', null, 'Card external ID unique');
select throws_ok($$insert into source_cards(set_id, origin, source_present) values (-99, 'my', false)$$, '23503', null, 'Card requires existing set');
select ok((select effective_release_date is null from source_cards where id = -1), 'No release date invented');
select throws_ok($$insert into catalog_variants(source_card_id, variant_key, origin, source_present) values (-1, 'test-a', 'my', false)$$, '23505', null, 'Variant key unique within card');
select throws_ok($$update catalog_variants set french_availability = 'maybe' where id = -1$$, '23514', null, 'French availability controlled');
select throws_ok($$update source_cards set origin = 'other' where id = -1$$, '23514', null, 'Catalogue origin controlled');
select throws_ok($$insert into card_pokemon values (-1, -1)$$, '23505', null, 'Card-Pokemon relation unique');
select throws_ok($$update automatic_target_states set set_id = -1$$, '23514', null, 'Target state cannot have both targets');
select throws_ok($$update automatic_target_states set pokemon_id = null$$, '23514', null, 'Target state must have a target');
select throws_ok($$update automatic_target_states set target_type = 'set'$$, '23514', null, 'Target state type must match target');
select throws_ok($$update automatic_target_states set generation_version = 0$$, '23514', null, 'Generation version positive');
select throws_ok($$update automatic_target_states set content_hash = ''$$, '23514', null, 'Hash nonempty');
select throws_ok($$insert into automatic_target_states(target_type, pokemon_id, generation_version, content_hash) values ('pokemon', -1, 1, 'test')$$, '23505', null, 'One state per Pokemon');
select lives_ok($$insert into automatic_target_states(target_type, set_id, generation_version, content_hash) values ('set', -1, 1, repeat('x', 256))$$, 'Set state and future long hashes supported');
select throws_ok($$insert into automatic_target_states(target_type, set_id, generation_version, content_hash) values ('set', -1, 1, 'test')$$, '23505', null, 'One state per set');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'free', null, -1, null, null)$$, '23514', null, 'Free collection cannot have Pokemon target');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'free', null, null, null, 1)$$, '23514', null, 'Free collection cannot have applied version');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'free', 'set', null, null, null)$$, '23514', null, 'Free collection cannot have target type');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', null, -1, null, 1)$$, '23514', null, 'Automatic target type required (SQL NULL guarded)');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'pokemon', null, null, 1)$$, '23514', null, 'Automatic Pokemon target required');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'pokemon', -1, -1, 1)$$, '23514', null, 'Double automatic target rejected');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'set', -1, null, 1)$$, '23514', null, 'Set type cannot target Pokemon');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'set', null, null, 1)$$, '23514', null, 'Automatic set target required');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'pokemon', -1, null, null)$$, '23514', null, 'Automatic applied version required');
select throws_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, target_set_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Invalid', 'automatic', 'pokemon', -1, null, 0)$$, '23514', null, 'Automatic applied version positive');

select lives_ok($$insert into collections(owner_id, name, collection_type, automatic_target_type, target_pokemon_id, applied_target_version) values ('10000000-0000-0000-0000-000000000001', 'Same target allowed', 'automatic', 'pokemon', -1, 1)$$, 'Multiple collections for same target allowed');
select throws_ok($$update collections set collection_type = 'free', automatic_target_type = null, target_pokemon_id = null, applied_target_version = null where id = '20000000-0000-0000-0000-000000000003'$$, '23514', 'collection_type is immutable in V1', 'Type stable after creation');
select throws_ok($$insert into collection_items(collection_id, variant_id, origin, sort_position) values ('20000000-0000-0000-0000-000000000001', -1, 'manual', 2)$$, '23505', null, 'Variant unique in collection');
select throws_ok($$update collection_items set automatic_rank = 1 where id = '30000000-0000-0000-0000-000000000001'$$, '23514', null, 'Manual rank absent');
select throws_ok($$update collection_items set automatic_rank = null where id = '30000000-0000-0000-0000-000000000003'$$, '23514', null, 'Automatic rank required');
select throws_ok($$update collection_items set automatic_rank = 0 where id = '30000000-0000-0000-0000-000000000003'$$, '23514', null, 'Automatic rank positive');
select throws_ok($$insert into collection_items(collection_id, variant_id, origin, sort_position, automatic_rank) values ('20000000-0000-0000-0000-000000000001', -2, 'automatic', 2, 1)$$, '23514', 'Free collections only contain manual items', 'Free collection rejects automatic item');
select throws_ok($$update collection_items set collection_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000003'$$, '23514', null, 'Automatic item cannot move into free collection');
select lives_ok($$insert into collection_items(collection_id, variant_id, origin, sort_position) values ('20000000-0000-0000-0000-000000000001', -2, 'manual', 2), ('20000000-0000-0000-0000-000000000001', -3, 'manual', (1::numeric + 2) / 2)$$, 'Midpoint insertion avoids renumbering');
select results_eq($$select variant_id from collection_items where collection_id = '20000000-0000-0000-0000-000000000001' order by sort_position, id$$, array[-1,-3,-2]::bigint[], 'Fractional positions preserve expected order');
select throws_ok($$update collection_items set sort_position = 'NaN' where id = '30000000-0000-0000-0000-000000000001'$$, '23514', null, 'NaN cannot be a position');

select throws_ok($$update physical_copies set grading_company = 'Test' where id = '40000000-0000-0000-0000-000000000001'$$, '23514', null, 'Ungraded copy has no grading company');
select throws_ok($$update physical_copies set grading_score = 'A+' where id = '40000000-0000-0000-0000-000000000001'$$, '23514', null, 'Ungraded copy has no grading score');
select lives_ok($$update physical_copies set is_graded = true where id = '40000000-0000-0000-0000-000000000001'$$, 'Graded copy may have unknown company and score');
select lives_ok($$update physical_copies set grading_score = 'A+', condition = 'Custom condition' where id = '40000000-0000-0000-0000-000000000001'$$, 'Condition and score remain textual');
select throws_ok($$insert into collection_shares(collection_id, recipient_user_id) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$, '23514', null, 'Self-sharing impossible');
select throws_ok($$insert into collection_shares(collection_id, recipient_user_id) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$$, '23505', null, 'Duplicate sharing impossible');
select throws_ok($$update collection_shares set recipient_user_id = '10000000-0000-0000-0000-000000000001' where id = '50000000-0000-0000-0000-000000000001'$$, '23514', null, 'Self-share blocked on UPDATE');
select throws_ok($$update collections set owner_id = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$$, '23514', null, 'Privileged owner change cannot create self-share');

select throws_ok($$delete from catalog_variants where id = -1$$, '23503', null, 'Referenced variant protected');
select throws_ok($$delete from source_cards where id = -1$$, '23503', null, 'No destructive card cascade');
select throws_ok($$delete from tcg_sets where id = -1$$, '23503', null, 'No destructive set cascade');
select lives_ok($$delete from collections where id = '20000000-0000-0000-0000-000000000001'$$, 'Collection can be deleted');
select is((select count(*) from collection_items where collection_id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'Collection deletion cascades to items');
select is((select count(*) from collection_shares where collection_id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'Collection deletion cascades to shares');
select is((select count(*) from physical_copies), 4::bigint, 'Collection deletion preserves all copies');
delete from collection_items where variant_id = -2;
select throws_ok($$delete from catalog_variants where id = -2$$, '23503', null, 'Copy-only reference protects variant');
delete from physical_copies where variant_id = -1;
select throws_ok($$delete from catalog_variants where id = -1$$, '23503', null, 'Item-only reference protects variant');
select lives_ok($$update catalog_variants set is_active = false, source_present = false where id = -1$$, 'Inactivation preserves referenced identity');
select is((select count(*) from collection_items where variant_id = -1), 1::bigint, 'Inactivation does not remove item');
update collections set updated_at = '2000-01-01' where id = '20000000-0000-0000-0000-000000000002';
select ok((select updated_at > '2000-01-01'::timestamptz from collections where id = '20000000-0000-0000-0000-000000000002'), 'Common trigger owns updated_at');

select * from finish();
rollback;
