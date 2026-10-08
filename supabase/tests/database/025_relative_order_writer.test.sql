begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc

create temp table seed_intents as select * from private.collection_order_intents where collection_id::text like 'c250%';
create temp table seed_items as select * from public.collection_items where collection_id::text like 'c250%';
create temp table seed_parents as select * from public.collections where id::text like 'c250%';
create temp table copies as select to_jsonb(p) data from public.physical_copies p;
create temp table targets as select to_jsonb(t) data from public.automatic_target_states t;
create temp table result_store(label text, result jsonb);
grant select,insert on result_store to authenticated;

-- Test-only naming/reset adapters, scoped to reserved fixtures. No production
-- normalization code used to derive the explicit expected permutations below.
create function pg_temp.item(n integer) returns uuid language sql immutable as $$
  select ('d2500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.operation(n integer) returns uuid language sql immutable as $$
  select ('e2500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.move(n integer, placement text, anchor integer default null,
  revision bigint default 2, operation integer default 100) returns jsonb language sql as $$
  select public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000001',
    pg_temp.item(n),placement,pg_temp.item(anchor),revision,pg_temp.operation(operation));
$$;
create function pg_temp.fixture_order() returns integer[] language sql as $$
  select array_agg(right(id::text,12)::integer order by sort_position,id)
  from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001';
$$;
grant execute on function pg_temp.item(integer), pg_temp.operation(integer),
  pg_temp.move(integer,text,integer,bigint,integer) to authenticated, anon, service_role;
create function pg_temp.reset_fixture() returns void language plpgsql as $$
begin
  delete from private.collection_operation_receipts where collection_id='c2500000-0000-0000-0000-000000000001';
  delete from private.collection_order_intents where collection_id='c2500000-0000-0000-0000-000000000001';
  insert into private.collection_order_intents select * from seed_intents where collection_id='c2500000-0000-0000-0000-000000000001';
  update public.collection_items i set sort_position=s.sort_position from seed_items s where i.id=s.id;
  update public.collections set personal_revision=2 where id='c2500000-0000-0000-0000-000000000001';
end;
$$;

select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""'], 'v2 safe volatile definer')
  from pg_proc where oid='public.reorder_collection_item_v2(uuid,uuid,text,uuid,bigint,uuid)'::regprocedure;
select ok(has_function_privilege('authenticated','public.reorder_collection_item_v2(uuid,uuid,text,uuid,bigint,uuid)','EXECUTE'), 'Authenticated execute granted');
select ok(not has_function_privilege(r,'public.reorder_collection_item_v2(uuid,uuid,text,uuid,bigint,uuid)','EXECUTE'),r || ' execute closed')
  from unnest(array['anon','service_role']) r;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.reorder_collection_item_v2(uuid,uuid,text,uuid,bigint,uuid)'::regprocedure and a.grantee=0), 'PUBLIC execute closed');
select ok(not has_column_privilege('authenticated',t,c,'UPDATE'),t || '.' || c || ' direct update closed')
  from (values ('public.collections','personal_revision'),('public.collections','order_contract_version'),('public.collection_items','sort_position')) v(t,c);
