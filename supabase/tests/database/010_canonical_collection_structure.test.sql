begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('private', 'canonical_collection_variants', array['text', 'bigint']);
select ok(not prosecdef and provolatile = 's' and proconfig @> array['search_path=""'],
  'Canonical helper is STABLE, SECURITY INVOKER with an empty search_path')
from pg_proc where oid = 'private.canonical_collection_variants(text,bigint)'::regprocedure;
select ok(not prosecdef and provolatile = 'i' and proconfig @> array['search_path=""'],
  'UTF-16 key helper is immutable, SECURITY INVOKER with an empty search_path')
from pg_proc where oid = 'private.catalog_utf16_sort_key(text)'::regprocedure;
select ok(not has_function_privilege(role_name, 'private.canonical_collection_variants(text,bigint)', 'EXECUTE')
  and not has_function_privilege(role_name, 'private.catalog_utf16_sort_key(text)', 'EXECUTE')
  and not has_schema_privilege(role_name, 'private', 'USAGE'),
  role_name || ' cannot access the internal helpers')
from unnest(array['anon', 'authenticated', 'service_role']) as role_name;
select ok(not exists (
  select 1 from pg_proc as proc cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) as acl
  where proc.oid in ('private.canonical_collection_variants(text,bigint)'::regprocedure,
    'private.catalog_utf16_sort_key(text)'::regprocedure) and acl.grantee = 0
), 'No PUBLIC function privileges');
select ok(not has_table_privilege('authenticated', 'public.collection_items', 'INSERT,UPDATE,DELETE'),
  'No direct collection_items write grant added');

-- Audit every real target before creating fixtures. The catalogue may be empty or populated.
-- json[b]_agg(...)::text would add spaces: use the exact compact JSON of decimal strings.
create temporary table canonical_parity on commit drop as
select target.id, target.target_type, target.content_hash,
  encode(extensions.digest(convert_to(structure.compact_json, 'UTF8'), 'sha256'), 'hex') as actual_hash
from public.automatic_target_states as target
cross join lateral (
  select '[' || coalesce(string_agg(to_json(variant_id::text)::text, ',' order by automatic_rank), '') || ']' as compact_json
  from private.canonical_collection_variants(target.target_type, coalesce(target.pokemon_id, target.set_id))
) as structure;
select is((select count(*) from canonical_parity), (select count(*) from public.automatic_target_states),
  'Global parity covers every persisted automatic target');
select is((select count(*) from canonical_parity where actual_hash is distinct from content_hash), 0::bigint,
  'Every persisted content_hash matches the canonical SQL structure');
select diag(format('Global canonical parity: %s targets, %s divergences', count(*),
  count(*) filter (where actual_hash is distinct from content_hash))) from canonical_parity;
select diag(format('Divergent target %s (%s)', id, target_type))
from canonical_parity where actual_hash is distinct from content_hash;

-- Explicit fixture IDs: no sequence reservations, no mutations of pre-existing rows.
insert into public.pokemon(id, dex_number, is_active) overriding system value values
  (-81001, 81001, false), (-81002, 81002, true), (-81003, 81003, true);
insert into public.tcg_series(id, is_active) overriding system value values (-81001, false);
insert into public.tcg_sets(id, series_id, is_active) overriding system value values
  (-81001, -81001, true), (-81002, -81001, true), (-81003, -81001, false),
  (-81004, -81001, true), (-81005, -81001, true), (-81006, -81001, true);
insert into public.source_cards(id, tcgdex_id, set_id, category, normalized_number,
  effective_release_date, source_present, origin, is_active) overriding system value values
  (-81001, 'canonical-a', -81001, 'Pokemon', 2, '1990-01-01', true, 'tcgdex', true),
  (-81002, 'canonical-b', -81001, 'Trainer', 1, '1990-01-01', true, 'tcgdex', true),
  (-81003, 'canonical-c', -81001, 'Energy', 3, '1990-01-01', true, 'tcgdex', true),
  (-81004, null, -81001, 'Pokemon', 4, '1990-01-01', false, 'my', true),
  (-81005, 'canonical-other-set', -81002, 'Pokemon', 1, '1990-01-01', false, 'tcgdex', true),
  (-81006, 'canonical-inactive-card', -81001, 'Pokemon', 5, '1990-01-01', true, 'tcgdex', false),
  (-81007, 'canonical-inactive-set', -81003, 'Pokemon', 1, '1990-01-01', true, 'tcgdex', true);
insert into private.catalog_entity_keys(entity_key, source_card_id) values ('my:canonical-local-card', -81004);
insert into public.card_pokemon(card_id, pokemon_id) values
  (-81001, -81001), (-81001, -81002), (-81004, -81001), (-81005, -81001),
  (-81006, -81001), (-81007, -81001);
