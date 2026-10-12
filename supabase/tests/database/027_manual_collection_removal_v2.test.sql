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
create function pg_temp.remove_item(n integer default 2, revision bigint default 2,
  operation integer default 300, parent integer default 1) returns jsonb language sql as $$
  select public.remove_manual_collection_item_v2(pg_temp.parent(parent),pg_temp.item(n),revision,pg_temp.operation(operation));
$$;
create function pg_temp.state(parent integer default 1) returns jsonb language sql as $$
  select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=pg_temp.parent(parent)),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=pg_temp.parent(parent)),
    'intents',(select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=pg_temp.parent(parent)),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=pg_temp.parent(parent)));
$$;
create function pg_temp.replay(parent integer default 1, canonical bigint[] default array[-95001,-95003,-95005]::bigint[]) returns jsonb language sql as $$
  select private.merge_collection_relative_order(pg_temp.parent(parent),
    array(select row(v,r)::private.collection_order_canonical_entry from unnest(canonical) with ordinality c(v,r)),
    array(select row(collection_id,id,variant_id,origin,automatic_rank,introduced_revision,false)::private.collection_order_item_entry
      from public.collection_items where collection_id=pg_temp.parent(parent) order by id),
    array(select e from private.collection_order_intents e where collection_id=pg_temp.parent(parent) order by sequence));
$$;
grant execute on function pg_temp.parent(integer),pg_temp.item(integer),pg_temp.operation(integer),
  pg_temp.remove_item(integer,bigint,integer,integer) to authenticated,anon,service_role;
create temp table results(label text primary key,result jsonb);
grant select,insert on results to authenticated;
insert into public.physical_copies(user_id,variant_id,note) values
  ('a2500000-0000-0000-0000-000000000001',-95002,'Note conservée après retrait'),
  ('a2500000-0000-0000-0000-000000000001',-95007,'Accessible après réintroduction');
create temp table copies as select to_jsonb(c) data from public.physical_copies c;
create temp table other_parents as select to_jsonb(c) data from public.collections c where id<>pg_temp.parent();

select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""'] and pronargdefaults=0
  and prorettype='jsonb'::regtype,'Removal v2 volatile definer, empty path, JSONB, no default')
  from pg_proc where oid='public.remove_manual_collection_item_v2(uuid,uuid,bigint,uuid)'::regprocedure;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='remove_manual_collection_item_v2'),1::bigint,'No overload');
select ok(has_function_privilege('authenticated','public.remove_manual_collection_item_v2(uuid,uuid,bigint,uuid)','EXECUTE'),'Authenticated EXECUTE');
select ok(not has_function_privilege(r,'public.remove_manual_collection_item_v2(uuid,uuid,bigint,uuid)','EXECUTE'),r || ' EXECUTE closed')
  from unnest(array['anon','service_role']) r;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.remove_manual_collection_item_v2(uuid,uuid,bigint,uuid)'::regprocedure and a.grantee=0),'PUBLIC EXECUTE closed');
select ok(tgdeferrable and tginitdeferred,tgname || ' remains deferred') from pg_trigger
  where tgname in ('collection_items_initial_placement','collection_intents_initial_placement','collections_initial_placement');
