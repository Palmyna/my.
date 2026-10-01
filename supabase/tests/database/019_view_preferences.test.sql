begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
  ('a2000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002'),
  ('a2000000-0000-0000-0000-000000000003'),
  ('a2000000-0000-0000-0000-000000000004');
delete from profiles where id = 'a2000000-0000-0000-0000-000000000004';
insert into collections(id,owner_id,name,collection_type) values
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Shared collection','free'),
  ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Private collection','free');
insert into collection_shares(collection_id,recipient_user_id) values
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002');
create temporary table original_collections as select to_jsonb(c) as row from collections c;
create temporary table original_items as select to_jsonb(i) as row from collection_items i;

select col_type_is('public','user_preferences','binder_default_format','text','Global binder format is TEXT');
select col_not_null('public','user_preferences','binder_default_format','Global binder format is NOT NULL');
select col_default_is('public','user_preferences','binder_default_format','3x3','Global binder default is 3x3');
select columns_are('public','collection_view_preferences',array['user_id','collection_id','binder_format','created_at','updated_at'],'Only explicit override and technical identity/timestamps');
select col_is_pk('public','collection_view_preferences',array['user_id','collection_id'],'Viewer + collection composite primary key');
select fk_ok('public','collection_view_preferences','user_id','public','profiles','id','Override belongs to profile');
select fk_ok('public','collection_view_preferences','collection_id','public','collections','id','Override references collection');
select col_not_null('public','collection_view_preferences','binder_format','Override format required');
select ok((select relrowsecurity from pg_class where oid='public.collection_view_preferences'::regclass),'Override RLS enabled explicitly');
select ok(qual is not null and with_check is not null and permissive = 'RESTRICTIVE', 'Override preserves restrictive ' || policyname)
  from pg_policies where tablename='collection_view_preferences' and policyname in ('require_mfa','require_my_profile','require_collection_access');
select is((select count(*) from user_preferences where user_id::text like 'a2000000-%'),0::bigint,'Signup does not create global preferences');
select is((select count(*) from collection_view_preferences where user_id::text like 'a2000000-%'),0::bigint,'Collection/share creation never copies defaults');
select ok(not exists(select 1 from pg_class c, lateral aclexplode(c.relacl) a where c.oid='public.collection_view_preferences'::regclass and a.grantee=0),'No PUBLIC table grant');
select ok(not has_table_privilege('anon','public.collection_view_preferences','SELECT,INSERT,UPDATE,DELETE'),'No anon table grants');
select ok(not exists(select 1 from pg_attribute c, lateral aclexplode(c.attacl) a where c.attrelid='public.collection_view_preferences'::regclass and a.grantee=0),'No PUBLIC column grants');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000001","aal":"aal2"}';
select lives_ok($$insert into user_preferences default values$$,'Owner creates preferences lazily');
select is((select binder_default_format from user_preferences),'3x3','Owner reads initial 3x3');
select lives_ok(format('update user_preferences set binder_default_format=%L', value),'Accepted global format ' || value)
  from unnest(array['2x2','3x3','4x3']) value;
select throws_ok($$update user_preferences set binder_default_format='5x5'$$,'23514',null,'Invalid global format rejected');
select throws_ok($$update user_preferences set binder_default_format=null$$,'23502',null,'NULL global format rejected');
select results_eq($$select catalog_default_view,collection_default_view,last_catalog_view,last_collection_view from user_preferences$$,
  $$values ('last_used'::text,'last_used'::text,'list'::text,'list'::text)$$,'Existing functional defaults preserved');

select lives_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','2x2')$$,'Owner creates own override');
select is((select binder_format from collection_view_preferences),'2x2','Owner reads own override');
select lives_ok(format('update collection_view_preferences set binder_format=%L',value),'Accepted override format ' || value)
  from unnest(array['2x2','3x3','4x3']) value;
