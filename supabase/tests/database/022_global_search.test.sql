begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir global_search.fixtures.inc

select function_returns('public','search_global_navigation',array['text'],'jsonb','Scalar JSONB signature');
select ok(not prosecdef and provolatile='s' and proconfig @> array['search_path=""'], 'STABLE invoker, empty path')
  from pg_proc where oid='public.search_global_navigation(text)'::regprocedure;
select is((select array_agg(r.rolname::text order by r.rolname) from lateral aclexplode(p.proacl) a
  join pg_roles r on r.oid=a.grantee where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),
  array['authenticated'], proname||' exact non-owner grants') from pg_proc p where oid in (
    'public.search_global_navigation(text)'::regprocedure,'private.catalog_search_normalize(text)'::regprocedure,
    'private.catalog_search_score(text[],integer[],text,integer,text[])'::regprocedure,
    'private.navigation_name_score(text,text[])'::regprocedure);
select ok(not exists(select 1 from lateral aclexplode(p.proacl) a where a.grantee=0),proname||' no PUBLIC execution')
  from pg_proc p where oid in ('public.search_global_navigation(text)'::regprocedure,
    'private.navigation_name_score(text,text[])'::regprocedure);
select ok(not has_function_privilege(role_name,f,'EXECUTE'),role_name||' denied '||f)
  from unnest(array['anon','service_role']) role_name cross join unnest(array[
    'public.search_global_navigation(text)','private.catalog_search_normalize(text)',
    'private.catalog_search_score(text[],integer[],text,integer,text[])','private.navigation_name_score(text,text[])']) f;
select ok(not has_schema_privilege('authenticated','private','CREATE'),'No private schema CREATE');
select ok(not has_table_privilege('authenticated','private.catalog_entity_keys','SELECT'),'No general private table read');
select ok(has_column_privilege('authenticated','private.catalog_entity_keys',col,'SELECT'),'Existing identity column '||col)
  from unnest(array['entity_key','source_card_id']) col;
select ok(not has_column_privilege('authenticated','private.catalog_entity_keys',col,'SELECT'),'Other private column closed '||col)
  from unnest(array['variant_id']) col;
select ok(not has_table_privilege('authenticated',t,privilege),'No added write '||t||' '||privilege)
  from unnest(array['public.pokemon','public.tcg_sets','public.source_cards','public.catalog_variants','public.card_pokemon',
    'private.catalog_entity_keys']) t cross join unnest(array['INSERT','UPDATE','DELETE']) privilege;
select ok(not has_column_privilege('authenticated','public.collections','owner_id','INSERT')
  and not has_column_privilege('authenticated','public.collections','owner_id','UPDATE'),'Collection owner writes remain closed');
select ok(not has_table_privilege('authenticated','public.collection_shares','INSERT'),'No new sharing writes');
select ok(to_regprocedure('public.catalog_search_normalize(text)') is null
  and to_regprocedure('public.catalog_search_score(text[],integer[],text,integer,text[])') is null
  and to_regprocedure('public.navigation_name_score(text,text[])') is null,'Helpers are not public RPCs');
select ok(not prosecdef and prosrc !~ '(public|private)\.', proname||' pure invoker helper')
  from pg_proc where oid in ('private.catalog_search_normalize(text)'::regprocedure,
    'private.catalog_search_score(text[],integer[],text,integer,text[])'::regprocedure,
    'private.navigation_name_score(text,text[])'::regprocedure);
select is(private.catalog_search_normalize('  ÉVOLI’ — CŒUR Æ  '),'evoli'' - coeur ae','Existing NFKD accents ligatures punctuation');
select is(private.navigation_name_score('151',array['151']),240,'Numeric nominal exact including phrase bonus');
select is(private.navigation_name_score('eclair brillant',array['eclair']),60,'Nominal whole word');
select is(private.navigation_name_score('eclair brillant',array['ecl']),40,'Nominal prefix');
select is(private.navigation_name_score('eclair brillant',array['cla']),15,'Nominal partial');
select is(private.navigation_name_score('eclair brillant',array['eclair','absent']),null::integer,'Nominal AND');

