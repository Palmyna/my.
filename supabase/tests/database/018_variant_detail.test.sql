begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Independent fixtures: no collection, share or physical copy is needed.
insert into auth.users(id) values
  ('a1900000-0000-0000-0000-000000000001'), ('a1900000-0000-0000-0000-000000000002');
delete from public.profiles where id = 'a1900000-0000-0000-0000-000000000002';
insert into public.tcg_series(id, name_fr, name_source) overriding system value values
  (-89001, 'Soleil et Lune', 'Sun & Moon'), (-89002, null, null);
insert into public.tcg_sets(id, series_id, name_fr, name_source, abbreviation_fr, abbreviation, release_date)
  overriding system value values
  (9007199254740997, -89001, 'Légendes Brillantes', 'Shining Legends', 'SL3.5', 'SLG', '2017-10-06'),
  (-89002, -89002, null, null, null, null, '2020-01-01');
insert into public.source_cards(id, set_id, name_fr, local_id, rarity, category, image_url, effective_release_date, source_present, origin)
  overriding system value values
  (9007199254740996, 9007199254740997, 'Pikachu', '28', 'Rare', 'Pokemon', 'https://example.test/card.webp', '2017-10-06', true, 'tcgdex'),
  (-89002, -89002, null, null, null, null, null, '2020-01-01', false, 'my');
insert into public.catalog_variants(id, source_card_id, variant_key, label, variant_type, subtype, size, foil, stamp,
  image_url, effective_release_date, date_origin, french_availability, source_present, origin)
  overriding system value values
  (9007199254740995, 9007199254740996, 'detail-full', 'Reverse', 'reverse', 'special', 'standard', 'holo', array['Z stamp','A stamp','Z stamp'],
    'https://example.test/reverse.webp', '2018-02-03', 'override', 'confirmed', true, 'tcgdex'),
  (-89001, 9007199254740996, 'detail-fallback', null, null, null, null, null, '{}', null, '1999-01-01', 'unknown', 'confirmed', true, 'tcgdex'),
  (-89002, -89002, 'detail-null', null, null, null, null, null, '{}', null, null, 'unknown', 'unknown', false, 'my');
insert into public.pokemon(id,dex_number,name_fr,primary_type,secondary_type) overriding system value values
  (-89026,89026,'Second Pokemon','fire','flying'),
  (9007199254740998,89025,'First Pokemon','electric',null),
  (-89027,89027,null,null,null);
insert into public.card_pokemon(card_id,pokemon_id) values
  (9007199254740996,-89027),(9007199254740996,-89026),(9007199254740996,9007199254740998);

select has_function('public', 'get_variant_detail', array['bigint'], 'BIGINT detail signature');
select function_returns('public', 'get_variant_detail', array['bigint'], 'jsonb', 'JSONB scalar result');
select ok(not prosecdef and provolatile = 's' and proconfig @> array['search_path=""'], 'stable invoker with empty search_path')
  from pg_proc where oid = 'public.get_variant_detail(bigint)'::regprocedure;
select is((select array_agg(r.rolname::text order by r.rolname) from pg_proc p,
  lateral aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
  where p.oid = 'public.get_variant_detail(bigint)'::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner),
  array['authenticated'], 'only authenticated has non-owner EXECUTE');
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
  where p.oid = 'public.get_variant_detail(bigint)'::regprocedure and a.grantee = 0), 'no PUBLIC grant');