insert into public.catalog_variants(id, source_card_id, variant_key, sort_order, effective_release_date,
  source_present, origin, is_active, size, french_availability) overriding system value values
  (-81101, -81001, 'normal', 1, '2020-01-01', true, 'tcgdex', true, 'standard', 'confirmed'),
  (-81102, -81001, 'holo', 2, '2022-01-01', false, 'my', true, 'standard', 'confirmed'),
  (-81103, -81001, 'reverse', 3, null, true, 'tcgdex', true, 'standard', 'confirmed'),
  (-81104, -81002, 'normal', 1, '2021-01-01', true, 'tcgdex', true, 'standard', 'confirmed'),
  (-81105, -81003, 'normal', 1, '2019-01-01', true, 'tcgdex', true, 'standard', 'confirmed'),
  (-81106, -81004, 'local', 1, '2021-01-01', false, 'my', true, 'standard', 'confirmed'),
  (-81107, -81005, 'normal', 1, '2021-01-01', false, 'tcgdex', true, 'standard', 'confirmed'),
  (-81201, -81001, 'unknown-fr', 4, '2020-01-01', true, 'tcgdex', true, 'standard', 'unknown'),
  (-81202, -81001, 'unavailable-fr', 5, '2020-01-01', true, 'tcgdex', true, 'standard', 'unavailable'),
  (-81203, -81001, 'jumbo', 6, '2020-01-01', true, 'tcgdex', true, 'jumbo', 'confirmed'),
  (-81204, -81001, 'unknown-size', 7, '2020-01-01', true, 'tcgdex', true, null, 'confirmed'),
  (-81205, -81001, 'inactive', 8, '2020-01-01', true, 'tcgdex', false, 'standard', 'confirmed'),
  (-81206, -81006, 'normal', 1, '2020-01-01', true, 'tcgdex', true, 'standard', 'confirmed'),
  (-81207, -81007, 'normal', 1, '2020-01-01', true, 'tcgdex', true, 'standard', 'confirmed');

select results_eq($$select * from private.canonical_collection_variants('pokemon', -81001)$$,
  $$values (-81101::bigint, 1::bigint), (-81107, 2), (-81106, 3), (-81102, 4), (-81103, 5)$$,
  'Pokemon: variant dates (not card dates), known before NULL, then card rank, contiguous ranks');
select results_eq($$select * from private.canonical_collection_variants('pokemon', -81002)$$,
  $$values (-81101::bigint, 1::bigint), (-81102, 2), (-81103, 3)$$,
  'Multi-Pokemon card contributes every eligible variant exactly once to each mapped Pokemon');
select results_eq($$select * from private.canonical_collection_variants('set', -81001)$$,
  $$values (-81104::bigint, 1::bigint), (-81101, 2), (-81102, 3), (-81103, 4), (-81105, 5), (-81106, 6)$$,
  'Set: all categories including Trainer/Energy, card then variant ranks, dates ignored');
select results_eq($$select * from private.canonical_collection_variants('set', -81002)$$,
  $$values (-81107::bigint, 1::bigint)$$,
  'Set target is the exact set, not all sets in its series');
select ok(exists (select 1 from private.canonical_collection_variants('pokemon', -81001) where variant_id = -81102)
  and exists (select 1 from private.canonical_collection_variants('set', -81001) where variant_id = -81106),
  'Local MY. variants and local cards remain eligible when source_present is false');
select ok(exists (select 1 from private.canonical_collection_variants('pokemon', -81001) where variant_id = -81107),
  'Neither source_present nor Pokemon/series activity adds an eligibility filter');
select is((select count(*) from private.canonical_collection_variants('pokemon', -81001) where variant_id between -81207 and -81201),
  0::bigint, 'Unknown/unavailable FR, Jumbo/unknown size, inactive variants/cards/sets are excluded');
select is((select count(*) from private.canonical_collection_variants('set', -81003)), 0::bigint,
  'An existing inactive set has an empty structure');
select is((select count(*) from private.canonical_collection_variants('set', -81004)), 0::bigint,
  'An existing set without eligible cards returns zero rows');
select is((select count(*) from private.canonical_collection_variants('pokemon', -81003)), 0::bigint,
  'An existing Pokemon without mappings returns zero rows');
update public.catalog_variants set effective_release_date = '2020-01-01' where id in (-81101, -81102, -81103);
select results_eq($$select * from private.canonical_collection_variants('pokemon', -81002)$$,
  $$values (-81101::bigint, 1::bigint), (-81102, 2), (-81103, 3)$$,
  'Equal Pokemon dates retain persisted variant rank before variant identity');

-- Force equal persisted ranks to exercise every textual tie-breaker, independently of IDs.
insert into public.source_cards(id, tcgdex_id, set_id, normalized_number, source_present, origin)
  overriding system value values
  (-81301, 'canonical-tie-z', -81005, 1, true, 'tcgdex'),
  (-81302, 'canonical-tie-a', -81005, 1, true, 'tcgdex'),
  (-81303, null, -81005, 1, false, 'my'),
  (-81304, null, -81006, 1, false, 'my'),
  (-81305, null, -81006, 1, false, 'my');
