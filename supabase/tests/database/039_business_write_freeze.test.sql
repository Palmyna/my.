begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('private', 'business_write_freeze', 'Persistent private state');
select is((select count(*)::int from private.business_write_freeze), 1, 'Exactly one state row');
select ok((select not frozen from private.business_write_freeze), 'Local installation/reopened state is open');
select ok((select relrowsecurity from pg_class where oid='private.business_write_freeze'::regclass), 'State RLS enabled');
select is((select count(*)::int from pg_policy where polrelid='private.business_write_freeze'::regclass), 0, 'No user state policy');
select throws_ok($$insert into private.business_write_freeze(singleton) values(false)$$,
  '23514', null, 'Cannot insert a second singleton identity');

select ok(not has_table_privilege(role, 'private.business_write_freeze',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), role || ' has no state privilege')
from unnest(array['anon','authenticated','service_role','supabase_auth_admin','my_notification_publisher','authenticator']) role;
select ok(not has_function_privilege(role, signature, 'EXECUTE'), role || ' cannot execute ' || signature)
from unnest(array['anon','authenticated','service_role','supabase_auth_admin','my_notification_publisher','authenticator']) role,
unnest(array['private.set_business_write_freeze(boolean)','private.get_business_write_freeze()',
  'private.require_business_writes_open()','private.guard_business_write_freeze()']) signature;
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) acl
  where p.oid in ('private.set_business_write_freeze(boolean)'::regprocedure,
    'private.get_business_write_freeze()'::regprocedure,'private.require_business_writes_open()'::regprocedure,
    'private.guard_business_write_freeze()'::regprocedure) and acl.grantee=0), 'No PUBLIC function privilege');
select is((select count(*)::int from pg_proc where oid in (
  'private.set_business_write_freeze(boolean)'::regprocedure,'private.get_business_write_freeze()'::regprocedure,
  'private.require_business_writes_open()'::regprocedure,'private.guard_business_write_freeze()'::regprocedure)
  and proowner='postgres'::regrole and proconfig=array['search_path=""']), 4, 'Explicit owner and empty search_path');
select ok(not (select prosecdef from pg_proc where oid='private.set_business_write_freeze(boolean)'::regprocedure), 'Operator setter is invoker');
select ok((select prosecdef from pg_proc where oid='private.require_business_writes_open()'::regprocedure), 'Internal guard reads state with owner rights');
select ok((select position('pg_advisory_xact_lock_shared(771403)' in prosrc)>0
  and position('for share' in prosrc)>0 from pg_proc where oid='private.require_business_writes_open()'::regprocedure),
  'Shared admission barrier and stale-snapshot locking read');
select ok((select position('pg_advisory_xact_lock(771403)' in prosrc)>0
  from pg_proc where oid='private.set_business_write_freeze(boolean)'::regprocedure), 'Exclusive admission barrier');

-- Future MY. tables must deliberately join the barrier. This coverage test
-- fails if a migration adds an unprotected relation, including a partition.
select ok(exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='business_write_freeze'
  and t.tgtype=62 and t.tgenabled='O' and t.tgfoid='private.guard_business_write_freeze()'::regprocedure),
  format('%I.%I statement guard covers INSERT/UPDATE/DELETE/TRUNCATE',n.nspname,c.relname))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p') and c.oid <> 'private.business_write_freeze'::regclass;
select ok(exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='business_write_freeze'
  and tgtype=14 and tgenabled='O'), 'Auth creation/destruction statement barrier; Auth UPDATE untouched');

select ok(position('perform private.require_business_writes_open();' in prosrc)>0,
  proname || ' enters barrier before business locks and replay')
from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
  'create_automatic_collection','add_manual_collection_item','remove_manual_collection_item','reorder_collection_item',
  'add_manual_collection_item_v2','remove_manual_collection_item_v2','reorder_collection_item_v2',
  'set_collection_item_hidden','apply_collection_update','mark_notification_read','process_announcement_notification']);
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and has_function_privilege('my_notification_publisher',p.oid,'EXECUTE')), 2,
  'Publisher still executes only two MY. functions');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth') and c.relkind in ('r','p','v')
  and has_table_privilege('my_notification_publisher',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  'Publisher still has no table privileges');

select throws_ok('select private.set_business_write_freeze(null)', '22023', 'business_write_freeze_input_invalid', 'No null toggle');
select is(private.set_business_write_freeze(true)->>'frozen', 'true', 'Operator closes state');
select is(private.get_business_write_freeze()->>'frozen', 'true', 'Operator rereads closed state');
select lives_ok('update public.user_preferences set binder_default_format=binder_default_format where false', 'Trusted SQL administration preserved');
select is(private.set_business_write_freeze(false)->>'frozen', 'false', 'Operator reopens without ACL change');
select * from finish();
rollback;
