begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values ('a2100000-0000-0000-0000-000000000001'), ('a2100000-0000-0000-0000-000000000002');
delete from public.profiles where id = 'a2100000-0000-0000-0000-000000000002';
insert into public.pokemon(id,dex_number,name_fr,primary_type,secondary_type) overriding system value values
  (-91001,91001,'Pokémon test','fire','flying'), (-91002,91002,null,null,null), (-91003,91003,'Vide',null,null);
insert into public.tcg_series(id,name_fr,name_source,is_active) overriding system value values (-91001,'Série FR','Series',false);
insert into public.tcg_sets(id,series_id,name_fr,name_source,abbreviation_fr,abbreviation,release_date,logo_url,symbol_url,is_active)
  overriding system value values
  (-91001,-91001,'Extension FR','Set','ASC','SSP','2020-01-01','https://example.test/logo','https://example.test/symbol',true),
  (-91002,-91001,null,null,null,null,null,null,null,false), (-91003,-91001,null,null,null,null,null,null,null,true);
insert into public.source_cards(id,tcgdex_id,set_id,name_fr,local_id,rarity,category,image_url,normalized_number,effective_release_date,source_present,origin,is_active)
  overriding system value values
  (-91001,'catalog-card-10',-91001,'Carte Pokémon','10','Rare','Pokemon','https://example.test/card',2,'2020-01-01',true,'tcgdex',true),
  (-91002,'catalog-card-2A',-91001,'Dresseur','2A',null,'Trainer',null,1,null,true,'tcgdex',true),
  (-91003,'catalog-card-TG01',-91001,'Sans image','TG01',null,null,null,3,null,true,'tcgdex',true),
  (-91004,'catalog-card-inactive',-91001,'Inactive','11',null,null,null,5,null,true,'tcgdex',false),
  (-91005,'catalog-card-inactive-set',-91002,'Set inactif','1',null,null,null,1,null,true,'tcgdex',true),
  (-91006,'catalog-card-unavailable',-91001,'FR inconnue','12',null,null,null,6,null,true,'tcgdex',true),
  (-91007,null,-91001,'MY.','MY01',null,null,null,4,null,false,'my',true);
insert into private.catalog_entity_keys(entity_key,source_card_id,variant_id) values
  ('my:catalog-local-card',-91007,null);
insert into public.card_pokemon(card_id,pokemon_id) values
  (-91001,-91001),(-91003,-91001),(-91003,-91002),(-91004,-91001),(-91005,-91001),(-91006,-91001),(-91007,-91001);
insert into public.catalog_variants(id,source_card_id,variant_key,label,sort_order,image_url,effective_release_date,size,french_availability,is_active,source_present,origin)
  overriding system value values
  (9007199254740995,-91001,'normal','Normale',1,null,'2020-01-01','standard','confirmed',true,true,'tcgdex'),
  (-91102,-91001,'reverse','Reverse',2,'https://example.test/reverse','2019-01-01','standard','confirmed',true,true,'tcgdex'),
  (-91103,-91002,'normal',null,1,'https://example.test/trainer','2018-01-01','standard','confirmed',true,true,'tcgdex'),
  (-91104,-91003,'normal',null,1,null,null,'standard','confirmed',true,true,'tcgdex'),
  (-91105,-91003,'reverse',null,2,'https://example.test/fallback','2022-01-01','standard','confirmed',true,true,'tcgdex'),
  (-91106,-91007,'my',null,1,'https://example.test/my','2021-01-01','standard','confirmed',true,false,'my'),
  (-91201,-91001,'unknown',null,3,null,null,'standard','unknown',true,true,'tcgdex'),
  (-91202,-91001,'unavailable',null,4,null,null,'standard','unavailable',true,true,'tcgdex'),
  (-91203,-91001,'jumbo',null,5,null,null,'jumbo','confirmed',true,true,'tcgdex'),
  (-91204,-91001,'null-size',null,6,null,null,null,'confirmed',true,true,'tcgdex'),
  (-91205,-91001,'inactive',null,7,null,null,'standard','confirmed',false,true,'tcgdex'),
  (-91206,-91004,'normal',null,1,null,null,'standard','confirmed',true,true,'tcgdex'),
  (-91207,-91005,'normal',null,1,null,null,'standard','confirmed',true,true,'tcgdex'),
  (-91208,-91006,'unknown',null,1,null,null,'standard','unknown',true,true,'tcgdex');