insert into private.catalog_entity_keys(entity_key, source_card_id) values
  ('my:canonical-tie-local', -81303),
  ('my:canonical-' || chr(128512), -81304),
  ('my:canonical-' || chr(57344), -81305);
insert into public.catalog_variants(id, source_card_id, variant_key, sort_order,
  source_present, origin, size, french_availability) overriding system value values
  (-81401, -81301, 'a', 1, true, 'tcgdex', 'standard', 'confirmed'),
  (-81402, -81302, 'z', 1, true, 'tcgdex', 'standard', 'confirmed'),
  (-81403, -81302, 'a', 1, true, 'tcgdex', 'standard', 'confirmed'),
  (-81404, -81303, 'local', 1, false, 'my', 'standard', 'confirmed'),
  (-81405, -81303, 'later-rank', 2, false, 'my', 'standard', 'confirmed'),
  (-81501, -81304, chr(57344), 1, false, 'my', 'standard', 'confirmed'),
  (-81502, -81304, chr(128512), 1, false, 'my', 'standard', 'confirmed'),
  (-9007199254740993, -81305, 'local', 1, false, 'my', 'standard', 'confirmed');
insert into public.card_pokemon(card_id, pokemon_id) values
  (-81301, -81003), (-81302, -81003), (-81303, -81003);
select results_eq($$select * from private.canonical_collection_variants('set', -81005)$$,
  $$values (-81404::bigint, 1::bigint), (-81403, 2), (-81402, 3), (-81401, 4), (-81405, 5)$$,
  'Equal card ranks: variant rank, canonical card key (including MY. alias), then variant identity, never numeric ID');
select results_eq($$select * from private.canonical_collection_variants('pokemon', -81003)$$,
  $$values (-81404::bigint, 1::bigint), (-81403, 2), (-81402, 3), (-81401, 4), (-81405, 5)$$,
  'Pokemon uses the same final tie-breakers when dates are equal');
select results_eq($$select * from private.canonical_collection_variants('set', -81006)$$,
  $$values (-81502::bigint, 1::bigint), (-81501, 2), (-9007199254740993, 3)$$,
  'Card keys and variant identities follow JS UTF-16 ordering, including supplementary characters');
select is(private.catalog_utf16_sort_key('A' || chr(128512) || chr(57344)), array[65, 55357, 56832, 57344],
  'UTF-16 sort key preserves surrogate pair order');
select ok(private.catalog_utf16_sort_key('a') < private.catalog_utf16_sort_key('aa')
  and private.catalog_utf16_sort_key('Z') < private.catalog_utf16_sort_key('a'),
  'JS string comparison handles prefixes and case independently of locale');
select is(private.catalog_utf16_sort_key(''), '{}'::integer[], 'Empty string has an empty sort key');
select is((select '[' || string_agg(to_json(variant_id::text)::text, ',' order by automatic_rank) || ']'
  from private.canonical_collection_variants('set', -81006)), '["-81502","-81501","-9007199254740993"]',
  'Canonical JSON is compact and preserves bigint IDs as decimal strings without rounding');
select is((select encode(extensions.digest(convert_to('[' || coalesce(
  string_agg(to_json(variant_id::text)::text, ',' order by automatic_rank), '') || ']', 'UTF8'), 'sha256'), 'hex')
  from private.canonical_collection_variants('set', -81004)),
  '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'Empty structure hashes the literal compact JSON []');

select throws_ok($$select * from private.canonical_collection_variants('series', -81001)$$,
  '22023', 'Invalid automatic target type', 'Unsupported target type is rejected');
select throws_ok($$select * from private.canonical_collection_variants(null, -81001)$$,
  '22023', 'Invalid automatic target type', 'NULL type is rejected');
select throws_ok($$select * from private.canonical_collection_variants('set', null)$$,
  '22023', 'Automatic target ID is required', 'NULL target ID is rejected');
select throws_ok($$select * from private.canonical_collection_variants('pokemon', -81999)$$,
  'P0002', 'Automatic target does not exist', 'Missing Pokemon differs from an existing empty target');
select throws_ok($$select * from private.canonical_collection_variants('set', -81999)$$,
  'P0002', 'Automatic target does not exist', 'Missing set differs from an existing empty target');
set local role anon;
select throws_ok($$select * from private.canonical_collection_variants('set', -81001)$$,
  '42501', null, 'Anonymous API role cannot invoke the helper');
reset role;
set local role authenticated;
select throws_ok($$select * from private.canonical_collection_variants('set', -81001)$$,
  '42501', null, 'Authenticated API role cannot invoke the helper');
reset role;

select * from finish();
rollback;
