begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- pgTAP connects as operator: SET ROLE cannot change session_user. Inspect
-- admission ownership/order here; actual session decisions are proved by the
-- authenticator/Auth/PostgREST connections in roles:test:local.
select ok(position('pg_advisory_xact_lock_shared(771403)' in prosrc)
  < position('for share' in prosrc), 'Admission lock precedes locking read')
from pg_proc where oid='private.require_business_writes_open()'::regprocedure;
select ok(position('for share' in prosrc) < position('private.is_super_admin()' in prosrc)
  and position('business_write_freeze_unavailable' in prosrc) < position('private.is_super_admin()' in prosrc),
  'Application exception follows locked authoritative state and missing-state refusal')
from pg_proc where oid='private.require_business_writes_open()'::regprocedure;
select ok(position('session_user = ''authenticator''' in prosrc)>0
  and position('coalesce(auth.jwt()->>''role'' = ''authenticated'', false)' in prosrc)>0,
  'Exception limited to platform authenticated application requests')
from pg_proc where oid='private.require_business_writes_open()'::regprocedure;
select ok(position('current_user' in prosrc)=0 and position('metadata' in prosrc)=0,
  'Definer identity and metadata are never proof of role')
from pg_proc where oid='private.require_business_writes_open()'::regprocedure;

insert into auth.users(id,email_confirmed_at) values
  ('7b220000-0000-0000-0000-000000000001',now()),
  ('7b220000-0000-0000-0000-000000000002',now());
select private.set_app_role('7b220000-0000-0000-0000-000000000001','super_admin');
select private.set_business_write_freeze(true);
set local request.jwt.claims='{"sub":"7b220000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}';
select is(private.is_super_admin(),true,'Assigned AAL2 profile remains eligible during freeze');
set local role authenticated;
select throws_ok('select private.set_business_write_freeze(false)', '42501', null, 'Super_admin cannot control freeze');
select throws_ok('update private.business_write_freeze set frozen=false where singleton', '42501', null, 'Super_admin cannot change singleton');
select throws_ok('alter table public.collections disable trigger business_write_freeze', '42501', null, 'Super_admin cannot disable guard');
select throws_ok($$select private.set_app_role('7b220000-0000-0000-0000-000000000002','super_admin')$$,
  '42501',null,'No role assignment API for super_admin');
select ok(not pg_has_role('authenticated','postgres','MEMBER'), 'Application role never grants SQL postgres membership');
reset role;
set local request.jwt.claims='{"sub":"7b220000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated","user_metadata":{"role":"super_admin"},"app_metadata":{"role":"super_admin"}}';
select is(private.is_super_admin(),false,'Ordinary identity and fabricated metadata ineligible');
set local request.jwt.claims='{"sub":"7b220000-0000-0000-0000-000000000001","aal":"aal1","role":"authenticated"}';
select is(private.is_super_admin(),false,'Assigned AAL1 ineligible');
set local request.jwt.claims='{}';
select is(private.is_super_admin(),false,'Missing identity/assurance ineligible');
set local request.jwt.claims='{"sub":"7b220000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}';
savepoint missing_profile;
delete from public.profiles where id='7b220000-0000-0000-0000-000000000001';
select is(private.is_super_admin(),false,'Missing live profile ineligible');
rollback to missing_profile;
select private.set_app_role('7b220000-0000-0000-0000-000000000001','user');
select is(private.is_super_admin(),false,'Revocation observed with same claims');
select lives_ok('select private.require_business_writes_open()', 'Direct SQL operator exception preserved');
select * from finish();
rollback;