set local role anon;
select throws_ok($$select public.search_global_navigation('Fixture7e1')$$,'42501',null,'Anonymous denied');
reset role;
set local role service_role;
select throws_ok($$select public.search_global_navigation('Fixture7e1')$$,'42501',null,'Service role denied');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7e10000-0000-0000-0000-000000000001","aal":"aal1"}';
select throws_ok($$select public.search_global_navigation('Fixture7e1')$$,'42501','global_search_not_authorized','AAL1 denied');
set local request.jwt.claims = '{"sub":"a7e10000-0000-0000-0000-000000000003","aal":"aal2"}';
select throws_ok($$select public.search_global_navigation('Fixture7e1')$$,'42501','global_search_not_authorized','Missing profile denied');
set local request.jwt.claims = '{"aal":"aal2"}';
select throws_ok($$select public.search_global_navigation('Fixture7e1')$$,'42501','global_search_not_authorized','Missing identity denied');
set local request.jwt.claims = '{"sub":"a7e10000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok(format('select public.search_global_navigation(%L)',query),'22023','global_search_invalid_query','Invalid length or useful terms')
  from unnest(array[null,'','ab','😀😀','!!!','  / — : ','́́́',repeat('é',201),repeat('😀',201)]) query;
select is(public.search_global_navigation(repeat('é',200)),'[]'::jsonb,'200 Unicode characters accepted');
select is(public.search_global_navigation('AbsentUnique7e1'),'[]'::jsonb,'Valid no match is empty array');

-- Reuse snapshots for assertions; every value was obtained under viewer RLS.
create temporary table navigation_results(query text primary key, value jsonb);
insert into navigation_results select query,public.search_global_navigation(query) from unnest(array[
  'fixture7e1','fixture7e1 éclair','fixture7e1 carte','fixture7e1 28/73','fixture7e1 28',
  'fixture7e1 GS7E1A','fixture7e1 GS7E1B','tcgdex:fixture7e1-28','my:fixture7e1-alliance',
  'fixture7e1 evoli coeur d''or','GS7E1A','SérieSeule7e1','151','97001',
  'Fallback7e1','AliasNom7e1','SecretSeul7e1','RetiréSeul7e1','JumboSeul7e1',
  'JumboSet7e1','EmptySet7e1','SansVersion7e1','InactiveCard7e1','InactiveSet7e1','NullSize7e1',
  'xture7e1','fixture7e1 ecl','fixture7e1 clair','TieNom7e1'
]) query;
select is(jsonb_array_length(value),10,'Total maximum with all quotas filled') from navigation_results where query='fixture7e1';
select is((select array_agg(x->>'kind' order by n) from jsonb_array_elements(value) with ordinality t(x,n)),
  array['pokemon','pokemon','set','set','collection','collection','card','card','card','card'],'Authoritative category order 2/2/2/4')
  from navigation_results where query='fixture7e1';
select is(value->0->>'pokemon_id','9007199254740995','Exact Pokemon before word/prefix/partial') from navigation_results where query='fixture7e1';
select is(value->1->>'pokemon_id','-97002','Word Pokemon before prefix/partial') from navigation_results where query='fixture7e1';
select is(value->0->>'primary_type','electric','Primary type payload') from navigation_results where query='fixture7e1';
select is(value->1->>'secondary_type','flying','Secondary type payload') from navigation_results where query='fixture7e1';
select is(jsonb_typeof(value->0->'pokemon_id'),'string','Pokemon BIGINT text') from navigation_results where query='fixture7e1';
select is(value->2->>'set_id','-97001','Exact Extension before word/prefix') from navigation_results where query='fixture7e1';
select is(value->3->>'set_id','-97002','Word Extension before prefix') from navigation_results where query='fixture7e1';
select is(jsonb_typeof(value->2->'set_id'),'string','Extension BIGINT text') from navigation_results where query='fixture7e1';
select is(value->4->>'access','owned','Personal collection visible') from navigation_results where query='fixture7e1';
select is(value->5->>'access','shared','Active share visible') from navigation_results where query='fixture7e1';
select is(value->5->>'target_primary_type','fire','Shared target identity') from navigation_results where query='fixture7e1';
select is(value->5->>'target_secondary_type','flying','Shared dual type identity') from navigation_results where query='fixture7e1';
select ok(not exists(select 1 from jsonb_array_elements(value) x where x->>'collection_id'='c7e10000-0000-0000-0000-000000000006'),
  'Automatic target/content do not match collection name') from navigation_results where query='fixture7e1';