select ok(not has_table_privilege(r,t,p),r || ' direct ' || p || ' closed: ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
  unnest(array['private.collection_order_intents','private.collection_operation_receipts']) t cross join
  unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select ok(not has_column_privilege('authenticated',t,c,'UPDATE'),t || '.' || c || ' direct UPDATE closed')
  from (values ('public.collections','personal_revision'),('public.collections','order_contract_version'),
    ('public.collection_items','sort_position'),('public.collection_items','introduced_revision')) v(t,c);

set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
-- Each case snapshots AFTER its preparatory moves: removal must preserve every
-- other item's full row, including timestamps and exact NUMERIC positions.
create function pg_temp.check_removal(n integer, revision bigint, parent integer, label text) returns setof text language plpgsql as $$
declare before_items jsonb; before_intents jsonb; before_order uuid[]; result jsonb;
begin
  select jsonb_agg(to_jsonb(i) order by id),array_agg(id order by sort_position,id) into before_items,before_order
    from public.collection_items i where collection_id=pg_temp.parent(parent) and id<>pg_temp.item(n);
  select jsonb_agg(to_jsonb(e) order by sequence) into before_intents from private.collection_order_intents e
    where collection_id=pg_temp.parent(parent) and subject_item_id<>pg_temp.item(n);
  result := pg_temp.remove_item(n,revision,300,parent);
  return next is(result,jsonb_build_object('operation_id',pg_temp.operation(300),'outcome','changed',
    'personal_revision',(revision+1)::text,'collection_item_id',pg_temp.item(n)),label || ' strict result');
  return next is((select jsonb_agg(to_jsonb(i) order by id) from public.collection_items i where collection_id=pg_temp.parent(parent)),before_items,label || ' other rows unchanged');
  return next is((select array_agg(id order by sort_position,id) from public.collection_items where collection_id=pg_temp.parent(parent)),before_order,label || ' relative order unchanged');
  return next is((select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=pg_temp.parent(parent)),before_intents,label || ' other intents unchanged');
  return next is((select count(*) from public.collection_items where id=pg_temp.item(n)),0::bigint,label || ' subject absent');
  return next is((select count(*) from private.collection_order_intents where subject_item_id=pg_temp.item(n)),0::bigint,label || ' own initial and moves absent');
  return next is((select personal_revision from public.collections where id=pg_temp.parent(parent)),revision+1,label || ' one increment');
  return next is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent(parent) and kind='remove'),1::bigint,label || ' one remove receipt');
  return next lives_ok('set constraints all immediate',label || ' deferred invariant valid');
  set constraints all deferred;
end;
$$;
savepoint middle;
select pg_temp.check_removal(2,2,1,'Automatic parent intermediate');
rollback to middle;
set constraints all deferred;
savepoint first;
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(2),'start',null,2,pg_temp.operation(301));
select pg_temp.check_removal(2,3,1,'Automatic parent first');
rollback to first;
set constraints all deferred;
savepoint last;
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(4),'end',null,2,pg_temp.operation(301));
select pg_temp.check_removal(4,3,1,'Automatic parent last');
rollback to last;
set constraints all deferred;
savepoint unique_item;
select pg_temp.check_removal(6,1,2,'Free parent singleton');
select is(pg_temp.replay(2,'{}')->'final_order','[]'::jsonb,'Empty free collection replays');
rollback to unique_item;
set constraints all deferred;
savepoint tied_positions;
update public.collection_items set sort_position=0.00000000000000000001 where collection_id=pg_temp.parent();
select pg_temp.check_removal(2,2,1,'Tied tiny positions without compaction');
rollback to tied_positions;
set constraints all deferred;

-- Accepted authenticated removal and historical retry before/after another move.
create temp table remaining as select to_jsonb(i) data from public.collection_items i where collection_id=pg_temp.parent() and id<>pg_temp.item(2);
set local role authenticated;
insert into results values ('remove',pg_temp.remove_item());
select is(pg_temp.remove_item(),(select result from results where label='remove'),'Immediate identical retry returns historical result');
select is((select note from public.physical_copies where user_id=auth.uid() and variant_id=-95002),
  'Note conservée après retrait','Owner still accesses physical copy and note after removal');
reset role;
select results_eq($$select to_jsonb(i) from public.collection_items i where collection_id=pg_temp.parent() order by id$$,
  $$select data from remaining order by data->>'id'$$,'Authenticated removal preserves other items exactly');
select ok(kind='remove' and accepted_revision=3 and result=(select result from results where label='remove')
  and request_hash=encode(sha256(convert_to(jsonb_build_array('remove_manual_collection_item_v2',pg_temp.parent(),pg_temp.item(2),'2')::text,'UTF8')),'hex'),
  'Receipt canonical fingerprint, kind, identity and accepted revision') from private.collection_operation_receipts where operation_id=pg_temp.operation(300);
select is(jsonb_typeof(result->'personal_revision'),'string','Exact BIGINT JSON string') from results where label='remove';
select is((select array_agg(k order by k) from results,jsonb_object_keys(result) k where label='remove'),
  array['collection_item_id','operation_id','outcome','personal_revision'],'Exactly four fields');