select ok(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE'),r || ' private access closed: ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['private.collection_order_intents','private.collection_operation_receipts']) t;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
-- All three v1 writers still work on an actual fixture contract-1 parent.
insert into result_store values ('v1',jsonb_build_object('id',public.add_manual_collection_item('c2500000-0000-0000-0000-000000000003',-95001,'start')));
select lives_ok($$select public.reorder_collection_item('c2500000-0000-0000-0000-000000000003',(select (result->>'id')::uuid from result_store where label='v1'),'end')$$,'v1 reorder works');
select lives_ok($$select public.remove_manual_collection_item('c2500000-0000-0000-0000-000000000003',(select (result->>'id')::uuid from result_store where label='v1'))$$,'v1 remove works');
select throws_ok(sql,'23514','order_contract_upgrade_required',label) from (values
  ($$select public.reorder_collection_item('c2500000-0000-0000-0000-000000000001',pg_temp.item(5),'start')$$,'v1 reorder refuses v2'),
  ($$select public.add_manual_collection_item('c2500000-0000-0000-0000-000000000001',-95006,'start')$$,'v1 add refuses v2'),
  ($$select public.remove_manual_collection_item('c2500000-0000-0000-0000-000000000001',pg_temp.item(2))$$,'v1 remove refuses v2'),
  ($$select public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000003',pg_temp.item(1),'start',null,0,pg_temp.operation(100))$$,'v2 refuses v1')) v(sql,label);
reset role;
select results_eq($$select to_jsonb(i) from public.collection_items i where collection_id='c2500000-0000-0000-0000-000000000001' order by id$$,
  $$select to_jsonb(s) from seed_items s where collection_id='c2500000-0000-0000-0000-000000000001' order by id$$,'Legacy refusals write no item');
select is((select personal_revision from public.collections where id='c2500000-0000-0000-0000-000000000003'),0::bigint,'Legacy revision remains zero');
select is((select count(*) from private.collection_operation_receipts),0::bigint,'Legacy success/refusals create no receipt');

-- One real authenticated v2 success, strict result and R1 mixed suffix.
set local role authenticated;
insert into result_store values ('first',pg_temp.move(5,'before',2));
select is(public.get_collection_item_order('c2500000-0000-0000-0000-000000000001'),
  array[pg_temp.item(1),pg_temp.item(5),pg_temp.item(2),pg_temp.item(3),pg_temp.item(4)],'Owner v2 moves E before B in full order');
reset role;
select is((select result from result_store where label='first'),jsonb_build_object('operation_id',pg_temp.operation(100),'outcome','changed','personal_revision','3','collection_item_id',pg_temp.item(5)), 'Strict four-key result; revision decimal string');
select is((select fallback_item_ids from private.collection_order_intents where operation_id=pg_temp.operation(100)),array[pg_temp.item(3),pg_temp.item(4)], 'R1 complete mixed automatic/manual suffix, subject excluded');
select is((select sort_position from public.collection_items where id=pg_temp.item(5)),1.5::numeric,'Exact decimal midpoint');
select is((select result from private.collection_operation_receipts where operation_id=pg_temp.operation(100)),(select result from result_store where label='first'),'Receipt result identical to RPC');
select ok((select kind='move' and accepted_revision=3 and request_hash ~ '^[a-f0-9]{64}$' from private.collection_operation_receipts where operation_id=pg_temp.operation(100)), 'Receipt kind/revision/SHA256 coherent');

create function pg_temp.check_move(n integer, placement text, anchor integer, expected integer[], normalized integer, fallback integer[])
returns setof text language plpgsql as $$
declare response jsonb; actual integer[]; suffix uuid[]; changed boolean; label text;
begin
  perform pg_temp.reset_fixture();
  response := pg_temp.move(n,placement,anchor);
  actual := pg_temp.fixture_order();
  changed := expected <> array[1,2,3,4,5];
  label := n || ' ' || placement || coalesce(' ' || anchor,'');
  return next is(actual,expected,label || ' exact sequence');
  return next is(array_remove(actual,n),array_remove(array[1,2,3,4,5],n),label || ' R2 others retain relative order');
  return next is(response,jsonb_build_object('operation_id',pg_temp.operation(100),'outcome',case when changed then 'changed' else 'noop' end,
    'personal_revision',case when changed then '3' else '2' end,'collection_item_id',pg_temp.item(n)),label || ' strict response');
  return next is((select personal_revision from public.collections where id='c2500000-0000-0000-0000-000000000001'),case when changed then 3 else 2 end::bigint,label || ' one revision or R4 none');
  return next is((select count(*) from private.collection_order_intents where kind='move'),case when changed then 1 else 0 end::bigint,label || ' one intent or R4 none');
  return next is((select count(*) from private.collection_operation_receipts),1::bigint,label || ' one durable receipt');
  if changed then
    return next is((select anchor_item_id from private.collection_order_intents where kind='move'),pg_temp.item(normalized),label || ' normalized anchor');
    return next is((select destination from private.collection_order_intents where kind='move'),case when normalized is null then 'end' else 'before' end,label || ' normalized destination');
    select coalesce(array_agg(pg_temp.item(f) order by ord),'{}'::uuid[]) into suffix from unnest(fallback) with ordinality u(f,ord);
    return next is((select fallback_item_ids from private.collection_order_intents where kind='move'),suffix,label || ' exact R1 suffix');
  end if;
  return next is(pg_temp.move(n,placement,anchor),response,label || ' identical retry');
  return next is((select count(*) from private.collection_order_intents where kind='move'),case when changed then 1 else 0 end::bigint,label || ' retry has no double intent');
end;
$$;
select pg_temp.check_move(n,p,a,expected,normalized,fallback) from (values
  (5,'start',null::integer,array[5,1,2,3,4],1,array[2,3,4]),
  (1,'end',null,array[2,3,4,5,1],null,'{}'::integer[]),
  (4,'before',2,array[1,4,2,3,5],2,array[3,5]),
  (1,'after',3,array[2,3,1,4,5],4,array[5]),
  (3,'after',2,array[1,2,3,4,5],4,array[5]),
  (1,'after',5,array[2,3,4,5,1],null,'{}'),
  (5,'end',null,array[1,2,3,4,5],null,'{}'),
  (1,'start',null,array[1,2,3,4,5],2,array[3,4,5]),
  (2,'before',3,array[1,2,3,4,5],3,array[4,5]),
  (3,'before',1,array[3,1,2,4,5],1,array[2,4,5]),
  (4,'after',1,array[1,4,2,3,5],2,array[3,5]),
  (2,'start',null,array[2,1,3,4,5],1,array[3,4,5])) v(n,p,a,expected,normalized,fallback);

-- Full chronological context changes with the gesture epoch, never recomputed.
select pg_temp.reset_fixture();
insert into result_store values ('epoch1',pg_temp.move(5,'start',null,2,101));
insert into result_store values ('epoch2',pg_temp.move(3,'before',2,3,102));
insert into result_store values ('epoch3',pg_temp.move(5,'end',null,4,103));
select is(pg_temp.fixture_order(),array[1,3,2,4,5],'Repeated subject moves retain other gesture');
select is((select fallback_item_ids from private.collection_order_intents where operation_id=pg_temp.operation(101)),array[pg_temp.item(2),pg_temp.item(3),pg_temp.item(4)],'Old context unchanged after later moves');
select is((select fallback_item_ids from private.collection_order_intents where operation_id=pg_temp.operation(102)),array[pg_temp.item(4)],'R1 uses personalized pre-gesture order, not canonical ranks');
select results_eq($$select sequence,subject_item_id from private.collection_order_intents where kind='move' order by sequence$$,
  $$values (3::bigint,pg_temp.item(5)),(4::bigint,pg_temp.item(3)),(5::bigint,pg_temp.item(5))$$,'Chronology complete, same subject retained twice');
select is(array(
  select (v->>'collection_item_id')::uuid from jsonb_array_elements(private.merge_collection_relative_order(
    'c2500000-0000-0000-0000-000000000001',
    array[row(-95001,1),row(-95003,2),row(-95005,3)]::private.collection_order_canonical_entry[],
    array(select row(collection_id,id,variant_id,origin,automatic_rank,introduced_revision,false)::private.collection_order_item_entry
      from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001'),
    array(select i from private.collection_order_intents i where collection_id='c2500000-0000-0000-0000-000000000001' order by sequence)
  )->'final_order') v), array[pg_temp.item(1),pg_temp.item(3),pg_temp.item(2),pg_temp.item(4),pg_temp.item(5)],
  'Journal from real writer replays coherently through unchanged 8B.2 engine');
create temp table accepted_state as select pg_temp.fixture_order() ids,
  (select jsonb_agg(to_jsonb(i) order by sequence) from private.collection_order_intents i where collection_id='c2500000-0000-0000-0000-000000000001') intents,
  (select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r) receipts;
select is(pg_temp.move(5,'start',null,2,101),(select result from result_store where label='epoch1'),'Lost response retried after other mutations returns historical result');
select is(pg_temp.fixture_order(),(select ids from accepted_state),'Historical retry never rewrites current order');
select throws_ok($$select pg_temp.move(5,'start',null,3,101)$$,'23505','operation_id_conflict','Expected revision included in fingerprint');
select throws_ok($$select pg_temp.move(4,'start',null,2,101)$$,'23505','operation_id_conflict','Subject included in fingerprint');
select throws_ok($$select pg_temp.move(5,'end',null,2,101)$$,'23505','operation_id_conflict','Placement included in fingerprint');
select throws_ok($$select pg_temp.move(3,'before',4,3,102)$$,'23505','operation_id_conflict','Anchor included in fingerprint');
select throws_ok($$select pg_temp.move(4,'start',null,2,104)$$,'40001','collection_structure_conflict','New stale operation refused');
select is((select jsonb_agg(to_jsonb(i) order by sequence) from private.collection_order_intents i where collection_id='c2500000-0000-0000-0000-000000000001'),(select intents from accepted_state),'Retries/conflicts preserve exact journal');
select is((select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r),(select receipts from accepted_state),'Retries/conflicts preserve exact receipts including timestamps');
select throws_ok($$update private.collection_order_intents set fallback_item_ids='{}' where operation_id=pg_temp.operation(101)$$,'23514','collection_order_intent_immutable','Accepted context immutable');

-- Parameter failures never record success. Native casts also reject overflow.
select pg_temp.reset_fixture();
select throws_ok(format('select public.reorder_collection_item_v2(%L,%s,%s,%s,%s,%s)',
  'c2500000-0000-0000-0000-000000000001',subject,placement,anchor,revision,operation),code,message,label)
from (values
  ('null',quote_literal('start'),'null','2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','NULL subject'),
  (quote_literal(pg_temp.item(1)),'null','null','2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','NULL placement'),
  (quote_literal(pg_temp.item(1)),quote_literal('START'),'null','2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','Unknown placement'),
  (quote_literal(pg_temp.item(1)),quote_literal('start'),quote_literal(pg_temp.item(2)),'2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','Start forbids anchor'),
  (quote_literal(pg_temp.item(1)),quote_literal('before'),'null','2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','Before requires anchor'),
  (quote_literal(pg_temp.item(1)),quote_literal('after'),quote_literal(pg_temp.item(1)),'2',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','Self anchor'),
  (quote_literal(pg_temp.item(1)),quote_literal('end'),'null','null',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','NULL revision'),
  (quote_literal(pg_temp.item(1)),quote_literal('end'),'null','-1',quote_literal(pg_temp.operation(105)),'22023','collection_operation_invalid','Negative revision'),
  (quote_literal(pg_temp.item(1)),quote_literal('end'),'null','2','null','22023','collection_operation_invalid','NULL operation'),
  (quote_literal(pg_temp.item(99)),quote_literal('start'),'null','2',quote_literal(pg_temp.operation(105)),'P0002','collection_item_unavailable','Absent subject'),
  (quote_literal(pg_temp.item(6)),quote_literal('start'),'null','2',quote_literal(pg_temp.operation(105)),'P0002','collection_item_unavailable','Foreign subject'),
  (quote_literal(pg_temp.item(1)),quote_literal('before'),quote_literal(pg_temp.item(99)),'2',quote_literal(pg_temp.operation(105)),'P0002','collection_item_unavailable','Absent anchor'),
  (quote_literal(pg_temp.item(1)),quote_literal('after'),quote_literal(pg_temp.item(6)),'2',quote_literal(pg_temp.operation(105)),'P0002','collection_item_unavailable','Foreign anchor')) v(subject,placement,anchor,revision,operation,code,message,label);
select is((select count(*) from private.collection_operation_receipts),0::bigint,'Invalid operations leave no receipt');
select is(pg_temp.fixture_order(),array[1,2,3,4,5],'Invalid operations leave full order unchanged');

-- R4 ties are not a gesture or a reason to rewrite positions. Precision/edge
-- repair on a genuine move preserves the requested permutation and one revision.
update public.collection_items set sort_position=1 where collection_id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.move(3,'after',2)->>'outcome','noop','Tied-order satisfied after is R4 noop');
select is((select count(distinct sort_position) from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001'),1::bigint,'Noop performs no numerical repair');
select is((select count(*) from private.collection_order_intents where kind='move'),0::bigint,'Tied noop creates no intent');
select is(pg_temp.move(3,'after',2), (select result from private.collection_operation_receipts where operation_id=pg_temp.operation(100)),'Noop receipt retry persistent');
insert into result_store values ('noop',pg_temp.move(3,'after',2));
select is(pg_temp.move(5,'start',null,2,110)->>'personal_revision','3','Genuine move repairs ties with one revision');
select is(pg_temp.fixture_order(),array[5,1,2,3,4],'Tie repair preserves R2 permutation');
select is(pg_temp.move(3,'after',2),(select result from result_store where label='noop'),'Noop retry after another mutation returns old revision, no write');
select is((select count(*) from private.collection_order_intents where kind='move'),1::bigint,'Noop retry never gains intent after numeric repair');
select pg_temp.reset_fixture();
update public.collection_items set sort_position=1.00000000000000000001 where id=pg_temp.item(2);
select is(pg_temp.move(5,'before',2)->>'outcome','changed','Precision exhaustion changes permutation');
select is(pg_temp.fixture_order(),array[1,5,2,3,4],'Rebalance exact order');
select results_eq($$select sort_position from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001' order by sort_position,id$$,array[1,2,3,4,5]::numeric[],'Rebalance exact positions');
select is((select personal_revision from public.collections where id='c2500000-0000-0000-0000-000000000001'),3::bigint,'Rebalance is one gesture only');
select pg_temp.reset_fixture();
update public.collection_items set sort_position=-99999999999999999999.99999999999999999999 where id=pg_temp.item(1);
select lives_ok($$select pg_temp.move(5,'start')$$,'Negative NUMERIC boundary safely rebalances');
select is(pg_temp.fixture_order(),array[5,1,2,3,4],'Negative boundary permutation');
select pg_temp.reset_fixture();
update public.collection_items set sort_position=99999999999999999999.99999999999999999999 where id=pg_temp.item(5);
select lives_ok($$select pg_temp.move(1,'end')$$,'Positive NUMERIC boundary safely rebalances');
select is(pg_temp.fixture_order(),array[2,3,4,5,1],'Positive boundary permutation');
select pg_temp.reset_fixture();
update public.collections set personal_revision=9007199254740993 where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.move(5,'start',null,9007199254740993)->>'personal_revision','9007199254740994','Revision beyond JS safe integer remains exact decimal string');
select pg_temp.reset_fixture();
update public.collections set personal_revision=9223372036854775807 where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.move(1,'start',null,9223372036854775807)->>'personal_revision','9223372036854775807','BIGINT max noop stays exact without increment');
select throws_ok($$select pg_temp.move(5,'start',null,9223372036854775807,106)$$,'XX000','phase8_operation_unexpected','Revision overflow rolls back safely');
select is(pg_temp.fixture_order(),array[1,2,3,4,5],'Overflow rolls back order mutation');

-- Inject failure at final receipt insertion, after position/revision/intent.
select pg_temp.reset_fixture();
create function pg_temp.fail_receipt() returns trigger language plpgsql as $$
begin
  if new.collection_id='c2500000-0000-0000-0000-000000000001' then raise exception 'test injected failure'; end if;
  return new;
end;
$$;
create trigger test_fail_receipt before insert on private.collection_operation_receipts for each row execute function pg_temp.fail_receipt();
select throws_ok($$select pg_temp.move(5,'start')$$,'XX000','phase8_operation_unexpected','Internal injected error sanitized');
select is(pg_temp.fixture_order(),array[1,2,3,4,5],'Injected failure restores full order');
select is((select personal_revision from public.collections where id='c2500000-0000-0000-0000-000000000001'),2::bigint,'Injected failure restores revision');
select is((select count(*) from private.collection_order_intents where kind='move'),0::bigint,'Injected failure leaves no intent');
select is((select count(*) from private.collection_operation_receipts),0::bigint,'Injected failure leaves no success receipt');
drop trigger test_fail_receipt on private.collection_operation_receipts;

-- Receipt authorization checked NOW, not the owner when acceptance occurred.
insert into result_store values ('secured',pg_temp.move(5,'start'));
set local role authenticated;
select throws_ok('select * from private.collection_order_intents','42501',null,'Owner cannot read journal directly');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Owner cannot read receipts directly');
select throws_ok($$update public.collections set personal_revision=10 where id='c2500000-0000-0000-0000-000000000001'$$,'42501',null,'Owner cannot write revision directly');
select throws_ok($$update public.collection_items set sort_position=10 where id=pg_temp.item(1)$$,'42501',null,'Owner cannot write positions directly');
reset role;
create function pg_temp.denied(id text, aal text, label text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal',aal)::text,true);
  return next throws_ok($q$select pg_temp.move(5,'start')$q$,'42501','collection_action_unavailable',label);
  return next throws_ok($q$select pg_temp.move(2,'start',null,3,200)$q$,'42501','collection_action_unavailable',label || ' new operation also refused');
end;
$$;
grant execute on function pg_temp.denied(text,text,text) to authenticated;
set local role authenticated;
select pg_temp.denied(id,aal,label)
from (values
  ('a2500000-0000-0000-0000-000000000001','aal1','AAL1 cannot obtain historical receipt'),
  ('a2500000-0000-0000-0000-000000000002','aal2','Shared recipient cannot obtain receipt'),
  ('a2500000-0000-0000-0000-000000000003','aal2','Third party cannot obtain receipt'),
  ('a2500000-0000-0000-0000-000000000004','aal2','Real Auth user without profile refused'),
  (null,'aal2','No session refused even under authenticated role')) v(id,aal,label);
set local role anon;
select throws_ok($$select pg_temp.move(5,'start')$$,'42501',null,'Anonymous execute refused');
set local role service_role;
select throws_ok($$select pg_temp.move(5,'start')$$,'42501',null,'Service role execute refused');
reset role;
update public.collections set owner_id='a2500000-0000-0000-0000-000000000003' where id='c2500000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok($$select pg_temp.move(5,'start')$$,'42501','collection_action_unavailable','Former owner cannot recover receipt');
reset role;
update public.collections set owner_id='a2500000-0000-0000-0000-000000000001' where id='c2500000-0000-0000-0000-000000000001';
set local role authenticated;
select is(pg_temp.move(5,'start'),(select result from result_store where label='secured'),'Current owner resolves uncertain response with same call');
select throws_ok($$select public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000099',pg_temp.item(5),'start',null,2,pg_temp.operation(100))$$,'42501','collection_action_unavailable','Missing parent indistinguishable from inaccessible');
select is(public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000002',pg_temp.item(6),'start',null,1,pg_temp.operation(100))->>'outcome','noop','Single item start normalizes to end noop; operation UUID scoped per parent');
reset role;
select is((select count(*) from private.collection_operation_receipts where operation_id=pg_temp.operation(100)),2::bigint,'Same operation UUID in independent collections');

select results_eq($$select id,to_jsonb(i)-'sort_position'-'updated_at' from public.collection_items i where collection_id::text like 'c250%' order by id$$,
  $$select id,to_jsonb(s)-'sort_position'-'updated_at' from seed_items s order by id$$,'Origin/rank/introduction/identities untouched');
select results_eq($$select id,to_jsonb(c)-'personal_revision'-'updated_at' from public.collections c where id::text like 'c250%' order by id$$,
  $$select id,to_jsonb(s)-'personal_revision'-'updated_at' from seed_parents s order by id$$,'Parents canonical versions/types/contracts untouched');
select results_eq($$select to_jsonb(p) from public.physical_copies p order by id$$,$$select data from copies order by data->>'id'$$,'All real copies/notes preserved');
select results_eq($$select to_jsonb(t) from public.automatic_target_states t order by id$$,$$select data from targets order by (data->>'id')::bigint$$,'Canonical states preserved');

-- Historical receipts survive subject/anchor removal; new gestures still require
-- living same-parent identities. Parent deletion always revokes access.
delete from public.collection_items where id=pg_temp.item(5);
select is(pg_temp.move(5,'start'),(select result from result_store where label='secured'),'Accepted retry survives absent subject without recreating it');
select is((select count(*) from public.collection_items where id=pg_temp.item(5)),0::bigint,'Receipt never resurrects deleted subject');
insert into result_store values ('anchor_removed',pg_temp.move(3,'before',2,3,211));
delete from public.collection_items where id=pg_temp.item(2);
select is(pg_temp.move(3,'before',2,3,211),(select result from result_store where label='anchor_removed'),'Accepted retry does not recalculate missing anchor');
delete from public.collections where id='c2500000-0000-0000-0000-000000000001';
select throws_ok($$select pg_temp.move(3,'before',2,3,211)$$,'42501','collection_action_unavailable','Deleted parent cannot recover a receipt');
select * from finish();
rollback;