select is(value->0->>'collection_id','c7e10000-0000-0000-0000-000000000006','Independent collection name matches') from navigation_results where query='AliasNom7e1';
select is(value,'[]'::jsonb,'Inaccessible name does not disclose existence') from navigation_results where query='SecretSeul7e1';
select is(value->0->>'access','shared','Another active share visible') from navigation_results where query='RetiréSeul7e1';
select ok(not exists(select 1 from jsonb_array_elements(value) x where x->>'kind'='pokemon'),'Dex number alone never matches Pokemon') from navigation_results where query='97001';
select ok(exists(select 1 from jsonb_array_elements(value) x where x->>'kind'='set' and x->>'set_id'='-97005'),
  'Numeric Extension 151 matches its name') from navigation_results where query='151';
select ok(not exists(select 1 from jsonb_array_elements(value) x where x->>'kind'='set'),'Abbreviation alone does not match Extension') from navigation_results where query='GS7E1A';
select is(value,'[]'::jsonb,'Series never matched') from navigation_results where query='SérieSeule7e1';
select is(value->0->>'name_source','Fallback7e1','Source name fallback matches Extension') from navigation_results where query='Fallback7e1';
select is(value,'[]'::jsonb,'No suggestion without Catalogue-eligible standard French Version: '||query)
  from navigation_results where query in ('JumboSeul7e1','JumboSet7e1','EmptySet7e1','SansVersion7e1','InactiveCard7e1','InactiveSet7e1','NullSize7e1');
select is((select count(*) from jsonb_array_elements(value) x where x->>'kind'='pokemon'),1::bigint,'AND Pokemon names') from navigation_results where query='fixture7e1 éclair';
select is((select count(*) from jsonb_array_elements(value) x where x->>'kind'='set'),0::bigint,'Unused Extension quota') from navigation_results where query='fixture7e1 éclair';
select is((select count(*) from jsonb_array_elements(value) x where x->>'kind'='collection'),1::bigint,'One nominal Collection') from navigation_results where query='fixture7e1 éclair';
select is((select count(*) from jsonb_array_elements(value) x where x->>'kind'='card'),8::bigint,'1/0/1 leaves eight Cards') from navigation_results where query='fixture7e1 éclair';
select is((select count(*) from jsonb_array_elements(value) x where x->>'kind'='card'),10::bigint,'All unused places transferred to Cards') from navigation_results where query='fixture7e1 carte';
select is((select count(*) from jsonb_array_elements(value) x where x->>'source_card_id'='9007199254740995'),1::bigint,
  'Source Card once despite multiple Versions and Pokemon') from navigation_results where query='fixture7e1 28/73';
select is(value->0->>'source_card_id','9007199254740995','Numeric exact before prefixed number') from navigation_results where query='fixture7e1 28/73';
select is(jsonb_typeof(value->0->'source_card_id'),'string','Card BIGINT text') from navigation_results where query='fixture7e1 28/73';
select is(jsonb_array_length(value),2,'Fraction rejects numeric prefix 280') from navigation_results where query='fixture7e1 28/73';
select is(jsonb_array_length(value),3,'Numeric prefix 28 accepts 280') from navigation_results where query='fixture7e1 28';
select is(public.search_global_navigation('fixture7e1 028/073'),value,'Leading zero numeric parity') from navigation_results where query='fixture7e1 28/73';
select is(public.search_global_navigation('fixture7e1 28/74'),'[]'::jsonb,'Wrong fraction denominator');
select is(value->0->>'source_card_id','9007199254740995','Card identifier matching') from navigation_results where query='tcgdex:fixture7e1-28';
select is(value->0->>'source_card_id','-97010','Private MY. identity matching under narrow grants') from navigation_results where query='my:fixture7e1-alliance';
select is(value->0->>'source_card_id','9007199254740995','Ligatures/apostrophe/hyphen matching') from navigation_results where query='fixture7e1 evoli coeur d''or';
select is((select value from navigation_results where query='fixture7e1 GS7E1A'),value,'Both abbreviations same ranking') from navigation_results where query='fixture7e1 GS7E1B';
select is(public.search_global_navigation('fixture7e1 GS7E1A 28/73')->0->>'source_card_id','9007199254740995','AND across Extension/abbreviation/number');
select is(public.search_global_navigation('fixture7e1 éclair 28/73')->0->>'source_card_id','9007199254740995','AND across actual linked Pokemon and number');
select is(public.search_global_navigation('fixture7e1 absent 28/73'),'[]'::jsonb,'Every term required');
select is(public.search_global_navigation('FIXTURE7E1 ÉCLAIR'),value,'Case and accents') from navigation_results where query='fixture7e1 éclair';
select is(public.search_global_navigation('ｆｉｘｔｕｒｅ７ｅ１ Éclair'),value,'NFKD compatibility/decomposed accents') from navigation_results where query='fixture7e1 éclair';
select is(public.search_global_navigation('fixture7e1 fixture7e1'),value,'Unique terms preserve order') from navigation_results where query='fixture7e1';
select ok(exists(select 1 from jsonb_array_elements(value) x where x->>'kind'='pokemon'),'Prefix/partial actual Pokemon result '||query)
  from navigation_results where query in ('fixture7e1 ecl','fixture7e1 clair','xture7e1');