set local role authenticated;
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(5),'start',null,3,pg_temp.operation(302));
reset role;
create temp table unchanged as select pg_temp.state() data;
set local role authenticated;
select is(pg_temp.remove_item(),(select result from results where label='remove'),'Retry after other mutation keeps accepted revision');
select throws_ok(sql,code,message,label) from (values
  ($$select pg_temp.remove_item(4,2)$$,'23505','operation_id_conflict','Same UUID different subject'),
  ($$select pg_temp.remove_item(2,3)$$,'23505','operation_id_conflict','Same UUID different revision'),
  ($$select pg_temp.remove_item(4,3,303)$$,'40001','collection_structure_conflict','Stale new operation'),
  ($$select pg_temp.remove_item(2,4,303)$$,'P0002','collection_item_unavailable','Already removed new UUID'),
  ($$select pg_temp.remove_item(99,4,303)$$,'P0002','collection_item_unavailable','Absent subject'),
  ($$select pg_temp.remove_item(6,4,303)$$,'P0002','collection_item_unavailable','Subject from another collection'),
  ($$select pg_temp.remove_item(1,4,303)$$,'23514','automatic_item_removal_forbidden','Automatic subject'),
  ($$select pg_temp.remove_item(4,0,303,3)$$,'23514','order_contract_upgrade_required','Legacy parent'),
  ($$select pg_temp.remove_item(null,4,303)$$,'22023','collection_operation_invalid','NULL subject'),
  ($$select pg_temp.remove_item(4,null,303)$$,'22023','collection_operation_invalid','NULL revision'),
  ($$select pg_temp.remove_item(4,-1,303)$$,'22023','collection_operation_invalid','Negative revision'),
  ($$select pg_temp.remove_item(4,4,null)$$,'22023','collection_operation_invalid','NULL operation'),
  ($$select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(4),'start',null,2,pg_temp.operation(300))$$,'23505','operation_id_conflict','Remove UUID collides with move'),
  ($$select public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'end',2,pg_temp.operation(300))$$,'23505','operation_id_conflict','Remove UUID collides with add'),
  ($$select pg_temp.remove_item(4,3,302)$$,'23505','operation_id_conflict','Move UUID collides with remove')) v(sql,code,message,label);
reset role;
select is(pg_temp.state(),(select data from unchanged),'All retries and refusals preserve complete state');
savepoint add_collision;
select public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'end',4,pg_temp.operation(304));
select throws_ok($$select pg_temp.remove_item(4,4,304)$$,'23505','operation_id_conflict','Add UUID collides with remove');
rollback to add_collision;
set constraints all deferred;

-- R1: persisted free-parent chronology, no reimplementation of replay rules.
savepoint historical;
insert into results values ('a',public.add_manual_collection_item_v2(pg_temp.parent(4),-95007,'end',0,pg_temp.operation(310)));
insert into results values ('b',public.add_manual_collection_item_v2(pg_temp.parent(4),-95008,'end',1,pg_temp.operation(311)));
insert into results values ('c',public.add_manual_collection_item_v2(pg_temp.parent(4),-95009,'end',2,pg_temp.operation(312)));
insert into results values ('d',public.add_manual_collection_item_v2(pg_temp.parent(4),-95010,'end',3,pg_temp.operation(313)));
insert into results values ('s',public.add_manual_collection_item_v2(pg_temp.parent(4),-95016,'end',4,pg_temp.operation(314)));
select public.reorder_collection_item_v2(pg_temp.parent(4),(select (result->>'collection_item_id')::uuid from results where label='s'),
  'before',(select (result->>'collection_item_id')::uuid from results where label='a'),5,pg_temp.operation(315));
create temp table historical_intent as select to_jsonb(e) data from private.collection_order_intents e where operation_id=pg_temp.operation(315);
select public.remove_manual_collection_item_v2(pg_temp.parent(4),(select (result->>'collection_item_id')::uuid from results where label='a'),6,pg_temp.operation(316));
select is((select x->>'resolved_anchor_item_id' from jsonb_array_elements(pg_temp.replay(4,'{}')->'replay') x where x->>'sequence'='6'),
  (select result->>'collection_item_id' from results where label='b'),'Removed anchor falls back to first historical successor');
select public.remove_manual_collection_item_v2(pg_temp.parent(4),(select (result->>'collection_item_id')::uuid from results where label='b'),7,pg_temp.operation(317));
select is((select to_jsonb(e) from private.collection_order_intents e where operation_id=pg_temp.operation(315)),(select data from historical_intent),
  'Removed anchor and historical successor leave entire immutable R1 row intact');