insert into private.catalog_entity_keys(entity_key,variant_id) values ('my:catalog-variant-alias',9007199254740995);

select has_column('public','pokemon','primary_type','Primary type column');
select has_column('public','pokemon','secondary_type','Secondary type column');
select throws_ok($$update public.pokemon set primary_type='stellar' where id=-91001$$,'23514',null,'Unknown primary type denied');
select throws_ok($$update public.pokemon set secondary_type='unknown' where id=-91001$$,'23514',null,'Unknown secondary type denied');
select throws_ok($$update public.pokemon set primary_type=null where id=-91001$$,'23514',null,'Secondary without primary denied');
select throws_ok($$update public.pokemon set secondary_type='fire' where id=-91001$$,'23514',null,'Identical types denied');
select lives_ok($$update public.pokemon set primary_type=null,secondary_type=null where id=-91002$$,'Absent metadata stays nullable');
select lives_ok(format('update public.pokemon set primary_type=%L,secondary_type=null where id=-91002',type_name),'Allowed type '||type_name)
  from unnest(array['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy']) type_name;
update public.pokemon set primary_type=null where id=-91002;
select function_returns('public',name,array['bigint'],'jsonb','JSONB contract '||name)
  from unnest(array['get_catalog_pokemon','get_catalog_set','get_catalog_card']) name;
select ok(not prosecdef and provolatile='s' and proconfig @> array['search_path=""'],proname||' stable invoker, empty path')
  from pg_proc where oid in ('public.get_catalog_pokemon(bigint)'::regprocedure,'public.get_catalog_set(bigint)'::regprocedure,'public.get_catalog_card(bigint)'::regprocedure);
select is((select array_agg(r.rolname::text order by r.rolname) from lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),array['authenticated'],p.proname||' only authenticated EXECUTE')
  from pg_proc p where oid in ('public.get_catalog_pokemon(bigint)'::regprocedure,'public.get_catalog_set(bigint)'::regprocedure,'public.get_catalog_card(bigint)'::regprocedure);
select ok(not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where a.grantee=0
  and p.oid in ('public.get_catalog_pokemon(bigint)'::regprocedure,'public.get_catalog_set(bigint)'::regprocedure,'public.get_catalog_card(bigint)'::regprocedure)),'No PUBLIC grants');
select ok(has_column_privilege('authenticated','private.catalog_entity_keys','entity_key','SELECT')
  and not has_column_privilege('authenticated','private.catalog_entity_keys','variant_id','SELECT')
  and not has_table_privilege('authenticated','private.catalog_entity_keys','INSERT,UPDATE,DELETE'), 'Card-key dependency has minimal column-only read grants');
select ok(not has_table_privilege('authenticated','private.catalog_sync_runs','SELECT')
  and not has_table_privilege('authenticated','private.catalog_overrides','SELECT'),'Audits and corrections remain closed');

set local role anon;
select throws_ok('select public.'||name||'(-91001)','42501',null,'anon denied '||name)
  from unnest(array['get_catalog_pokemon','get_catalog_set','get_catalog_card']) name;
reset role;
set local role service_role;
select throws_ok('select public.'||name||'(-91001)','42501',null,'service_role denied '||name)
  from unnest(array['get_catalog_pokemon','get_catalog_set','get_catalog_card']) name;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2100000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(public.get_catalog_pokemon(-91001),null::jsonb,'aal1 Pokemon invisible');
