begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir catalog_search.fixtures.inc

select is(private.catalog_search_normalize('का'),'का','documented non-French mark boundary');

select ok(prosecdef and provolatile='s' and proconfig @> array['search_path=""'], 'stable safe definer')
  from pg_proc where oid='public.search_catalog_variants_for_add(text,integer,integer)'::regprocedure;
select is((select array_agg(r.rolname::text order by r.rolname) from pg_proc p,
  lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
  where p.oid='public.search_catalog_variants_for_add(text,integer,integer)'::regprocedure
    and a.privilege_type='EXECUTE' and a.grantee<>p.proowner), array['authenticated'], 'exact non-owner grants');
select ok(not has_function_privilege(role_name,f,'EXECUTE'), role_name || ' cannot execute ' || f)
  from unnest(array['anon','service_role']) role_name cross join unnest(array[
    'public.search_catalog_variants_for_add(text,integer,integer)',
    'private.catalog_search_normalize(text)', 'private.catalog_search_score(text[],integer[],text,integer,text[])']) f;
select ok(not has_function_privilege('authenticated',f,'EXECUTE'), 'helpers private') from unnest(array[
  'private.catalog_search_normalize(text)', 'private.catalog_search_score(text[],integer[],text,integer,text[])']) f;
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where
  p.oid='public.search_catalog_variants_for_add(text,integer,integer)'::regprocedure and a.grantee=0), 'no PUBLIC grant');

set local role anon;
select throws_ok($$select public.search_catalog_variants_for_add('Pikachu')$$,'42501',null,'anon denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.search_catalog_variants_for_add('Pikachu')$$,'42501','catalog_search_not_authorized','aal1 denied');
select set_config('request.jwt.claims','{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.search_catalog_variants_for_add('Pikachu')$$,'42501','catalog_search_not_authorized','missing profile denied');
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.search_catalog_variants_for_add('Pikachu')$$,'42501','catalog_search_not_authorized','missing uid denied');
select set_config('request.jwt.claims','{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);

select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 28/73')),3,'eligible exact/prefixed numbers, multiple variants; inactive card/set excluded');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->0->>'variant_id','-88001','normal first including already present item');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->1->>'variant_id','9007199254740995','BIGINT exact');
select is(jsonb_typeof(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->1->'variant_id'),'string','BIGINT JSON string');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->0->>'image_url','https://example.test/card.webp','source image fallback');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->1->>'image_url','https://example.test/reverse.webp','variant image wins');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28/73')->1->>'variant_label','Reverse','source-absent MY variant included and labelled');
select is(public.search_catalog_variants_for_add('fixture6c2 28/73')->0->>'variant_label','Normal','normal label');
select ok(not exists(select 1 from jsonb_array_elements(public.search_catalog_variants_for_add('fixture6c2',100)) x
  where x->>'variant_id' in ('-88002','-88003','-88004','-88026','-88027')), 'all five ineligible cases excluded');
select is(public.search_catalog_variants_for_add('fixture6c2 PIKACHU'),public.search_catalog_variants_for_add('fixture6c2 pikachu'),'case');
select is(public.search_catalog_variants_for_add('fixture6c2 Légendes'),public.search_catalog_variants_for_add('fixture6c2 legendes'),'accents');
select is(public.search_catalog_variants_for_add('fixture6c2 Légendes'),public.search_catalog_variants_for_add('fixture6c2 ＬＥＧＥＮＤＥＳ'),'NFKD');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Pikachu 28')),4,'AND plus numeric prefix');
select is(public.search_catalog_variants_for_add('fixture6c2 028/073'),public.search_catalog_variants_for_add('fixture6c2 28/73'),'leading zeros');
select is(public.search_catalog_variants_for_add('fixture6c2 28/74'),'[]'::jsonb,'wrong denominator');
select is(public.search_catalog_variants_for_add('fixture6c2 73'),'[]'::jsonb,'denominator not card number');
select is(public.search_catalog_variants_for_add('fixture6c2 SLG Pikachu'),public.search_catalog_variants_for_add('fixture6c2 SL3.5 Pikachu'),'both abbreviations');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Raichu GX')),1,'card suffix');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Pikachu Zekrom')),1,'actual two Pokemon relations');
select is(public.search_catalog_variants_for_add('fixture6c2 Raichu Zekrom'),'[]'::jsonb,'no invented Pokemon relation');
select is(jsonb_array_length(public.search_catalog_variants_for_add('tcgdex:fixture6c2-28')),3,'technical identifier partial matching');
select is(jsonb_array_length(public.search_catalog_variants_for_add('my:fixture6c2-alliance')),1,'private local selector');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 evoli coeur d''or')),1,'ligatures and punctuation');
select is(public.search_catalog_variants_for_add('fixture6c2 Pikachu Pikachu'),public.search_catalog_variants_for_add('fixture6c2 Pikachu'),'duplicate terms');
select is(public.search_catalog_variants_for_add('fixture6c2 absent'),'[]'::jsonb,'empty success');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Pagination')),20,'default limit');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Pagination',100)),100,'server max');
select is(jsonb_array_length(public.search_catalog_variants_for_add('fixture6c2 Pagination',100,100)),5,'last page');
select is(public.search_catalog_variants_for_add('fixture6c2 Pagination',100,105),'[]'::jsonb,'empty page');
select is(public.search_catalog_variants_for_add('fixture6c2 Pagination',10,0) || public.search_catalog_variants_for_add('fixture6c2 Pagination',10,10),
  public.search_catalog_variants_for_add('fixture6c2 Pagination',20),'stable offset ordering');
select is((select count(distinct x->>'variant_id') from jsonb_array_elements(public.search_catalog_variants_for_add('fixture6c2',100)) x),100::bigint,'no duplicates');
select throws_ok(format('select public.search_catalog_variants_for_add(%L)',q),'22023','catalog_search_invalid_query','invalid query')
  from unnest(array[null,'','  ',' , & ! / ',repeat('a',201)]) q;
select throws_ok(format('select public.search_catalog_variants_for_add(''Pikachu'',%s,%s)',coalesce(l::text,'null'),coalesce(o::text,'null')),
  '22023','catalog_search_invalid_query','invalid pagination') from (values(0,0),(101,0),(-1,0),(null,0),(20,-1),(20,null)) t(l,o);
select lives_ok($$select public.search_catalog_variants_for_add('2',1,2147483647)$$,'one character and max integer offset accepted');

reset role;
select * from finish();
rollback;