select is((select x->>'resolved_anchor_item_id' from jsonb_array_elements(pg_temp.replay(4,'{}')->'replay') x where x->>'sequence'='6'),
  (select result->>'collection_item_id' from results where label='c'),'Engine skips removed successor and resolves first still living');
select is(array(select (x->>'variant_id')::bigint from jsonb_array_elements(pg_temp.replay(4,'{}')->'final_order') x),
  array[-95016,-95009,-95010]::bigint[],'Real engine full permutation after anchor/successor removal');
select public.remove_manual_collection_item_v2(pg_temp.parent(4),(select (result->>'collection_item_id')::uuid from results where label='c'),8,pg_temp.operation(318));
select public.remove_manual_collection_item_v2(pg_temp.parent(4),(select (result->>'collection_item_id')::uuid from results where label='d'),9,pg_temp.operation(319));
select is((select x->>'resolution' from jsonb_array_elements(pg_temp.replay(4,'{}')->'replay') x where x->>'sequence'='6'),'fallback_end','No living historical successor resolves end');
select is(array(select (x->>'variant_id')::bigint from jsonb_array_elements(pg_temp.replay(4,'{}')->'final_order') x),
  array[-95016]::bigint[],'Fallback end replays complete remaining singleton');
select is((select to_jsonb(e) from private.collection_order_intents e where operation_id=pg_temp.operation(315)),(select data from historical_intent),'Entire disappeared suffix still immutable');
select is((select count(*) from private.collection_order_intents where collection_id=pg_temp.parent(4)),2::bigint,'Only living subject initial and move remain');
select is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent(4)),10::bigint,'All accepted add/move/remove receipts retained');
select lives_ok('set constraints all immediate','Historical absent references satisfy deferred invariants');
rollback to historical;
set constraints all deferred;

-- R3: add, repeated moves, another subject referencing old UUID, remove, re-add.
savepoint lifecycle;
insert into results values ('old',public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'start',4,pg_temp.operation(320)));
select public.reorder_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='old'),'end',null,5,pg_temp.operation(321));
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(1),'before',(select (result->>'collection_item_id')::uuid from results where label='old'),6,pg_temp.operation(322));
select public.reorder_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='old'),'start',null,7,pg_temp.operation(323));
create temp table own_before as select * from private.collection_order_intents where subject_item_id=(select (result->>'collection_item_id')::uuid from results where label='old');
create temp table refs_before as select to_jsonb(e) data from private.collection_order_intents e where collection_id=pg_temp.parent()
  and subject_item_id<>(select (result->>'collection_item_id')::uuid from results where label='old');
create temp table receipts_before as select to_jsonb(r) data from private.collection_operation_receipts r where collection_id=pg_temp.parent();
set local role authenticated;
insert into results values ('old-remove',public.remove_manual_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='old'),8,pg_temp.operation(324)));
insert into results values ('new',public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'end',9,pg_temp.operation(325)));
select is(public.remove_manual_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='old'),8,pg_temp.operation(324)),
  (select result from results where label='old-remove'),'Remove retry after same variant reintroduction returns old identity');
select is(public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'start',4,pg_temp.operation(320)),
  (select result from results where label='old'),'Previous add receipt survives removal/reintroduction');
select is(public.reorder_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='old'),'end',null,5,pg_temp.operation(321))->>'personal_revision',
  '6','Previous move receipt survives removal');
select is((select note from public.physical_copies where user_id=auth.uid() and variant_id=-95007),
  'Accessible après réintroduction','Owner accesses existing physical copy and note after reintroduction');
reset role;
select is((select count(*) from own_before),3::bigint,'Old subject had initial and two chronological moves');
select is((select count(*) from private.collection_order_intents where subject_item_id=(select (result->>'collection_item_id')::uuid from results where label='old')),0::bigint,'All own intents really deleted');
select isnt((select result->>'collection_item_id' from results where label='old'),(select result->>'collection_item_id' from results where label='new'),'Reintroduced exact variant has new UUID');
select is((select count(*) from private.collection_order_intents where subject_item_id=(select (result->>'collection_item_id')::uuid from results where label='new')),1::bigint,'New UUID has only new initial intent');
select results_eq($$select to_jsonb(e) from private.collection_order_intents e where collection_id=pg_temp.parent() and subject_item_id<>(select (result->>'collection_item_id')::uuid from results where label='new') order by sequence$$,
  $$select data from refs_before order by (data->>'sequence')::bigint$$,'Other subjects retain original immutable contexts');
