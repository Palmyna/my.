begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc

create function pg_temp.parent(n integer default 1) returns uuid language sql immutable as $$
  select ('c2500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.item(n integer) returns uuid language sql immutable as $$
  select ('d2500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.operation(n integer) returns uuid language sql immutable as $$
  select ('e2500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.read_result(n integer default 500, parent integer default 1) returns jsonb language sql as $$
  select public.get_collection_operation_result(pg_temp.parent(parent),pg_temp.operation(n));
$$;
grant execute on function pg_temp.parent(integer),pg_temp.item(integer),pg_temp.operation(integer),
  pg_temp.read_result(integer,integer) to authenticated,anon,service_role;
create temp table results(label text primary key,result jsonb);
grant select,insert on results to authenticated;
create temp table writer_acl as select oid,proacl from pg_proc where proname in
  ('reorder_collection_item_v2','add_manual_collection_item_v2','remove_manual_collection_item_v2',
   'reorder_collection_item','add_manual_collection_item','remove_manual_collection_item');

select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""'] and pronargdefaults=0
  and prorettype='jsonb'::regtype and proargnames=array['p_collection_id','p_operation_id'],
  'Reader volatile definer, empty path, exact UUID signature, JSONB, no default')
  from pg_proc where oid='public.get_collection_operation_result(uuid,uuid)'::regprocedure;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='get_collection_operation_result'),1::bigint,'No overload');
select ok(has_function_privilege('authenticated','public.get_collection_operation_result(uuid,uuid)','EXECUTE'),'Authenticated EXECUTE');
select ok(not has_function_privilege(r,'public.get_collection_operation_result(uuid,uuid)','EXECUTE'),r || ' EXECUTE closed')
  from unnest(array['anon','service_role']) r;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.get_collection_operation_result(uuid,uuid)'::regprocedure and a.grantee=0),'PUBLIC EXECUTE closed');
select ok(not has_table_privilege(r,t,p),r || ' direct ' || p || ' closed: ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
  unnest(array['private.collection_order_intents','private.collection_operation_receipts']) t cross join
  unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select ok(relrowsecurity,'Receipt RLS remains enabled') from pg_class where oid='private.collection_operation_receipts'::regclass;

set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
set local role authenticated;
insert into results values ('move',public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(2),'start',null,2,pg_temp.operation(500)));
insert into results values ('noop',public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(2),'start',null,3,pg_temp.operation(501)));
insert into results values ('add',public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'end',3,pg_temp.operation(502)));
select is((select result->>'outcome' from results where label='move'),'changed','Effective move really changed order');
select is((select result->>'outcome' from results where label='noop'),'noop','Second move really produced noop receipt');
select is((select result->>'personal_revision' from results where label='noop'),'3','Noop accepted revision preserved');
select is(pg_temp.read_result(500),(select result from results where label='move'),'Effective move returns actual mutation result after later add');
select is(pg_temp.read_result(501),(select result from results where label='noop'),'Noop returns actual mutation result');
select is(pg_temp.read_result(502),(select result from results where label='add'),'Manual add returns actual mutation result');
insert into results values ('later_move',public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(5),'start',null,4,pg_temp.operation(503)));
insert into results values ('remove',public.remove_manual_collection_item_v2(pg_temp.parent(),
  (select (result->>'collection_item_id')::uuid from results where label='add'),5,pg_temp.operation(504)));
insert into results values ('remove_move_subject',public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(2),6,pg_temp.operation(505)));
select is(pg_temp.read_result(500),(select result from results where label='move'),'Move result survives subject deletion');
select is(pg_temp.read_result(501),(select result from results where label='noop'),'Noop result survives subject deletion');
select is(pg_temp.read_result(502),(select result from results where label='add'),'Add result survives subject deletion');
select is(pg_temp.read_result(504),(select result from results where label='remove'),'Removal returns actual mutation result');
insert into results values ('reintroduced',public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'start',7,pg_temp.operation(506)));
select isnt((select result->>'collection_item_id' from results where label='reintroduced'),
  (select result->>'collection_item_id' from results where label='add'),'Same variant reintroduced under new UUID');
