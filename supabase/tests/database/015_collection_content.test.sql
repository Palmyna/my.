-- Prepared only. Requires manually applied Phase 6 migrations; never replays them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir collection_content.fixtures.inc

select has_function('public','get_collection_content',array['uuid'],'Content RPC exists');
select ok((select not prosecdef and provolatile='s' and not proretset
  and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']
  from pg_proc where oid='public.get_collection_content(uuid)'::regprocedure),
  'Stable invoker returns one scalar JSONB value with fixed search_path');
select ok(has_function_privilege('authenticated','public.get_collection_content(uuid)','EXECUTE'),'Authenticated execute only');
select ok(not has_function_privilege(role_name,'public.get_collection_content(uuid)','EXECUTE'),role_name || ' cannot call content RPC')
  from unnest(array['anon','service_role']) role_name;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.get_collection_content(uuid)'::regprocedure and a.grantee=0),'No PUBLIC grant');
select ok(not has_table_privilege('authenticated','public.collection_items','INSERT,UPDATE,DELETE')
  and not has_column_privilege('authenticated','public.collection_items','sort_position','UPDATE'), 'No item write grants');
select ok(not has_table_privilege('authenticated','public.' || t,'INSERT,UPDATE,DELETE'),t || ' stays read only')
  from unnest(array['catalog_variants','source_cards','tcg_sets']) t;
select is((select count(*) from pg_class where oid in ('public.collections'::regclass,
  'public.collection_items'::regclass,'public.catalog_variants'::regclass,'public.source_cards'::regclass,
  'public.tcg_sets'::regclass,'public.physical_copies'::regclass,'public.collection_shares'::regclass)
  and relrowsecurity),7::bigint,'RLS retained on all involved tables');
select is((select count(*) from pg_policies where schemaname='public'
  and tablename in ('collections','collection_items','catalog_variants','source_cards','tcg_sets','physical_copies','collection_shares')
  and policyname in ('require_mfa','require_my_profile') and permissive='RESTRICTIVE'),14::bigint,
  'Restrictive MFA and profile policies retained');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000001","aal":"aal2"}';
select is(jsonb_array_length(public.get_collection_content('c1600000-0000-0000-0000-000000000001')),5,
  'Owner reads every item, including inactive/historical variants');
select results_eq($$select (x->>'collection_item_id')::uuid from jsonb_array_elements(
  public.get_collection_content('c1600000-0000-0000-0000-000000000001')) with ordinality e(x,n) order by n$$,
  array['d1600000-0000-0000-0000-000000000003','d1600000-0000-0000-0000-000000000001',
    'd1600000-0000-0000-0000-000000000002','d1600000-0000-0000-0000-000000000004',
    'd1600000-0000-0000-0000-000000000005']::uuid[],
  'Exact sort_position,id order: negative, tie by UUID, decimal precision, independent of rank');
select is((select array_agg((x->>'collection_item_id')::uuid order by n) from jsonb_array_elements(
  public.get_collection_content('c1600000-0000-0000-0000-000000000001')) with ordinality e(x,n)),
  public.get_collection_item_order('c1600000-0000-0000-0000-000000000001'),'IDs directly match reorder 6A.3');
select results_eq($$select x->>'variant_id',x->>'origin',x->>'card_name_fr',x->>'local_id',
  x->>'set_name_fr',x->>'image_url',x->>'variant_label',(x->>'owned')::boolean
  from jsonb_array_elements(public.get_collection_content('c1600000-0000-0000-0000-000000000001')) with ordinality e(x,n) order by n$$,
  $$values
    ('-86003'::text,'automatic'::text,'Évoli fixture'::text,'TG01'::text,'Extension précise'::text,'https://example.invalid/source/high.webp'::text,'Reverse'::text,false),
    ('-86001','automatic','Évoli fixture','TG01','Extension précise','https://example.invalid/source/high.webp','Normal',true),
    ('-86002','manual','Évoli fixture','TG01','Extension précise','https://example.invalid/variant/original.png','Holo',false),
    ('-9007199254740995','manual','Évoli fixture','TG01','Extension précise','https://example.invalid/source/high.webp','Holo Cosmos Stamp corrigé',true),
    ('-86005','manual',null,null,null,null,null,false)$$,
  'Exact variant labels, source number/FR names, extension not series, original image resolution/fallback, NULLs and owner possession');
select ok((select bool_and(jsonb_typeof(x->'variant_id')='string' and jsonb_typeof(x->'owned')='boolean')
  from jsonb_array_elements(public.get_collection_content('c1600000-0000-0000-0000-000000000001')) x),
  'BIGINT identifiers are lossless decimal strings; owned is boolean');
select ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(x) k) =
  array['card_name_fr','collection_item_id','image_url','local_id','origin','owned','set_name_fr','variant_id','variant_label'])
  from jsonb_array_elements(public.get_collection_content('c1600000-0000-0000-0000-000000000001')) x),
  'Exactly nine fields: no positions, ranks, counts, owner IDs, timestamps or pipeline metadata');
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000002'),'[]'::jsonb,'Visible empty collection');
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000099'),'[]'::jsonb,'Missing collection reveals nothing');
select is(public.get_collection_content(null),'[]'::jsonb,'NULL collection reveals nothing');

-- One RPC result contains all 1005 items, even under an outer row limit.
select is((select jsonb_array_length(public.get_collection_content('c1600000-0000-0000-0000-000000000003')) limit 1),1005,
  'Scalar aggregation has no 1000-item truncation');
select is((select count(distinct x->>'collection_item_id') from jsonb_array_elements(
  public.get_collection_content('c1600000-0000-0000-0000-000000000003')) x),1005::bigint,'No duplicate volume items');
select is((select array_agg((x->>'collection_item_id')::uuid order by n) from jsonb_array_elements(
  public.get_collection_content('c1600000-0000-0000-0000-000000000003')) with ordinality e(x,n)),
  public.get_collection_item_order('c1600000-0000-0000-0000-000000000003'),'Complete volume order matches 6A.3');

set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(jsonb_array_length(public.get_collection_content('c1600000-0000-0000-0000-000000000001')),5,'Active recipient reads content');
select results_eq($$select x->>'variant_id',(x->>'owned')::boolean from jsonb_array_elements(
  public.get_collection_content('c1600000-0000-0000-0000-000000000001')) with ordinality e(x,n) order by n$$,
  $$values ('-86003'::text,false),('-86001',true),('-86002',false),('-9007199254740995',true),('-86005',false)$$,
  'B reads A possession: A owns/B not => true; A not/B owns => false; third-party copies ignored');
select is((select count(*) from public.physical_copies where user_id='a1600000-0000-0000-0000-000000000001'),3::bigint,
  'Existing shared copy SELECT retained, including multiple owner copies');
select is((select count(*) from public.physical_copies where variant_id=-86006),0::bigint,'Owner copies outside share stay private');
select is((select count(*) from public.physical_copies where user_id='a1600000-0000-0000-0000-000000000003'),0::bigint,
  'Other user copies remain private');
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000002'),'[]'::jsonb,'Unshared owner collection invisible to B');
select is(jsonb_array_length(public.get_collection_content('c1600000-0000-0000-0000-000000000003')),1005,'Shared volume is complete');

-- Derived at every read: removing the last owner copy changes both owner/shared output.
reset role;
delete from public.physical_copies where user_id='a1600000-0000-0000-0000-000000000001' and variant_id=-86001;
set local role authenticated;
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001')->1->'owned','false'::jsonb,
  'Last copy removal immediately reflected for recipient');
reset role;
insert into public.physical_copies(user_id,variant_id) values ('a1600000-0000-0000-0000-000000000001',-86002);
set local role authenticated;
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001')->2->'owned','true'::jsonb,
  'First owner copy immediately reflected for recipient');
reset role;
delete from public.collection_shares where collection_id='c1600000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'[]'::jsonb,'Revoked share immediately denied');
select is((select count(*) from public.physical_copies where user_id='a1600000-0000-0000-0000-000000000001'),0::bigint,
  'Revoked shared copies no longer readable');

set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000003","aal":"aal2"}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'[]'::jsonb,'Third party denied');
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000001","aal":"aal1"}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'[]'::jsonb,'Owner aal1 denied');
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000002","aal":"aal1"}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000003'),'[]'::jsonb,'Active recipient aal1 denied');
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000001"}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'[]'::jsonb,'Missing MFA denied');
set local request.jwt.claims = '{}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'[]'::jsonb,'Missing session denied');
-- Auth identity survives, but profile and its FK dependencies do not.
reset role;
delete from public.physical_copies where user_id='a1600000-0000-0000-0000-000000000002';
delete from public.collection_shares where recipient_user_id='a1600000-0000-0000-0000-000000000002';
delete from public.profiles where id='a1600000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(public.get_collection_content('c1600000-0000-0000-0000-000000000003'),'[]'::jsonb,'Residual aal2 identity without MY. profile denied');
reset role;
set local role anon;
select throws_ok($$select public.get_collection_content('c1600000-0000-0000-0000-000000000001')$$,'42501',null,'Anonymous execute denied');
reset role;
select * from finish();
rollback;