select ok((select updated_at > created_at from collection_view_preferences),'Override updated_at stamped by existing trigger');
select throws_ok($$update collection_view_preferences set binder_format='5x5'$$,'23514',null,'Invalid override rejected on update');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000002','1x1')$$,'23514',null,'Invalid override rejected on insert');
select throws_ok($$update collection_view_preferences set binder_format=null$$,'23502',null,'NULL override rejected');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','3x3')$$,'23505',null,'Viewer + collection unique');
select throws_ok($$update collection_view_preferences set user_id='a2000000-0000-0000-0000-000000000002'$$,'42501',null,'Override user immutable');
select throws_ok($$update collection_view_preferences set collection_id='c2000000-0000-0000-0000-000000000002'$$,'42501',null,'Override collection immutable');
select throws_ok($$update collection_view_preferences set updated_at='2000-01-01'$$,'42501',null,'Override timestamps cannot be forged');
select throws_ok($$insert into collection_view_preferences(user_id,collection_id,binder_format) values('a2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','3x3')$$,'42501',null,'Cannot create another viewer override');
select lives_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000002','2x2')$$,'Same viewer can override a second collection');
select lives_ok($$update user_preferences set binder_default_format='3x3'$$,'Global default changes independently');
select is((select binder_format from collection_view_preferences where collection_id='c2000000-0000-0000-0000-000000000002'),'2x2','Global change does not overwrite explicit override');
select results_eq($$delete from collection_view_preferences where collection_id='c2000000-0000-0000-0000-000000000002' returning binder_format$$,
  $$values ('2x2'::text)$$,'Owner removes override to inherit');
select is((select count(*) from collection_view_preferences),1::bigint,'Reset deletes rather than copies default');

set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select count(*) from user_preferences),0::bigint,'Recipient cannot read owner global preferences');
select results_eq($$update user_preferences set binder_default_format='2x2' returning user_id$$,$$select null::uuid where false$$,'Recipient cannot update owner global preferences');
select throws_ok($$insert into user_preferences(user_id,binder_default_format) values('a2000000-0000-0000-0000-000000000001','2x2')$$,'42501',null,'Recipient cannot insert owner global preferences');
select lives_ok($$insert into user_preferences(binder_default_format) values('2x2')$$,'Recipient owns independent global format');
select is((select count(*) from collection_view_preferences),0::bigint,'Recipient cannot read owner overrides');
select results_eq($$update collection_view_preferences set binder_format='3x3' returning user_id$$,$$select null::uuid where false$$,'Recipient cannot update owner override');
select results_eq($$delete from collection_view_preferences returning user_id$$,$$select null::uuid where false$$,'Recipient cannot delete owner override');
select lives_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','2x2')$$,'Read-only recipient creates own override on shared collection');
select is((select binder_format from collection_view_preferences),'2x2','Recipient reads own override');
select lives_ok($$update collection_view_preferences set binder_format='3x3'$$,'Read-only recipient updates own override');
select results_eq($$delete from collection_view_preferences returning binder_format$$,$$values ('3x3'::text)$$,'Read-only recipient deletes own override');
select lives_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','3x3')$$,'Recipient can explicitly save again');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000002','3x3')$$,'42501',null,'Private collection override denied');
select results_eq($$update collections set name='Forbidden' returning id$$,$$select null::uuid where false$$,'Preference access never grants collection writes');

-- Shared access is revoked after the override was saved; every operation rechecks it.
reset role;
delete from collection_shares where collection_id='c2000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*) from collections),0::bigint,'Existing override gives no collection access');
select is((select count(*) from collection_view_preferences),0::bigint,'Revoked override invisible');
select results_eq($$update collection_view_preferences set binder_format='2x2' returning user_id$$,$$select null::uuid where false$$,'Revoked override update has no accessible rows');
select results_eq($$delete from collection_view_preferences returning user_id$$,$$select null::uuid where false$$,'Revoked override cannot be deleted through stale access');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','2x2')$$,'42501',null,'Revoked recipient cannot recreate override');
reset role;
select is((select count(*) from collection_view_preferences),2::bigint,'Revocation hides stored preferences without transferring them');
insert into collection_shares(collection_id,recipient_user_id) values('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000003","aal":"aal2"}';
select is((select count(*) from user_preferences),0::bigint,'Unrelated viewer cannot read global preferences');
select is((select count(*) from collection_view_preferences),0::bigint,'Unrelated viewer cannot read overrides');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','3x3')$$,'42501',null,'Unrelated viewer cannot create override');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000099','3x3')$$,'42501',null,'Unknown collection treated as inaccessible');