reset role;
select is((select count(*) from public.collection_items where id=pg_temp.item(2)),0::bigint,'Move subject truly absent');
select is((select personal_revision from public.collections where id=pg_temp.parent()),8::bigint,'Current revision differs from historical results');
select is(r.result,s.result,'Mutation result equals actual stored receipt: ' || s.label)
  from results s join private.collection_operation_receipts r on r.collection_id=pg_temp.parent() and r.operation_id=(s.result->>'operation_id')::uuid;
select is((select array_agg(k order by k) from jsonb_object_keys(result) k),
  array['collection_item_id','operation_id','outcome','personal_revision'],'Stored writer result has only four public fields: ' || label) from results;

-- One snapshot covers every application table and Auth users/sessions. Compare
-- full-row hashes after all reads/refusals, including receipts and timestamps.
create function pg_temp.data_snapshot() returns jsonb language plpgsql as $$
declare t record; data jsonb; result jsonb := '{}'::jsonb;
begin
  for t in select format('%I.%I',n.nspname,c.relname) name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and (n.nspname in ('public','private') or (n.nspname='auth' and c.relname in ('users','sessions'))) order by 1 loop
    execute format('select jsonb_build_array(count(*)::text,md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),''''))) from %s t',t.name) into data;
    result := result || jsonb_build_object(t.name,data);
  end loop;
  return result;
end;
$$;
create temp table unchanged as select pg_temp.data_snapshot() data;
set local role authenticated;
select is(public.get_collection_operation_result(pg_temp.parent(),(result->>'operation_id')::uuid),result,
  'Historical exact result after moves, additions, removals, reintroduction: ' || label) from results;
select is(public.get_collection_operation_result(pg_temp.parent(),(result->>'operation_id')::uuid),result,
  'Repeated consultation identical: ' || label) from results;
select is(pg_temp.read_result(599),null::jsonb,'Unknown UUID returns SQL NULL for authorized owner');
select throws_ok($$select public.get_collection_operation_result(pg_temp.parent(),null)$$,'22023','collection_operation_invalid','NULL operation rejected');
select throws_ok($$select public.get_collection_operation_result(null,pg_temp.operation(500))$$,'42501','collection_action_unavailable','NULL parent safely unavailable');
select throws_ok('select pg_temp.read_result(500,3)','23514','order_contract_upgrade_required','Contract 1 rejected');
select throws_ok('select pg_temp.read_result(500,99)','42501','collection_action_unavailable','Missing parent rejected');
select throws_ok('select pg_temp.read_result(500,6)','42501','collection_action_unavailable','Foreign parent rejected');
reset role;

savepoint bigint;
update public.collections set personal_revision=9007199254740993 where id=pg_temp.parent(4);
set local role authenticated;
insert into results values ('bigint',public.add_manual_collection_item_v2(pg_temp.parent(4),9007199254740997,'end',9007199254740993,pg_temp.operation(510)));
select is(pg_temp.read_result(510,4),(select result from results where label='bigint'),'BIGINT result matches actual mutation');
select is(pg_temp.read_result(510,4)->>'personal_revision','9007199254740994','BIGINT decimal preserved beyond JavaScript safe precision');
select is(jsonb_typeof(pg_temp.read_result(510,4)->'personal_revision'),'string','BIGINT remains JSON string');
reset role;
select is(pg_temp.read_result(510,4),(select result from private.collection_operation_receipts where collection_id=pg_temp.parent(4) and operation_id=pg_temp.operation(510)),'BIGINT matches stored receipt');
rollback to bigint;
set constraints all deferred;

-- Future result shapes are transport-opaque. Synthetic receipts only, no new
-- hide/apply writer, business rule or public schema imposed by this reader.
savepoint future_shapes;
insert into private.collection_operation_receipts(collection_id,operation_id,kind,request_hash,accepted_revision,result) values
  (pg_temp.parent(),pg_temp.operation(511),'hide',repeat('a',64),8,'{"operation_id":"e2500000-0000-0000-0000-000000000511","future_hide":{"value":true}}'),
  (pg_temp.parent(),pg_temp.operation(512),'apply',repeat('b',64),8,'{"future_apply":["9007199254740995",{"extra":"preserved"}]}');
insert into results select kind,result from private.collection_operation_receipts where operation_id in (pg_temp.operation(511),pg_temp.operation(512));
set local role authenticated;
select is(pg_temp.read_result(511),(select result from results where label='hide'),'Future hide result returned without four-field projection');
select is(pg_temp.read_result(512),(select result from results where label='apply'),'Future apply result returned without four-field projection');
reset role;
rollback to future_shapes;
set constraints all deferred;

-- Real roles and JWT conventions, including invalid profile and absent session.
create function pg_temp.denied(id text, aal text, label text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal',aal)::text,true);
  return next throws_ok('select pg_temp.read_result()','42501','collection_action_unavailable',label || ' existing receipt denied');
  return next throws_ok('select pg_temp.read_result(599)','42501','collection_action_unavailable',label || ' unknown receipt also denied');
end;
$$;
grant execute on function pg_temp.denied(text,text,text) to authenticated;
set local role authenticated;
select pg_temp.denied(id,aal,label) from (values
  ('a2500000-0000-0000-0000-000000000001','aal1','Owner no AAL2'),
  ('a2500000-0000-0000-0000-000000000001',null,'Owner missing AAL'),
  ('a2500000-0000-0000-0000-000000000002','aal2','Shared recipient'),
  ('a2500000-0000-0000-0000-000000000003','aal2','Third party'),
  ('a2500000-0000-0000-0000-000000000004','aal2','Auth user missing profile'),
  (null,'aal2','No session')) v(id,aal,label);
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Authenticated real direct receipt SELECT denied');
reset role;
set local role anon;
select throws_ok('select pg_temp.read_result()','42501',null,'Anon real EXECUTE denied');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Anon real direct receipt SELECT denied');
reset role;
set local role service_role;
select throws_ok('select pg_temp.read_result()','42501',null,'Service role real EXECUTE denied');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Service role real direct receipt SELECT denied');
reset role;

savepoint foreign_receipt;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}';
insert into results values ('foreign',public.add_manual_collection_item_v2(pg_temp.parent(6),-95008,'end',0,pg_temp.operation(520)));
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
set local role authenticated;
select is(pg_temp.read_result(520),null::jsonb,'Existing foreign UUID not found in own parent');
select throws_ok('select pg_temp.read_result(520,6)','42501','collection_action_unavailable','Foreign receipt cannot be read by UUID');
reset role;
rollback to foreign_receipt;
set constraints all deferred;

savepoint transfer;
update public.collections set owner_id='a2500000-0000-0000-0000-000000000003' where id=pg_temp.parent();
set local role authenticated;
select throws_ok('select pg_temp.read_result()','42501','collection_action_unavailable','Former owner denied despite existing receipt');
reset role;
rollback to transfer;
set constraints all deferred;
savepoint parent_delete;
delete from public.collections where id=pg_temp.parent();
set local role authenticated;
select throws_ok('select pg_temp.read_result()','42501','collection_action_unavailable','Deleted parent unavailable');
reset role;
rollback to parent_delete;
set constraints all deferred;

savepoint internal_error;
alter table private.collection_operation_receipts rename to test_unavailable_receipts;
set local role authenticated;
select throws_ok('select pg_temp.read_result()','XX000','phase8_operation_unexpected','Internal SQL error sanitized');
reset role;
rollback to internal_error;
set constraints all deferred;

select is(pg_temp.data_snapshot(),(select data from unchanged),'All consultation/refusal paths preserve every application row and Auth data, order, journal, receipts and revisions');
select results_eq($$select oid,proacl from pg_proc where oid in (select oid from writer_acl) order by oid$$,
  $$select oid,proacl from writer_acl order by oid$$,'All six writer privileges unchanged');
select lives_ok('set constraints all immediate','Fixture final invariants valid');
select * from finish();
rollback;