select results_eq($$select to_jsonb(r) from private.collection_operation_receipts r where collection_id=pg_temp.parent() and operation_id not in (pg_temp.operation(324),pg_temp.operation(325)) order by operation_id$$,
  $$select data from receipts_before order by data->>'operation_id'$$,'Previous receipts retained exactly');
select is((select anchor_item_id::text from private.collection_order_intents where operation_id=pg_temp.operation(322)),
  (select result->>'collection_item_id' from results where label='old'),'Other subject still references old UUID');
select is((select x->>'resolution' from jsonb_array_elements(pg_temp.replay()->'replay') x where x->>'sequence'='7'),'fallback_end','Old UUID anchor never binds new same-variant UUID');
select is(array(select (x->>'variant_id')::bigint from jsonb_array_elements(pg_temp.replay()->'final_order') x),
  array(select variant_id from public.collection_items where collection_id=pg_temp.parent() order by sort_position,id),'Only living subjects new intentions reproduce materialized order');
select is((select personal_revision from public.collections where id=pg_temp.parent()),10::bigint,'Retries after reintroduction do not increment');
select lives_ok('set constraints all immediate','Whole R3 cycle satisfies deferred invariant');
rollback to lifecycle;
set constraints all deferred;

-- Failure AFTER real cascade/revision, BEFORE receipt, with nontransactional
-- witness to prove stage reached, then compare entire restored state.
create sequence pg_temp.injection_seen;
create function pg_temp.fail_remove_receipt() returns trigger language plpgsql as $$
begin
  if new.operation_id=pg_temp.operation(330) and new.kind='remove'
    and not exists(select 1 from public.collection_items where id=pg_temp.item(4))
    and not exists(select 1 from private.collection_order_intents where subject_item_id=pg_temp.item(4))
    and (select personal_revision from public.collections where id=pg_temp.parent())=5 then
    perform nextval('pg_temp.injection_seen'); raise exception 'private injected failure';
  end if;
  return new;
end;
$$;
create trigger test_fail_remove_receipt before insert on private.collection_operation_receipts for each row execute function pg_temp.fail_remove_receipt();
select throws_ok($$select pg_temp.remove_item(4,4,330)$$,'XX000','phase8_operation_unexpected','Injected failure sanitized');
select ok((select is_called and last_value=1 from pg_temp.injection_seen),'Observed cascade and increment before receipt');
select is(pg_temp.state(),(select data from unchanged),'Full item/intents/revision/receipts rollback');
drop trigger test_fail_remove_receipt on private.collection_operation_receipts;
savepoint rolled_back_retry;
select is(pg_temp.remove_item(4,4,330)->>'outcome','changed','Failed UUID accepted on retry after rollback');
rollback to rolled_back_retry;
set constraints all deferred;

savepoint bigint_limits;
update public.collections set personal_revision=9007199254740993 where id=pg_temp.parent();
select is(pg_temp.remove_item(4,9007199254740993,331)->>'personal_revision','9007199254740994','Revision beyond JS precision exact');
rollback to bigint_limits;
set constraints all deferred;
savepoint bigint_overflow;
update public.collections set personal_revision=9223372036854775807 where id=pg_temp.parent();
create temp table max_before as select pg_temp.state() data;
select throws_ok($$select pg_temp.remove_item(4,9223372036854775807,331)$$,'XX000','phase8_operation_unexpected','BIGINT overflow sanitized');
select is(pg_temp.state(),(select data from max_before),'Overflow after deletion fully restores item and intents');
rollback to bigint_overflow;
set constraints all deferred;

savepoint conversion;
update public.collection_items set origin='automatic',automatic_rank=4 where id=pg_temp.item(4);
select lives_ok('set constraints all immediate','Conversion retains initial invariant');
select throws_ok($$select pg_temp.remove_item(4,4,332)$$,'23514','automatic_item_removal_forbidden','Converted manual cannot be removed');
select is((select introduced_revision from public.collection_items where id=pg_temp.item(4)),2::bigint,'Converted introduction retained');
select throws_ok($$update public.collection_items set introduced_revision=null where id=pg_temp.item(4)$$,'23514','collection_item_introduction_immutable','Converted introduction still protected');
rollback to conversion;
set constraints all deferred;
create function pg_temp.delete_initial() returns void language plpgsql as $$
begin
  delete from private.collection_order_intents where subject_item_id=pg_temp.item(4) and kind='manual_add';
  set constraints all immediate;
