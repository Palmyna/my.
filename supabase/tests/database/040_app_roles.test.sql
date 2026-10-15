begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('private', 'app_role_assignments', 'Roles live outside the Data API');
select ok((select relrowsecurity and relowner='postgres'::regrole from pg_class
  where oid='private.app_role_assignments'::regclass), 'Private storage owned by postgres with RLS');
select is((select count(*)::int from pg_policy where polrelid='private.app_role_assignments'::regclass),
  0, 'No client policy');
select is((select confdeltype::text from pg_constraint where conrelid='private.app_role_assignments'::regclass
  and confrelid='auth.users'::regclass), 'c', 'Hard Auth deletion cascades assignments');
select ok(not has_table_privilege(r, 'private.app_role_assignments',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), r || ' has no role table privilege')
from unnest(array['anon','authenticated','service_role','authenticator','supabase_auth_admin','my_notification_publisher']) r;
select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' cannot execute ' || f)
from unnest(array['anon','authenticated','service_role','authenticator','supabase_auth_admin','my_notification_publisher']) r,
  unnest(array['private.set_app_role(uuid,text)','private.is_super_admin()']) f;
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
  where p.oid in ('private.set_app_role(uuid,text)'::regprocedure,'private.is_super_admin()'::regprocedure)
  and a.grantee=0), 'PUBLIC has no function privilege');
select is((select count(*)::int from pg_proc where oid in
  ('private.set_app_role(uuid,text)'::regprocedure,'private.is_super_admin()'::regprocedure)
  and proowner='postgres'::regrole and proconfig=array['search_path=""']), 2, 'Pinned owner and empty search_path');
select ok(not (select prosecdef from pg_proc where oid='private.set_app_role(uuid,text)'::regprocedure),
  'Operator setter is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid='private.is_super_admin()'::regprocedure),
  'Internal predicate alone reads private state with owner rights');
select ok(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace
  and proname in ('set_app_role','is_super_admin')), 'No public role RPC');

-- Reserved synthetic identities; all changes roll back, no real email/UUID.
insert into auth.users(id, email_confirmed_at, raw_user_meta_data) values
  ('7b210000-0000-0000-0000-000000000001', now(), '{"role":"super_admin"}'),
  ('7b210000-0000-0000-0000-000000000002', now(), '{}'),
  ('7b210000-0000-0000-0000-000000000003', null, '{}');
select is((select count(*)::int from private.app_role_assignments
  where user_id::text like '7b210000-%'), 0, 'Signup never creates a super_admin, including forged metadata');
set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000001","aal":"aal2","role":"super_admin","user_metadata":{"role":"super_admin"},"app_metadata":{"role":"super_admin"}}';
select is(private.is_super_admin(), false, 'Role claims and metadata give no privilege');
select lives_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','super_admin')$$,
  'Direct SQL operator grants a verified account');
select is(private.is_super_admin(), true, 'Server assignment recognized at AAL2');
select is((select granted_by::text from private.app_role_assignments
  where user_id='7b210000-0000-0000-0000-000000000001'), session_user::text, 'Attribution records actual operator');
create temporary table grant_before as select * from private.app_role_assignments
  where user_id='7b210000-0000-0000-0000-000000000001';
select lives_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','super_admin')$$,
  'Repeat grant is idempotent');
select results_eq('select * from private.app_role_assignments where user_id=''7b210000-0000-0000-0000-000000000001''',
  'select * from grant_before', 'Retry preserves grant provenance');
select throws_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000003','super_admin')$$,
  '22023','app_role_verified_account_required','Unverified account rejected');
select throws_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000099','super_admin')$$,
  '22023','app_role_verified_account_required','Missing account rejected');
select throws_ok($$select private.set_app_role(null,'super_admin')$$,
  '22023','app_role_input_invalid','Null identity rejected');
select throws_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001',null)$$,
  '22023','app_role_input_invalid','Null role rejected');
select throws_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','postgres')$$,
  '22023','app_role_input_invalid','SQL role name rejected');
