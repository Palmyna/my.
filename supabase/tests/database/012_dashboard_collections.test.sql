begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_view('public', 'dashboard_collections', 'Dashboard view exists');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.dashboard_collections'::regclass),
  'Dashboard uses caller privileges and RLS');
select columns_are('public', 'dashboard_collections', array[
  'collection_id','name','collection_type','access','target_type','target_name','owned_count','total_count'
], 'Only the requested Dashboard contract is exposed');
select ok(has_table_privilege('authenticated','public.dashboard_collections','SELECT'), 'Authenticated can read');
select ok(not has_table_privilege(role_name,'public.dashboard_collections','SELECT'), role_name || ' has no read grant')
from unnest(array['anon','service_role']) role_name;
select ok(not has_table_privilege('authenticated','public.dashboard_collections','INSERT,UPDATE,DELETE'), 'No view write grants');
select ok(not has_table_privilege('authenticated','public.collection_items','INSERT,UPDATE,DELETE'), 'Direct item grants unchanged');
select ok(not exists (select 1 from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid='public.dashboard_collections'::regclass and a.grantee=0), 'No PUBLIC privileges');
select is((select count(*) from pg_policies where schemaname='public'
  and tablename in ('collections','collection_items','physical_copies','collection_shares','pokemon','tcg_sets')
  and policyname in ('require_mfa','require_my_profile') and permissive='RESTRICTIVE'),12::bigint,
  'All underlying tables retain restrictive MFA and profile policies');

-- Dedicated IDs; no identity sequence reservations or pre-existing data mutations.
insert into auth.users(id) values
  ('a1300000-0000-0000-0000-000000000001'), ('a1300000-0000-0000-0000-000000000002'),
  ('a1300000-0000-0000-0000-000000000003'), ('a1300000-0000-0000-0000-000000000004');
insert into public.pokemon(id,dex_number,name_fr) overriding system value values(-83001,983001,'Évoli fixture');
insert into public.tcg_series(id,name_fr) overriding system value values(-83001,'Série distincte');
insert into public.tcg_sets(id,series_id,name_fr) overriding system value values
  (-83001,-83001,'Extension précise'),(-83002,-83001,null);
insert into public.source_cards(id,tcgdex_id,set_id,source_present,origin) overriding system value
  values(-83001,'dashboard-fixture',-83001,true,'tcgdex');
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin) overriding system value values
  (-83001,-83001,'one',true,'tcgdex'),(-83002,-83001,'two',true,'tcgdex'),
  (-83003,-83001,'three',true,'tcgdex'),(-83004,-83001,'outside',true,'tcgdex');
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,target_set_id,applied_target_version) values
  ('c1300000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000001','Libre personnelle','free',null,null,null,null),
  ('c1300000-0000-0000-0000-000000000002','a1300000-0000-0000-0000-000000000001','Auto Pokémon','automatic','pokemon',-83001,null,1),
  ('c1300000-0000-0000-0000-000000000003','a1300000-0000-0000-0000-000000000001','Auto Extension','automatic','set',null,-83001,1),
  ('c1300000-0000-0000-0000-000000000004','a1300000-0000-0000-0000-000000000001','Vide personnelle','free',null,null,null,null),
  ('c1300000-0000-0000-0000-000000000005','a1300000-0000-0000-0000-000000000001','Cible sans nom','automatic','set',null,-83002,1),
  ('c1300000-0000-0000-0000-000000000006','a1300000-0000-0000-0000-000000000002','Libre destinataire','free',null,null,null,null),
  ('c1300000-0000-0000-0000-000000000007','a1300000-0000-0000-0000-000000000004','Privée tierce','free',null,null,null,null);
insert into public.collection_items(collection_id,variant_id,origin,sort_position,automatic_rank) values
  ('c1300000-0000-0000-0000-000000000001',-83001,'manual',1,null),
  ('c1300000-0000-0000-0000-000000000001',-83002,'manual',2,null),
  ('c1300000-0000-0000-0000-000000000001',-83003,'manual',3,null),
  ('c1300000-0000-0000-0000-000000000002',-83001,'automatic',1,1),
  ('c1300000-0000-0000-0000-000000000002',-83002,'manual',2,null),
  ('c1300000-0000-0000-0000-000000000003',-83002,'automatic',1,1),
  ('c1300000-0000-0000-0000-000000000003',-83003,'manual',2,null),
  ('c1300000-0000-0000-0000-000000000006',-83002,'manual',1,null),
  ('c1300000-0000-0000-0000-000000000007',-83001,'manual',1,null);