select is(public.search_global_navigation(query),value,'Stable final ranking on unchanged data '||query)
  from navigation_results where query in ('fixture7e1','fixture7e1 carte','fixture7e1 28/73');
select ok(jsonb_array_length(value)<=10 and (select count(*)=count(distinct x->>'source_card_id')
  from jsonb_array_elements(value) x where x->>'kind'='card'),'Bounded unique Cards '||query)
  from navigation_results where query in ('fixture7e1','fixture7e1 éclair','fixture7e1 carte');
select ok(not exists(select 1 from navigation_results, jsonb_array_elements(value) x
  where x ?| array['score','total','variant_id','series']),'No internal scores/totals/Version/series');
select is((select array_agg(x->>'pokemon_id' order by n) from jsonb_array_elements(value) with ordinality t(x,n) where x->>'kind'='pokemon'),
  array['-97008','-97007'],'Identical normalized Pokemon names tie by stable ID') from navigation_results where query='TieNom7e1';
select is((select array_agg(x->>'set_id' order by n) from jsonb_array_elements(value) with ordinality t(x,n) where x->>'kind'='set'),
  array['-97010','-97009'],'Identical normalized Extension names tie by stable ID') from navigation_results where query='TieNom7e1';
select is((select array_agg(x->>'collection_id' order by n) from jsonb_array_elements(value) with ordinality t(x,n) where x->>'kind'='collection'),
  array['c7e10000-0000-0000-0000-000000000007','c7e10000-0000-0000-0000-000000000008'],'Identical Collection names tie by UUID') from navigation_results where query='TieNom7e1';
select is((select array_agg(k order by k) from jsonb_object_keys(value->0) k),
  array['dex_number','kind','name_fr','pokemon_id','primary_type','secondary_type'],'Exact Pokemon payload') from navigation_results where query='fixture7e1';
select is((select array_agg(k order by k) from jsonb_object_keys(value->2) k),
  array['abbreviation','abbreviation_fr','kind','name_fr','name_source','set_id'],'Exact Extension payload') from navigation_results where query='fixture7e1';
select is((select array_agg(k order by k) from jsonb_object_keys(value->4) k),
  array['access','collection_id','collection_type','kind','name','target_name','target_primary_type','target_secondary_type','target_type'],'Exact Collection payload') from navigation_results where query='fixture7e1';
select is((select array_agg(k order by k) from jsonb_object_keys(value->0) k),
  array['kind','local_id','name_fr','set_abbreviation','set_abbreviation_fr','set_name_fr','source_card_id'],'Exact Card payload') from navigation_results where query='fixture7e1 28/73';

reset role;
delete from public.collection_shares where collection_id='c7e10000-0000-0000-0000-000000000005';
set local role authenticated;
select is(public.search_global_navigation('RetiréSeul7e1'),'[]'::jsonb,'Revocation hides name/existence immediately');
set local request.jwt.claims = '{"sub":"a7e10000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(public.search_global_navigation('SecretSeul7e1')->0->>'access','owned','Third-party owner sees own private name');
reset role;
select * from finish();
rollback;