select throws_ok($$insert into private.app_role_assignments(user_id,role)
  values('7b210000-0000-0000-0000-000000000002','user')$$,'23514',null,'Ordinary role stays implicit');
select throws_ok($$insert into private.app_role_assignments(user_id,role)
  values('7b210000-0000-0000-0000-000000000099','super_admin')$$,'23503',null,'FK rejects missing Auth identity');

set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000001","aal":"aal1"}';
select is(private.is_super_admin(), false, 'Assigned role cannot replace AAL2');
set local request.jwt.claims = '{}';
select is(private.is_super_admin(), false, 'No identity or AAL means no privilege');
set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(private.is_super_admin(), false, 'Another UUID remains user');
set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000001","aal":"aal2"}';
savepoint missing_profile;
delete from public.profiles where id='7b210000-0000-0000-0000-000000000001';
select is(private.is_super_admin(), false, 'Missing live MY. profile fails closed');
rollback to missing_profile;

insert into public.collections(id,owner_id,name,collection_type) values
  ('7b210001-0000-0000-0000-000000000001','7b210000-0000-0000-0000-000000000001','Role owner fixture','free'),
  ('7b210001-0000-0000-0000-000000000002','7b210000-0000-0000-0000-000000000002','Other private fixture','free');
set local role authenticated;
select throws_ok($$select * from private.app_role_assignments$$,'42501',null,'No direct role read');
select throws_ok($$insert into private.app_role_assignments(user_id,role)
  values('7b210000-0000-0000-0000-000000000002','super_admin')$$,'42501',null,'Self grant refused');
select throws_ok($$update private.app_role_assignments set user_id='7b210000-0000-0000-0000-000000000002'$$,
  '42501',null,'Assignment cannot be transferred');
select throws_ok($$delete from private.app_role_assignments$$,'42501',null,'Client revocation refused');
select throws_ok($$truncate private.app_role_assignments$$,'42501',null,'Client truncate refused');
select throws_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','super_admin')$$,
  '42501',null,'Private setter not executable by authenticated');
select throws_ok($$select private.is_super_admin()$$,'42501',null,'No internal predicate API execution');
select throws_ok($$update public.profiles set role='super_admin' where id='7b210000-0000-0000-0000-000000000001'$$,
  '42703',null,'Profile has no writable application role');
select is((select count(*)::int from public.collections where id='7b210001-0000-0000-0000-000000000001'),
  1,'Assigned account can read own collection at AAL2');
select is((select count(*)::int from public.collections where id='7b210001-0000-0000-0000-000000000002'),
  0,'Assigned account cannot read another private collection');
select is(public.get_collection_content_v2('7b210001-0000-0000-0000-000000000002'),
  null::jsonb,'Existing invoker reader still enforces ownership');
select throws_ok($$select public.get_collection_update_status('7b210001-0000-0000-0000-000000000002')$$,
  '42501',null,'Existing definer reader still enforces ownership');
set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000001","aal":"aal1"}';
select is((select count(*)::int from public.collections where id::text like '7b210001-%'),0,
  'Existing restrictive MFA RLS still denies AAL1');
reset role;

select lives_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','user')$$,
  'Operator revokes');
set local request.jwt.claims = '{"sub":"7b210000-0000-0000-0000-000000000001","aal":"aal2","app_metadata":{"role":"super_admin"}}';
select is(private.is_super_admin(),false,'Revocation effective without token refresh');
select lives_ok($$select private.set_app_role('7b210000-0000-0000-0000-000000000001','user')$$,'Repeat revocation is harmless');
select private.set_app_role('7b210000-0000-0000-0000-000000000001','super_admin');
delete from auth.users where id='7b210000-0000-0000-0000-000000000001';
select is((select count(*)::int from private.app_role_assignments where user_id='7b210000-0000-0000-0000-000000000001'),
  0,'Account deletion removes grant');
select is((select count(*)::int from public.profiles where id='7b210000-0000-0000-0000-000000000001'),
  0,'Existing account cleanup preserved');
select is(private.is_super_admin(),false,'Old claims cannot restore deleted privilege');

select * from finish();
rollback;