insert into public.physical_copies(user_id,variant_id) values
  ('a1300000-0000-0000-0000-000000000001',-83001),
  ('a1300000-0000-0000-0000-000000000001',-83001),
  ('a1300000-0000-0000-0000-000000000001',-83004),
  ('a1300000-0000-0000-0000-000000000002',-83002),
  ('a1300000-0000-0000-0000-000000000002',-83003),
  ('a1300000-0000-0000-0000-000000000004',-83001),
  ('a1300000-0000-0000-0000-000000000004',-83003);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c1300000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000002'),
  ('c1300000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000004'),
  ('c1300000-0000-0000-0000-000000000002','a1300000-0000-0000-0000-000000000002'),
  ('c1300000-0000-0000-0000-000000000003','a1300000-0000-0000-0000-000000000002'),
  ('c1300000-0000-0000-0000-000000000005','a1300000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000001","aal":"aal2"}';
select results_eq($$select name,collection_type,access,target_type,target_name,owned_count,total_count
  from public.dashboard_collections where collection_id::text like 'c1300000-%' order by collection_id$$,
  $$values ('Libre personnelle'::text,'free'::text,'owned'::text,null::text,null::text,1::bigint,3::bigint),
    ('Auto Pokémon','automatic','owned','pokemon','Évoli fixture',1,2),
    ('Auto Extension','automatic','owned','set','Extension précise',0,2),
    ('Vide personnelle','free','owned',null,null,0,0),
    ('Cible sans nom','automatic','owned','set',null,0,0)$$,
  'Owner sees free/Pokemon/exact set targets, all items, NULL names and empty collections; multiple copies count once');
select is((select count(*) from public.dashboard_collections where collection_id='c1300000-0000-0000-0000-000000000001'),
  1::bigint, 'Multiple recipients do not duplicate the owner summary');

set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000002","aal":"aal2"}';
select results_eq($$select name,access,owned_count,total_count from public.dashboard_collections
  where collection_id::text like 'c1300000-%' order by collection_id$$,
  $$values ('Libre personnelle'::text,'shared'::text,1::bigint,3::bigint), ('Auto Pokémon','shared',1,2),
    ('Auto Extension','shared',0,2), ('Cible sans nom','shared',0,0), ('Libre destinataire','owned',1,1)$$,
  'Recipient sees shared/owned correctly; shared progress uses owner copies, never recipient copies');
select is((select count(*) from public.dashboard_collections where collection_id in
  ('c1300000-0000-0000-0000-000000000004','c1300000-0000-0000-0000-000000000007')),0::bigint,
  'Private owner collection and unrelated third-party collection remain invisible');
select is((select count(*) from public.physical_copies where user_id='a1300000-0000-0000-0000-000000000001' and variant_id=-83004),
  0::bigint, 'Owner copies outside shared collections remain invisible');
select is((select count(*) from public.physical_copies where user_id='a1300000-0000-0000-0000-000000000004'),
  0::bigint, 'Copies of another owner remain private even for the same variants');

-- Progress is live, not a stored counter. One new owner copy makes a manual item owned.
reset role;
insert into public.physical_copies(user_id,variant_id) values ('a1300000-0000-0000-0000-000000000001',-83002);
set local role authenticated;
select results_eq($$select owned_count,total_count from public.dashboard_collections
  where collection_id='c1300000-0000-0000-0000-000000000002'$$,
  $$values (2::bigint,2::bigint)$$, 'One owner copy counts immediately, including for a manual item');
reset role;
insert into public.physical_copies(user_id,variant_id) values ('a1300000-0000-0000-0000-000000000001',-83002);
set local role authenticated;
select is((select owned_count from public.dashboard_collections where collection_id='c1300000-0000-0000-0000-000000000002'),
  2::bigint, 'An additional copy does not increase possession again');
reset role;
delete from public.collection_shares where collection_id='c1300000-0000-0000-0000-000000000002'
  and recipient_user_id='a1300000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.dashboard_collections where collection_id='c1300000-0000-0000-0000-000000000002'),
  0::bigint, 'Revoked sharing disappears immediately');

set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000003","aal":"aal2"}';
select is((select count(*) from public.dashboard_collections where collection_id::text like 'c1300000-%'),0::bigint,
  'Unrelated aal2 user sees none of the fixture collections');
set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000001","aal":"aal1"}';
select is((select count(*) from public.dashboard_collections),0::bigint,'Owner at aal1 cannot read Dashboard');
set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000002","aal":"aal1"}';
select is((select count(*) from public.dashboard_collections),0::bigint,'Recipient at aal1 cannot read Dashboard');
set local request.jwt.claims = '{}';
select is((select count(*) from public.dashboard_collections),0::bigint,'No identity yields no Dashboard rows');

-- Keep the Auth identity but remove the fixture recipient's MY. profile and its
-- FK dependencies. A residual aal2 identity must not bypass the profile policies.
reset role;
delete from public.collections where id='c1300000-0000-0000-0000-000000000006';
delete from public.physical_copies where user_id='a1300000-0000-0000-0000-000000000002';
delete from public.collection_shares where recipient_user_id='a1300000-0000-0000-0000-000000000002';
delete from public.profiles where id='a1300000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1300000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select count(*) from public.dashboard_collections),0::bigint,'aal2 identity without MY. profile sees no rows');
reset role;
set local role anon;
select throws_ok($$select * from public.dashboard_collections$$,'42501',null,'Anonymous role cannot read Dashboard');
reset role;

select * from finish();
rollback;
