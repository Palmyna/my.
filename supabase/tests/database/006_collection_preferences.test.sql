begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Negative catalogue IDs leave the real catalogue and its sequences untouched.
insert into public.pokemon(id,dex_number) overriding system value values(-80601,980601),(-80602,980602);
insert into public.tcg_series(id) overriding system value values(-80601);
insert into public.tcg_sets(id,series_id) overriding system value values(-80601,-80601),(-80602,-80601);
insert into auth.users(id) values
  ('60000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000003');
insert into public.profiles(id) select id from auth.users where id::text like '60000000-%';

-- The existing schema suite covers a duplicate Pokemon target for one owner.
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,applied_target_version)
values('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Pokemon','automatic','pokemon',-80601,1);
insert into public.collections(owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version)
values('60000000-0000-0000-0000-000000000001','Extension','automatic','set',-80601,1);
select throws_ok($$insert into collections(owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version)
  values('60000000-0000-0000-0000-000000000001','Duplicate','automatic','set',-80601,1)$$,
  '23505',null,'One automatic Extension collection per owner and target');
select lives_ok($$insert into collections(owner_id,name,collection_type,automatic_target_type,target_pokemon_id,target_set_id,applied_target_version) values
  ('60000000-0000-0000-0000-000000000002','Pokemon','automatic','pokemon',-80601,null,1),
  ('60000000-0000-0000-0000-000000000002','Extension','automatic','set',null,-80601,1)$$,
  'Different owners may use the same Pokemon and Extension targets');
select lives_ok($$insert into collections(owner_id,name,collection_type,automatic_target_type,target_pokemon_id,target_set_id,applied_target_version) values
  ('60000000-0000-0000-0000-000000000001','Other Pokemon','automatic','pokemon',-80602,null,1),
  ('60000000-0000-0000-0000-000000000001','Other Extension','automatic','set',null,-80602,1)$$,
  'One owner may use different targets of either type');
select throws_ok($$update collections set target_pokemon_id=-80601 where target_pokemon_id=-80602$$,
  '23505',null,'A privileged retarget cannot bypass Pokemon uniqueness');
select throws_ok($$update collections set target_set_id=-80601 where target_set_id=-80602$$,
  '23505',null,'A privileged retarget cannot bypass Extension uniqueness');
select lives_ok($$insert into collections(owner_id,name,collection_type) values
  ('60000000-0000-0000-0000-000000000001','Identical free name','free'),
  ('60000000-0000-0000-0000-000000000001','Identical free name','free')$$,
  'Free collections are outside target uniqueness, including identical names');

select throws_ok(format('update collections set name=%L where collection_type=%L',name,kind),
  '23514',null,'Short trimmed name rejected for ' || kind || ': ' || to_json(name)::text)
from (values ('free'),('automatic')) kinds(kind)
cross join (values ('  ab  '),(E'\t\nab\r\n'),(U&'\00A0ab\202F'),('éé'),('   ')) names(name);
select lives_ok($$update collections set name=E'\t Été \n'$$,
  'Exactly three useful Unicode characters accepted for both collection types');

select ok((select relrowsecurity from pg_class where oid='public.user_preferences'::regclass),'Preferences explicitly enable RLS');
select fk_ok('public','user_preferences','user_id','public','profiles','id','Preferences belong to an existing profile');
select is((select count(*) from user_preferences),0::bigint,'Profile creation does not eagerly create preferences');
select throws_ok($$insert into user_preferences(user_id) values('60000000-0000-0000-0000-000000000099')$$,
  '23503',null,'Preferences cannot exist without a profile');

set local role authenticated;
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000001';
select lives_ok($$insert into user_preferences default values$$,'Owner can create preferences using auth.uid()');
select results_eq($$select user_id,catalog_default_view,collection_default_view,last_catalog_view,last_collection_view from user_preferences$$,
  $$values ('60000000-0000-0000-0000-000000000001'::uuid,'last_used','last_used','list','list')$$,
  'Owner reads persisted defaults: last choice, initially List');
select throws_ok($$insert into user_preferences default values$$,'23505',null,'At most one preference row per profile');
select lives_ok($$insert into user_preferences(user_id,catalog_default_view) values(auth.uid(),'cards')
  on conflict(user_id) do update set catalog_default_view=excluded.catalog_default_view$$,
  'Owner-scoped upsert supports a first or subsequent save');
select lives_ok($$update user_preferences set catalog_default_view='list',collection_default_view='binder',last_catalog_view='cards',last_collection_view='cards'$$,
  'Owner updates fixed preferences and independent last selections');
select results_eq($$select catalog_default_view,collection_default_view,last_catalog_view,last_collection_view from user_preferences$$,
  $$values ('list','binder','cards','cards')$$,'All four owner changes persist');
select ok((select updated_at > created_at from user_preferences),'Shared timestamp trigger stamps updates');

select throws_ok(format('update user_preferences set %I=%L',field,value),'23514',null,'Invalid preference rejected: ' || field)
from (values ('catalog_default_view','binder'),('collection_default_view','dark'),
  ('last_catalog_view','last_used'),('last_collection_view','last_used')) invalid(field,value);
select throws_ok(format('update user_preferences set %I=null',field),'23502',null,'NULL preference rejected: ' || field)
from unnest(array['catalog_default_view','collection_default_view','last_catalog_view','last_collection_view']) field;
select throws_ok($$update user_preferences set user_id='60000000-0000-0000-0000-000000000002'$$,
  '42501',null,'Owner cannot transfer preferences');
select throws_ok($$update user_preferences set updated_at='2000-01-01'$$,'42501',null,'Owner cannot forge timestamps');
select throws_ok($$insert into user_preferences(user_id) values('60000000-0000-0000-0000-000000000002')$$,
  '42501',null,'INSERT RLS rejects preferences for another profile');

reset role;
insert into public.collection_shares(collection_id,recipient_user_id)
values('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000002';
select is((select count(*) from user_preferences),0::bigint,'Sharing a collection never exposes owner preferences');
select results_eq($$update user_preferences set catalog_default_view='cards' returning user_id$$,
  $$select null::uuid where false$$,'Recipient cannot update owner preferences');
select throws_ok($$insert into user_preferences(user_id,catalog_default_view)
  values('60000000-0000-0000-0000-000000000001','cards')
  on conflict(user_id) do update set catalog_default_view=excluded.catalog_default_view$$,
  '42501',null,'Upsert cannot overwrite another owner');
select lives_ok($$insert into user_preferences(collection_default_view,last_collection_view) values('cards','binder')$$,
  'Recipient can still save independent preferences');
select results_eq($$select user_id from user_preferences$$,
  $$values ('60000000-0000-0000-0000-000000000002'::uuid)$$,'Second owner reads only own preferences');
select throws_ok($$delete from user_preferences$$,'42501',null,'No direct deletion API is exposed');

set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000003';
select is((select count(*) from user_preferences),0::bigint,'Unrelated user sees neither owner');
set local role anon;
select throws_ok($$select * from user_preferences$$,'42501',null,'Anonymous preference reads denied');
select throws_ok($$insert into user_preferences default values$$,'42501',null,'Anonymous preference writes denied');

reset role;
insert into public.user_preferences(user_id) values('60000000-0000-0000-0000-000000000003');
delete from public.profiles where id='60000000-0000-0000-0000-000000000003';
select is((select count(*) from user_preferences where user_id='60000000-0000-0000-0000-000000000003'),0::bigint,
  'Removing a profile removes only its dependent preferences');

select * from finish();
rollback;