end;
$$;
select throws_ok('select pg_temp.delete_initial()','23514','collection_initial_placement_invalid','Living subject cannot lose initial intent');
select is(pg_temp.state(),(select data from unchanged),'Failed deferred invariant restores initial intent');

create function pg_temp.denied(id text,aal text,label text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal',aal)::text,true);
  return next throws_ok('select pg_temp.remove_item()','42501','collection_action_unavailable',label || ' historical retry denied');
  return next throws_ok('select pg_temp.remove_item(4,4,340)','42501','collection_action_unavailable',label || ' new removal denied');
end;
$$;
grant execute on function pg_temp.denied(text,text,text) to authenticated;
set local role authenticated;
select pg_temp.denied(id,aal,label) from (values
  ('a2500000-0000-0000-0000-000000000001','aal1','Owner no AAL2'),
  ('a2500000-0000-0000-0000-000000000002','aal2','Shared recipient'),
  ('a2500000-0000-0000-0000-000000000003','aal2','Third party'),
  ('a2500000-0000-0000-0000-000000000004','aal2','Auth user missing profile'),
  (null,'aal2','No session')) v(id,aal,label);
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok($$select pg_temp.remove_item(4,0,340,6)$$,'42501','collection_action_unavailable','Inaccessible parent');
select throws_ok($$select pg_temp.remove_item(4,0,340,99)$$,'42501','collection_action_unavailable','Missing parent');
select throws_ok($$select public.remove_manual_collection_item_v2(null,pg_temp.item(4),4,pg_temp.operation(340))$$,'42501','collection_action_unavailable','NULL parent safely unavailable');
select throws_ok(sql,'42501',null,label) from (values
  ('select * from private.collection_order_intents','Direct journal SELECT denied'),
  ('select * from private.collection_operation_receipts','Direct receipt SELECT denied'),
  ('delete from public.collection_items where id=pg_temp.item(4)','Direct item DELETE denied'),
  ('delete from private.collection_order_intents where subject_item_id=pg_temp.item(4)','Direct intention DELETE denied'),
  ('update public.collection_items set sort_position=0 where id=pg_temp.item(4)','Direct position UPDATE denied'),
  ('update public.collections set personal_revision=0 where id=pg_temp.parent()','Direct revision UPDATE denied')) v(sql,label);
reset role;
set local role anon;
select throws_ok('select pg_temp.remove_item()','42501',null,'Anonymous real EXECUTE denied');
reset role;
set local role service_role;
select throws_ok('select pg_temp.remove_item()','42501',null,'Service role real EXECUTE denied');
reset role;
savepoint transfer;
update public.collections set owner_id='a2500000-0000-0000-0000-000000000003' where id=pg_temp.parent();
select throws_ok('select pg_temp.remove_item()','42501','collection_action_unavailable','Former owner cannot fetch historical receipt');
rollback to transfer;
set constraints all deferred;
savepoint parent_delete;
delete from public.collections where id=pg_temp.parent();
select throws_ok('select pg_temp.remove_item()','42501','collection_action_unavailable','Deleted parent cannot return receipt');
select is((select count(*) from private.collection_order_intents where collection_id=pg_temp.parent()),0::bigint,'Parent deletion cascades journal');
select is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent()),0::bigint,'Parent deletion cascades receipts');
select lives_ok('set constraints all immediate','Parent deletion remains valid');
rollback to parent_delete;
set constraints all deferred;

select results_eq($$select to_jsonb(c) from public.physical_copies c order by id$$,$$select data from copies order by data->>'id'$$,'All physical copies and notes unchanged');
select results_eq($$select to_jsonb(c) from public.collections c where id<>pg_temp.parent() order by id$$,$$select data from other_parents order by data->>'id'$$,'Other parents unchanged');
select is(pg_temp.state(),(select data from unchanged),'Security and invariant tests preserve complete accepted state');
select lives_ok('set constraints all immediate','Final rollback fixture coherent');
select * from finish();
rollback;
