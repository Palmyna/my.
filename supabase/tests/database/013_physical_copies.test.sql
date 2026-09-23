begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'physical_copies', 'name', 'Optional custom name exists');
select col_type_is('public', 'physical_copies', 'name', 'text', 'Name is text');
select col_is_null('public', 'physical_copies', 'name', 'Name is nullable');
select ok(has_column_privilege('authenticated','public.physical_copies','name','INSERT,UPDATE'), 'Name is writable');
select ok(has_table_privilege('authenticated','public.physical_copies','SELECT,DELETE'), 'Read and delete grants preserved');
select ok(not has_column_privilege('authenticated','public.physical_copies','user_id','INSERT,UPDATE'), 'No owner spoofing grants');
select ok(not has_column_privilege('authenticated','public.physical_copies','variant_id','UPDATE'), 'Variant cannot be reassigned');
select ok(not has_table_privilege('anon','public.physical_copies','SELECT,INSERT,UPDATE,DELETE'), 'Anonymous has no grants');
select is((select count(*) from pg_policies where schemaname='public' and tablename='physical_copies'
  and policyname in ('require_mfa','require_my_profile') and permissive='RESTRICTIVE'), 2::bigint, 'MFA and profile restrictions preserved');

insert into auth.users(id) values
  ('a1400000-0000-0000-0000-000000000001'), ('a1400000-0000-0000-0000-000000000002'),
  ('a1400000-0000-0000-0000-000000000003');
insert into public.tcg_series(id,name_fr) overriding system value values(-84001,'Copies fixture');
insert into public.tcg_sets(id,series_id,name_fr) overriding system value values(-84001,-84001,'Copies fixture');
insert into public.source_cards(id,tcgdex_id,set_id,source_present,origin) overriding system value
  values(-84001,'physical-copies-fixture',-84001,true,'tcgdex');
insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin) overriding system value values
  (-84001,-84001,'shared',true,'tcgdex'), (-84002,-84001,'private',true,'tcgdex');
insert into public.collections(id,owner_id,name,collection_type) values
  ('c1400000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','Copies fixture','free');
insert into public.collection_items(collection_id,variant_id,origin,sort_position) values
  ('c1400000-0000-0000-0000-000000000001',-84001,'manual',1);
insert into public.collection_shares(collection_id,recipient_user_id) values
  ('c1400000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000001","aal":"aal2"}';
select lives_ok($$insert into public.physical_copies(variant_id) values(-84001)$$, 'Owner creates without a name');
select is((select name from public.physical_copies where variant_id=-84001), null::text, 'Default name is NULL, never a generated label');
select is((select user_id from public.physical_copies where variant_id=-84001),
  'a1400000-0000-0000-0000-000000000001'::uuid, 'Owner comes from auth.uid');
select lives_ok($$insert into public.physical_copies(variant_id,name,condition,is_graded,grading_company,grading_score,note)
  values(-84001,'Ma copie','ancienne condition',true,'Société','A','Note conservée')$$, 'Owner creates second named copy');
select is((select count(*) from public.physical_copies where variant_id=-84001),2::bigint,'Multiple copies for one variant');
select lives_ok($$update public.physical_copies set name='Nouveau nom' where variant_id=-84001 and name='Ma copie'$$, 'Owner edits name');
select results_eq($$select name,condition,is_graded,grading_company,grading_score,note from public.physical_copies where name='Nouveau nom'$$,
  $$values('Nouveau nom'::text,'ancienne condition'::text,true,'Société'::text,'A'::text,'Note conservée'::text)$$, 'Only name changed; legacy fields preserved');
select lives_ok($$update public.physical_copies set name=null where variant_id=-84001 and name='Nouveau nom'$$,'Owner clears name');
select is((select count(*) from public.physical_copies where variant_id=-84001 and name is null),2::bigint,'Both names now NULL');
insert into public.physical_copies(variant_id,name) values(-84002,'Privée');
select is((select owned_count from public.dashboard_collections where collection_id='c1400000-0000-0000-0000-000000000001'),1::bigint,'Possession counts variant once');
select throws_ok($$update public.physical_copies set user_id='a1400000-0000-0000-0000-000000000002' where variant_id=-84001$$,
  '42501',null,'Owner cannot transfer copies');

set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select count(*) from public.physical_copies where variant_id=-84001),2::bigint,'Recipient reads all copies of shared variant');
select is((select count(*) from public.physical_copies where variant_id=-84002),0::bigint,'Other owner variants stay private');
with changed as (update public.physical_copies set name='Attaque' where variant_id=-84001 returning id)
select is((select count(*) from changed),
  0::bigint,'Recipient cannot edit owner copies');
with removed as (delete from public.physical_copies where variant_id=-84001 returning id)
select is((select count(*) from removed),
  0::bigint,'Recipient cannot delete owner copies');
select throws_ok($$insert into public.physical_copies(user_id,variant_id,name)
  values('a1400000-0000-0000-0000-000000000001',-84001,'Attaque')$$,'42501',null,'Cannot create for another user');

-- Prove the RLS insertion invariant independently of the column grant barrier.
reset role;
grant insert(user_id) on public.physical_copies to authenticated;
set local role authenticated;
select throws_ok($$insert into public.physical_copies(user_id,variant_id)
  values('a1400000-0000-0000-0000-000000000001',-84001)$$,'42501',null,'RLS also rejects forged owner');
reset role;
revoke insert(user_id) on public.physical_copies from authenticated;
set local role authenticated;
insert into public.physical_copies(variant_id,name) values(-84001,'Copie du destinataire');
select is((select count(*) from public.physical_copies where variant_id=-84001),3::bigint,'Recipient sees own and shared copies separately');

set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000003","aal":"aal2"}';
select is((select count(*) from public.physical_copies where variant_id in(-84001,-84002)),0::bigint,'Unrelated user sees none');
with changed as (update public.physical_copies set name='Attaque' where variant_id=-84001 returning id)
select is((select count(*) from changed),0::bigint,'Unrelated user cannot update');
with removed as (delete from public.physical_copies where variant_id=-84001 returning id)
select is((select count(*) from removed),0::bigint,'Unrelated user cannot delete');

set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000001","aal":"aal1"}';
select is((select count(*) from public.physical_copies where variant_id=-84001),0::bigint,'aal1 cannot read');
select throws_ok($$insert into public.physical_copies(variant_id,name) values(-84001,'Interdit')$$,'42501',null,'aal1 cannot create');
set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000001","aal":"aal2"}';
with removed as (delete from public.physical_copies where id=(select id from public.physical_copies where variant_id=-84001 order by created_at,id limit 1) returning id)
select is((select count(*) from removed),1::bigint,'Delete removes exactly one copy');
select is((select owned_count from public.dashboard_collections where collection_id='c1400000-0000-0000-0000-000000000001'),1::bigint,'Remaining copy preserves possession');
with removed as (delete from public.physical_copies where variant_id=-84001 returning id)
select is((select count(*) from removed),1::bigint,'Delete last owner copy');
select is((select count(*) from public.collection_items where collection_id='c1400000-0000-0000-0000-000000000001'),1::bigint,'Last deletion preserves collection item');
select is((select owned_count from public.dashboard_collections where collection_id='c1400000-0000-0000-0000-000000000001'),0::bigint,'Variant naturally becomes missing despite recipient copy');

set local request.jwt.claims = '{"sub":"a1400000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select name from public.physical_copies where variant_id=-84001),'Copie du destinataire','Other account copy survives');
reset role;
select * from finish();
rollback;