select is(public.get_catalog_set(-91001),null::jsonb,'aal1 Set invisible');
select is(public.get_catalog_card(-91001),null::jsonb,'aal1 Card invisible');
select is(public.get_catalog_card(-91999),null::jsonb,'aal1 missing indistinguishable');
select is((select count(*) from private.catalog_entity_keys),0::bigint,'aal1 no card-key leak');
select set_config('request.jwt.claims','{"sub":"a2100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.get_catalog_pokemon(-91001),null::jsonb,'Missing MFA Pokemon invisible');
select is(public.get_catalog_set(-91001),null::jsonb,'Missing MFA Set invisible');
select is(public.get_catalog_card(-91001),null::jsonb,'Missing MFA Card invisible');
select is(public.get_catalog_card(-91999),null::jsonb,'Missing MFA missing indistinguishable');
select is((select count(*) from private.catalog_entity_keys),0::bigint,'Missing MFA no card-key leak');
select set_config('request.jwt.claims','{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select is(public.get_catalog_pokemon(-91001),null::jsonb,'No profile Pokemon invisible');
select is(public.get_catalog_set(-91001),null::jsonb,'No profile Set invisible');
select is(public.get_catalog_card(-91001),null::jsonb,'No profile Card invisible');
select is(public.get_catalog_card(-91999),null::jsonb,'No profile missing indistinguishable');
select is((select count(*) from private.catalog_entity_keys),0::bigint,'No profile no card-key leak');
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
select is(public.get_catalog_pokemon(-91001),null::jsonb,'Missing identity Pokemon invisible');
select is(public.get_catalog_set(-91001),null::jsonb,'Missing identity Set invisible');
select is(public.get_catalog_card(-91001),null::jsonb,'Missing identity Card invisible');
select is(public.get_catalog_card(-91999),null::jsonb,'Missing identity missing indistinguishable');
select is((select count(*) from private.catalog_entity_keys),0::bigint,'Missing identity no card-key leak');
select set_config('request.jwt.claims','{"sub":"a2100000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.get_catalog_pokemon(null),null::jsonb,'NULL Pokemon unavailable');
select is(public.get_catalog_set(null),null::jsonb,'NULL Set unavailable');
select is(public.get_catalog_card(null),null::jsonb,'NULL Card unavailable');
select is(public.get_catalog_pokemon(-91999),null::jsonb,'Missing Pokemon unavailable');
select is(public.get_catalog_set(-91999),null::jsonb,'Missing Set unavailable');
select is(public.get_catalog_card(-91999),null::jsonb,'Missing Card unavailable');
select is(public.get_catalog_pokemon(-91003),null::jsonb,'Empty Pokemon unavailable');
select is(public.get_catalog_set(-91003),null::jsonb,'Empty Set unavailable');
select is(public.get_catalog_set(-91002),null::jsonb,'Inactive Set unavailable');
select is(public.get_catalog_card(card_id),null::jsonb,'Unavailable Card '||card_id) from unnest(array[-91004,-91005,-91006]) card_id;
select is(public.get_catalog_pokemon(-91001)-'variants','{"pokemon_id":"-91001","dex_number":91001,"name_fr":"Pokémon test","primary_type":"fire","secondary_type":"flying","variant_count":5}'::jsonb,'Exact Pokemon header');
select is(public.get_catalog_set(-91001)-'variants','{"set_id":"-91001","name_fr":"Extension FR","name_source":"Set","abbreviation_fr":"ASC","abbreviation":"SSP","release_date":"2020-01-01","logo_url":"https://example.test/logo","symbol_url":"https://example.test/symbol","series":{"series_id":"-91001","name_fr":"Série FR","name_source":"Series"},"variant_count":6}'::jsonb,'Exact Set header, inactive series remains metadata');
select is((select jsonb_agg(entry->>'variant_id') from jsonb_array_elements(public.get_catalog_pokemon(-91001)->'variants') entry),
  '["-91102","9007199254740995","-91106","-91105","-91104"]'::jsonb,'Pokemon order: effective date, natural rank, variant; NULL last');
select is((select jsonb_agg(entry->>'variant_id') from jsonb_array_elements(public.get_catalog_set(-91001)->'variants') entry),
  '["-91103","9007199254740995","-91102","-91104","-91105","-91106"]'::jsonb,'Set order: 2A,10,TG01,MY01 then variants; dates ignored');
select is(public.get_catalog_pokemon(-91001)->'variants'->0,'{"source_card_id":"-91001","variant_id":"-91102","image_url":"https://example.test/reverse","card_name_fr":"Carte Pokémon","set_id":"-91001","set_name_fr":"Extension FR","set_name_source":"Set","set_abbreviation_fr":"ASC","set_abbreviation":"SSP","local_id":"10","variant_label":"Reverse","effective_release_date":"2019-01-01"}'::jsonb,'Exact Pokemon variant, navigation metadata, no personal data');
select is(public.get_catalog_set(-91001)->'variants'->0,'{"source_card_id":"-91002","variant_id":"-91103","image_url":"https://example.test/trainer","card_name_fr":"Dresseur","local_id":"2A","rarity":null,"category":"Trainer","variant_label":null,"effective_release_date":"2018-01-01","pokemon":[]}'::jsonb,'Exact Set variant: no repeated Set header');
select is(public.get_catalog_set(-91001)->'variants'->3->'pokemon','[{"pokemon_id":"-91001","dex_number":91001,"name_fr":"Pokémon test"},{"pokemon_id":"-91002","dex_number":91002,"name_fr":null}]'::jsonb,'Light Pokemon relationships for local search');
select is(public.get_catalog_card(-91001),'{
  "source_card_id":"-91001","name_fr":"Carte Pokémon","local_id":"10","rarity":"Rare","category":"Pokemon","effective_release_date":"2020-01-01","image_url":"https://example.test/card",
  "set":{"set_id":"-91001","name_fr":"Extension FR","name_source":"Set","abbreviation_fr":"ASC","abbreviation":"SSP"},
  "series":{"series_id":"-91001","name_fr":"Série FR","name_source":"Series"},
  "pokemon":[{"pokemon_id":"-91001","dex_number":91001,"name_fr":"Pokémon test","primary_type":"fire","secondary_type":"flying"}],
  "variants":[{"variant_id":"9007199254740995","image_url":"https://example.test/card","variant_label":"Normale","effective_release_date":"2020-01-01"},
    {"variant_id":"-91102","image_url":"https://example.test/reverse","variant_label":"Reverse","effective_release_date":"2019-01-01"}]
}'::jsonb,'Exact source Card contract, types, BIGINT strings and canonical variants; source image preferred');
select is(public.get_catalog_card(-91003)->>'image_url','https://example.test/fallback','First canonical eligible image, skipping NULL');
select is(public.get_catalog_card(-91003)->'variants'->0->'image_url','null'::jsonb,'No invented variant image');
select is(jsonb_typeof(public.get_catalog_card(-91001)->'variants'->0->'variant_id'),'string','BIGINT exposed as string');
select is((select count(*) from private.catalog_entity_keys where entity_key='my:catalog-variant-alias'),0::bigint,'Variant identity aliases remain hidden');
select is((select entity_key from private.catalog_entity_keys where source_card_id=-91007),'my:catalog-local-card','MY. card key readable for canonical ties only');
-- Global parity with the very reader used by new automatic collections.
select is((select count(*) from public.automatic_target_states target
  where coalesce((select jsonb_agg(entry->>'variant_id') from jsonb_array_elements(
    case when target.target_type='pokemon' then public.get_catalog_pokemon(target.pokemon_id)
    else public.get_catalog_set(target.set_id) end -> 'variants') entry),'[]'::jsonb)
  is distinct from (select coalesce(jsonb_agg(variant_id::text order by automatic_rank),'[]'::jsonb)
    from private.canonical_collection_variants(target.target_type,coalesce(target.pokemon_id,target.set_id)))),
  0::bigint,'Every real target: RPC ordered universe equals new automatic collection');
reset role;
create temporary table catalog_structure_before as select target_type, coalesce(pokemon_id,set_id) target_id,content_hash,generation_version
  from public.automatic_target_states;
create temporary table fixture_order_before as select * from private.canonical_collection_variants('pokemon',-91001);
update public.pokemon set primary_type='water',secondary_type='ice' where id=-91001;
select results_eq($$select * from private.canonical_collection_variants('pokemon',-91001)$$,$$select * from fixture_order_before$$,'Type-only change preserves canonical order');
select results_eq($$select target_type,coalesce(pokemon_id,set_id),content_hash,generation_version from public.automatic_target_states$$,
  $$select * from catalog_structure_before$$,'Type-only change preserves all hashes and generation versions');
update public.catalog_variants set image_url=null where id in (-91104,-91105);
-- No direct user-data grants are needed by these catalogue readers.
revoke select on public.collections,public.collection_items,public.physical_copies,public.collection_shares,public.profiles from authenticated;
set local role authenticated;
select is(public.get_catalog_card(-91003)->'image_url','null'::jsonb,'All eligible images NULL: representative stays NULL');
select is(public.get_catalog_pokemon(-91001)->>'primary_type','water','Updated type visible without reading possessions/collections/profiles directly');
select is(public.get_catalog_set(-91001)->>'variant_count','6','No personal data dependency');
reset role;
select * from finish();
rollback;
