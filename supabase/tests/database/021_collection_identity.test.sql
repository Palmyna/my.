begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.dashboard_collections'::regclass),
  'Expanded Dashboard still invokes caller RLS');
select ok(has_table_privilege('authenticated','public.dashboard_collections','SELECT'), 'Authenticated read retained');
select ok(not has_table_privilege(role_name,'public.dashboard_collections','SELECT'), role_name || ' cannot read metadata view')
from unnest(array['anon','service_role']) role_name;
select ok(not has_table_privilege('authenticated','public.dashboard_collections','INSERT,UPDATE,DELETE'), 'View remains read-only');
select ok(not exists (select 1 from information_schema.columns where table_schema='public' and table_name='collections'
  and (column_name ~ '(color|colour|accent|gradient|primary_type|secondary_type)' or data_type='jsonb')),
  'No redundant Pokemon types or visual identity stored on collections');
select col_type_is('public','dashboard_collections','target_primary_type','text','Primary type is metadata text');
select col_type_is('public','dashboard_collections','target_secondary_type','text','Secondary type is metadata text');

insert into auth.users(id) values
  ('a7d50000-0000-0000-0000-000000000001'),('a7d50000-0000-0000-0000-000000000002'),('a7d50000-0000-0000-0000-000000000003');
insert into public.pokemon(id,dex_number,name_fr,primary_type,secondary_type) overriding system value values
  (-84501,984501,'Mono fixture','electric',null),(-84502,984502,'Double fixture','fire','flying'),(-84503,984503,'Sans types',null,null);
insert into public.tcg_series(id,name_fr) overriding system value values(-84501,'Série identité');
insert into public.tcg_sets(id,series_id,name_fr) overriding system value values(-84501,-84501,'Extension identité');
insert into public.source_cards(id,tcgdex_id,set_id,source_present,origin) overriding system value
  values(-84501,'identity-fixture',-84501,true,'tcgdex');
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin) overriding system value
  values(-84501,-84501,'normal',true,'tcgdex');
-- Historical fixture with no v2 journal.
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,target_set_id,applied_target_version,order_contract_version) values
  ('c7d50000-0000-0000-0000-000000000001','a7d50000-0000-0000-0000-000000000001','Mono','automatic','pokemon',-84501,null,1,1),
  ('c7d50000-0000-0000-0000-000000000002','a7d50000-0000-0000-0000-000000000001','Double','automatic','pokemon',-84502,null,1,1),
  ('c7d50000-0000-0000-0000-000000000003','a7d50000-0000-0000-0000-000000000001','Extension','automatic','set',null,-84501,1,1),
  ('c7d50000-0000-0000-0000-000000000004','a7d50000-0000-0000-0000-000000000001','Libre','free',null,null,null,null,1),
  ('c7d50000-0000-0000-0000-000000000005','a7d50000-0000-0000-0000-000000000001','Sans types','automatic','pokemon',-84503,null,1,1),
  ('c7d50000-0000-0000-0000-000000000006','a7d50000-0000-0000-0000-000000000003','Privée tierce','free',null,null,null,null,1);
insert into public.collection_items(collection_id,variant_id,origin,sort_position,automatic_rank)
select id,-84501,'manual',1,null from public.collections where id::text like 'c7d50000-%';
insert into public.physical_copies(user_id,variant_id) values
  ('a7d50000-0000-0000-0000-000000000001',-84501),('a7d50000-0000-0000-0000-000000000001',-84501);
insert into public.collection_shares(collection_id,recipient_user_id)
select id,'a7d50000-0000-0000-0000-000000000002' from public.collections
where id::text like 'c7d50000-%' and name in ('Mono','Double','Extension','Libre');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a7d50000-0000-0000-0000-000000000001","aal":"aal2"}';
select results_eq($$select name,access,target_primary_type,target_secondary_type,owned_count,total_count from public.dashboard_collections
  where collection_id::text like 'c7d50000-%' order by collection_id$$,
  $$values ('Mono'::text,'owned'::text,'electric'::text,null::text,1::bigint,1::bigint),
    ('Double','owned','fire','flying',1,1),('Extension','owned',null,null,1,1),('Libre','owned',null,null,1,1),('Sans types','owned',null,null,1,1)$$,
  'Owner receives species types directly, NULL for set/free/missing metadata, duplicate copies still count once');

set local request.jwt.claims = '{"sub":"a7d50000-0000-0000-0000-000000000002","aal":"aal2"}';
select results_eq($$select name,access,target_primary_type,target_secondary_type,owned_count,total_count from public.dashboard_collections
  where collection_id::text like 'c7d50000-%' order by collection_id$$,
  $$values ('Mono'::text,'shared'::text,'electric'::text,null::text,1::bigint,1::bigint),
    ('Double','shared','fire','flying',1,1),('Extension','shared',null,null,1,1),('Libre','shared',null,null,1,1)$$,
  'Recipient sees only shared metadata with owner possession, regardless of recipient copies');
select is((select count(*) from public.dashboard_collections where collection_id in
  ('c7d50000-0000-0000-0000-000000000005','c7d50000-0000-0000-0000-000000000006')),0::bigint,'No extra private summaries or metadata exposed');

-- Metadata remains live through the existing join, never copied to collections.
reset role;
update public.pokemon set primary_type='water',secondary_type='flying' where id=-84502;
set local role authenticated;
select results_eq($$select target_primary_type,target_secondary_type from public.dashboard_collections
  where collection_id='c7d50000-0000-0000-0000-000000000002'$$,$$values ('water'::text,'flying'::text)$$,'Species metadata correction appears immediately');
reset role;
delete from public.collection_shares where collection_id='c7d50000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.dashboard_collections where collection_id='c7d50000-0000-0000-0000-000000000002'),0::bigint,'Revocation hides added type metadata immediately');
set local request.jwt.claims = '{"sub":"a7d50000-0000-0000-0000-000000000002","aal":"aal1"}';
select is((select count(*) from public.dashboard_collections),0::bigint,'MFA gate preserved');
set local request.jwt.claims = '{}';
select is((select count(*) from public.dashboard_collections),0::bigint,'Identity gate preserved');
reset role;
select * from finish();
rollback;