set local role anon;
select throws_ok($$select public.get_variant_detail(9007199254740995)$$, '42501', null, 'anon denied');
reset role;
set local role service_role;
select throws_ok($$select public.get_variant_detail(9007199254740995)$$, '42501', null, 'service_role has no RPC grant');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is(public.get_variant_detail(9007199254740995), null::jsonb, 'aal1 cannot read through catalogue RLS');
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.get_variant_detail(9007199254740995), null::jsonb, 'missing MFA claim cannot read');
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
select is(public.get_variant_detail(9007199254740995), null::jsonb, 'residual aal2 JWT without profile cannot read');
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
select is(public.get_variant_detail(9007199254740995), null::jsonb, 'missing identity cannot read');
select set_config('request.jwt.claims', '{"sub":"a1900000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select is(public.get_variant_detail(9007199254740995), '{
  "variant_id":"9007199254740995", "image_url":"https://example.test/reverse.webp",
  "source_card_id":"9007199254740996", "set_id":"9007199254740997",
  "pokemon":[
    {"pokemon_id":"9007199254740998","dex_number":89025,"name_fr":"First Pokemon","primary_type":"electric","secondary_type":null},
    {"pokemon_id":"-89026","dex_number":89026,"name_fr":"Second Pokemon","primary_type":"fire","secondary_type":"flying"},
    {"pokemon_id":"-89027","dex_number":89027,"name_fr":null,"primary_type":null,"secondary_type":null}
  ],
  "card_name_fr":"Pikachu", "local_id":"28", "rarity":"Rare", "category":"Pokemon",
  "set_name_fr":"Légendes Brillantes", "set_name_source":"Shining Legends", "set_abbreviation_fr":"SL3.5", "set_abbreviation":"SLG",
  "series_name_fr":"Soleil et Lune", "series_name_source":"Sun & Moon", "variant_label":"Reverse", "variant_type":"reverse",
  "variant_subtype":"special", "variant_size":"standard", "variant_foil":"holo", "variant_stamps":["Z stamp","A stamp","Z stamp"],
  "effective_release_date":"2018-02-03", "date_origin":"override"
}'::jsonb, 'authorized independent detail: exact 23 fields, all metadata, source Pokemon, stamps in stored order, persisted date/provenance; no personal data');
select is(public.get_variant_detail(9007199254740995)->>'source_card_id','9007199254740996','Exact source Card BIGINT above MAX_SAFE_INTEGER');
select is(public.get_variant_detail(9007199254740995)->>'set_id','9007199254740997','Exact Extension BIGINT above MAX_SAFE_INTEGER');
select is(jsonb_typeof(public.get_variant_detail(9007199254740995)->key),'string',key||' BIGINT text')
  from unnest(array['source_card_id','set_id']) key;
select is(jsonb_typeof(public.get_variant_detail(9007199254740995)->'pokemon'->0->'pokemon_id'),'string','Pokemon BIGINT text');
select is(public.get_variant_detail(-89001)->'pokemon',public.get_variant_detail(9007199254740995)->'pokemon','Different Versions share source Card Pokemon');
select is(public.get_variant_detail(-89002)->'pokemon','[]'::jsonb,'No actual Pokemon yields empty array');
select is(jsonb_typeof(public.get_variant_detail(9007199254740995)->'variant_id'), 'string', 'BIGINT JSON string');
select is(public.get_variant_detail(9007199254740995)->>'variant_id', '9007199254740995', 'BIGINT lossless');
select is(public.get_variant_detail(-89001)->>'image_url', 'https://example.test/card.webp', 'card image fallback');
select is(public.get_variant_detail(-89001)->>'effective_release_date', '1999-01-01', 'historical unknown date not recalculated from card/set');
select is(public.get_variant_detail(-89001)->>'date_origin', 'unknown', 'unknown provenance can accompany a persisted date');
select is(public.get_variant_detail(-89002)->>'variant_id', '-89002', 'existing MY variant without source remains visible');
select is(public.get_variant_detail(-89002)->'variant_stamps', '[]'::jsonb, 'empty stamps stay an array');
select is(value, 'null'::jsonb, key || ' preserves SQL NULL without fallback')
  from jsonb_each(public.get_variant_detail(-89002))
  where key not in ('variant_id', 'variant_stamps', 'date_origin', 'source_card_id', 'set_id', 'pokemon');
select is(public.get_variant_detail(-89999), null::jsonb, 'nonexistent ID returns SQL NULL');
select is(public.get_variant_detail(null), null::jsonb, 'NULL input returns SQL NULL');

reset role;
update public.catalog_variants set is_active = false, source_present = false, french_availability = 'unknown' where id = 9007199254740995;
update public.source_cards set is_active = false, source_present = false where id = 9007199254740996;
update public.tcg_sets set is_active = false where id = 9007199254740997;
update public.tcg_series set is_active = false where id = -89001;
-- Removing direct user-data grants still permits the catalogue query. The existing
-- profile RLS predicate remains authoritative through its pre-resolved helper.
revoke select on public.physical_copies, public.collections, public.collection_items, public.collection_shares, public.profiles from authenticated;
set local role authenticated;
select is(public.get_variant_detail(9007199254740995)->>'variant_id', '9007199254740995',
  'inactive variant/card/set/series, absent source, unknown French availability remain readable without direct user-data access');
select is(public.get_variant_detail(9007199254740995)->>'effective_release_date', '2018-02-03', 'inactive variant keeps persisted date');
select is(jsonb_array_length(public.get_variant_detail(9007199254740995)->'pokemon'),3,'Historical detail preserves every source Pokemon under existing RLS');
reset role;
update public.catalog_variants set french_availability = 'unavailable' where id = 9007199254740995;
set local role authenticated;
select is(public.get_variant_detail(9007199254740995)->>'variant_id', '9007199254740995', 'unavailable French edition also remains readable');
reset role;

select * from finish();
rollback;