-- Missing AAL, aal1 and residual JWT without profile preserve both table boundaries.
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000001","aal":"aal1"}';
select is((select count(*) from user_preferences),0::bigint,'aal1 global read denied');
select is((select count(*) from collection_view_preferences),0::bigint,'aal1 override read denied');
select throws_ok($$insert into user_preferences(binder_default_format) values('3x3')$$,'42501',null,'aal1 global insert denied');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000002','3x3')$$,'42501',null,'aal1 override insert denied');
select results_eq($$update user_preferences set binder_default_format='2x2' returning user_id$$,$$select null::uuid where false$$,'aal1 global update denied');
select results_eq($$update collection_view_preferences set binder_format='2x2' returning user_id$$,$$select null::uuid where false$$,'aal1 override update denied');
select results_eq($$delete from collection_view_preferences returning user_id$$,$$select null::uuid where false$$,'aal1 override delete denied');
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000001"}';
select is((select count(*) from user_preferences),0::bigint,'Missing AAL global read denied');
select is((select count(*) from collection_view_preferences),0::bigint,'Missing AAL override read denied');
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000004","aal":"aal2"}';
select is((select count(*) from user_preferences),0::bigint,'Residual JWT global read denied');
select is((select count(*) from collection_view_preferences),0::bigint,'Residual JWT override read denied');
select throws_ok($$insert into user_preferences(binder_default_format) values('3x3')$$,'42501',null,'Residual JWT without profile cannot save global preferences');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','3x3')$$,'42501',null,'Residual JWT without profile cannot save override');
set local role anon;
select throws_ok($$select * from user_preferences$$,'42501',null,'anon global reads denied');
select throws_ok($$select * from collection_view_preferences$$,'42501',null,'anon override reads denied');
select throws_ok($$insert into collection_view_preferences(collection_id,binder_format) values('c2000000-0000-0000-0000-000000000001','3x3')$$,'42501',null,'anon override writes denied');

reset role;
select results_eq($$select to_jsonb(c) from collections c order by id$$,$$select row from original_collections order by row->>'id'$$,'Preferences leave every collection field unchanged');
select results_eq($$select to_jsonb(i) from collection_items i order by id$$,$$select row from original_items order by row->>'id'$$,'Preferences leave collection membership and order unchanged');
select throws_ok($$insert into collection_view_preferences(user_id,collection_id,binder_format) values('a2000000-0000-0000-0000-000000000099','c2000000-0000-0000-0000-000000000001','3x3')$$,'23503',null,'Privileged insert still requires existing profile');
select throws_ok($$insert into collection_view_preferences(user_id,collection_id,binder_format) values('a2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000099','3x3')$$,'23503',null,'Privileged insert still requires existing collection');
delete from auth.users where id='a2000000-0000-0000-0000-000000000002';
select is((select count(*) from collection_view_preferences where user_id='a2000000-0000-0000-0000-000000000002'),0::bigint,'Account deletion cascades viewer overrides');
select is((select count(*) from user_preferences where user_id='a2000000-0000-0000-0000-000000000002'),0::bigint,'Account deletion cascades global preferences');
select is((select count(*) from collections where id='c2000000-0000-0000-0000-000000000001'),1::bigint,'Deleting viewer preserves another owner collection');
delete from collections where id='c2000000-0000-0000-0000-000000000001';
select is((select count(*) from collection_view_preferences where collection_id='c2000000-0000-0000-0000-000000000001'),0::bigint,'Collection deletion cascades overrides');
select is((select binder_default_format from user_preferences where user_id='a2000000-0000-0000-0000-000000000001'),'3x3','Collection deletion preserves global preference');

select * from finish();
rollback;
