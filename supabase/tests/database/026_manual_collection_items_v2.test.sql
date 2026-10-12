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
create function pg_temp.add_item(variant bigint, placement text default 'end', revision bigint default 2,
  operation integer default 100, parent integer default 1) returns jsonb language sql as $$
  select public.add_manual_collection_item_v2(pg_temp.parent(parent),variant,placement,revision,pg_temp.operation(operation));
$$;
create function pg_temp.fixture_state() returns jsonb language sql as $$
  select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=pg_temp.parent()),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=pg_temp.parent()),
    'intents',(select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=pg_temp.parent()),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=pg_temp.parent()));
$$;
create function pg_temp.fixture_order(parent integer default 1) returns bigint[] language sql as $$
  select array_agg(variant_id order by sort_position,id) from public.collection_items where collection_id=pg_temp.parent(parent);
$$;
grant execute on function pg_temp.parent(integer),pg_temp.item(integer),pg_temp.operation(integer),
  pg_temp.add_item(bigint,text,bigint,integer,integer) to authenticated,anon,service_role;
create temp table results(label text primary key,result jsonb);
grant select,insert on results to authenticated;
create temp table seed as select to_jsonb(i) data from public.collection_items i where collection_id=pg_temp.parent();
create temp table unchanged(data jsonb);

select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""'] and pronargdefaults=0,
  'Manual v2 volatile definer, empty path, no default')
  from pg_proc where oid='public.add_manual_collection_item_v2(uuid,bigint,text,bigint,uuid)'::regprocedure;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='add_manual_collection_item_v2'),1::bigint,'No PostgREST overload');
select ok(has_function_privilege('authenticated','public.add_manual_collection_item_v2(uuid,bigint,text,bigint,uuid)','EXECUTE'),'Authenticated EXECUTE');
select ok(not has_function_privilege(r,'public.add_manual_collection_item_v2(uuid,bigint,text,bigint,uuid)','EXECUTE'),r || ' EXECUTE closed')
  from unnest(array['anon','service_role']) r;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.add_manual_collection_item_v2(uuid,bigint,text,bigint,uuid)'::regprocedure and a.grantee=0),'PUBLIC EXECUTE closed');
select ok(tgdeferrable and tginitdeferred, tgname || ' checks transaction final state') from pg_trigger
  where tgname in ('collection_items_initial_placement','collection_intents_initial_placement','collections_initial_placement');
select ok(not has_function_privilege(r,f,'EXECUTE'), r || ' cannot invoke ' || f)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['private.protect_collection_item_introduction()','private.check_collection_initial_placement()']) f;
select ok(not has_table_privilege(r,t,p), r || ' direct ' || p || ' closed: ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['private.collection_order_intents','private.collection_operation_receipts']) t cross join
    unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
insert into results values ('start',pg_temp.add_item(-95007,'start'));
insert into results values ('end',pg_temp.add_item(-95008,'end',3,101));
reset role;
select is(pg_temp.fixture_order(),array[-95007,-95001,-95002,-95003,-95004,-95005,-95008]::bigint[],'Automatic collection accepts manual start and end in full order');
select is((select array_agg(k order by k) from results r,jsonb_object_keys(r.result) k where label='start'),
  array['collection_item_id','operation_id','outcome','personal_revision'],'Exactly four result keys');
select is(result->>'outcome','changed','Add always changed: ' || label) from results;
select is(result->>'personal_revision',case label when 'start' then '3' else '4' end,'Exact revision: ' || label) from results;
select is(jsonb_typeof(result->'personal_revision'),'string','Revision JSON string: ' || label) from results;
select ok((result->>'collection_item_id')::uuid is not null,'New UUID: ' || label) from results;
select is(result->>'operation_id',pg_temp.operation(case label when 'start' then 100 else 101 end)::text,'Operation UUID: ' || label) from results;
select results_eq($$select to_jsonb(i) from public.collection_items i where id in (select (data->>'id')::uuid from seed) order by id$$,
  $$select data from seed order by data->>'id'$$,'Ordinary add preserves every preexisting item byte-for-byte');
select ok(i.origin='manual' and i.automatic_rank is null and i.introduced_revision=e.sequence
  and e.sequence=r.accepted_revision and r.result=res.result and r.kind='add', 'Item, initial intent and receipt coherent: ' || res.label)
  from results res join public.collection_items i on i.id=(res.result->>'collection_item_id')::uuid
  join private.collection_order_intents e on e.subject_item_id=i.id
  join private.collection_operation_receipts r on r.collection_id=e.collection_id and r.operation_id=e.operation_id;
select is((select personal_revision from public.collections where id=pg_temp.parent()),4::bigint,'One revision per accepted addition');
select is(destination,'before','Start normalized before first pre-add item') from private.collection_order_intents where operation_id=pg_temp.operation(100);
select is(anchor_item_id,pg_temp.item(1),'Start anchor from authoritative full order') from private.collection_order_intents where operation_id=pg_temp.operation(100);
select is(fallback_item_ids,array[pg_temp.item(2),pg_temp.item(3),pg_temp.item(4),pg_temp.item(5)],'Complete R1 suffix includes manual and automatic items')
  from private.collection_order_intents where operation_id=pg_temp.operation(100);
select ok(destination='end' and anchor_item_id is null and fallback_item_ids='{}'::uuid[],'Default end has mandatory explicit initial intent')
  from private.collection_order_intents where operation_id=pg_temp.operation(101);
select lives_ok('set constraints all immediate','Produced item/journal final state satisfies deferred invariant');
set constraints all deferred;

-- Feed actual persisted items/journal to the unchanged internal engine.
create function pg_temp.replay(canonical bigint[]) returns jsonb language sql as $$
  select private.merge_collection_relative_order(pg_temp.parent(),
    array(select row(v,r)::private.collection_order_canonical_entry from unnest(canonical) with ordinality c(v,r)),
    array(select row(collection_id,id,variant_id,origin,automatic_rank,introduced_revision,false)::private.collection_order_item_entry
      from public.collection_items where collection_id=pg_temp.parent() order by id),
    array(select e from private.collection_order_intents e where collection_id=pg_temp.parent() order by sequence));
$$;
select is(array(select (x->>'variant_id')::bigint from jsonb_array_elements(pg_temp.replay(array[-95001,-95003,-95005]::bigint[])->'final_order') x),
  pg_temp.fixture_order(),'8B.2 replays persisted initial intents into exact materialized order');
select is(pg_temp.replay(array[-95001,-95003,-95005,-95008]::bigint[])->'converted',
  jsonb_build_array(jsonb_build_object('collection_item_id',(select result->>'collection_item_id' from results where label='end'),
    'variant_id','-95008','automatic_rank','4')),'Engine conversion keeps initial end placement and item UUID');
select is(array(select (x->>'variant_id')::bigint from jsonb_array_elements(pg_temp.replay(array[-95008,-95001,-95003,-95005]::bigint[])->'final_order') x),
  pg_temp.fixture_order(),'Converted end stays end despite new canonical head');

insert into unchanged values(pg_temp.fixture_state());
set local role authenticated;
select is(pg_temp.add_item(-95007,'start'),(select result from results where label='start'),'Historical retry before revision check, same item UUID');
select throws_ok(sql,'23505','operation_id_conflict',label) from (values
  ($$select pg_temp.add_item(-95009,'start')$$,'UUID different variant'),
  ($$select pg_temp.add_item(-95007,'end')$$,'UUID different placement'),
  ($$select pg_temp.add_item(-95007,'start',3)$$,'UUID different expected revision'),
  ($$select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(1),'end',null,2,pg_temp.operation(100))$$,'UUID collides across v2 writers')) v(sql,label);
select throws_ok($$select pg_temp.add_item(-95009,'end',2,102)$$,'40001','collection_structure_conflict','New stale operation refuses mutation');
reset role;
update public.catalog_variants set is_active=false where id=-95007;
set local role authenticated;
select is(pg_temp.add_item(-95007,'start'),(select result from results where label='start'),'Retry does not recheck current catalogue eligibility');
reset role;
update public.catalog_variants set is_active=true where id=-95007;
select is(pg_temp.fixture_state(),(select data from unchanged),'Retries/collisions/stale revision leave all state and timestamps unchanged');

-- Free v2, including empty start normalized to end; UUID scope is parent-local.
set local role authenticated;
insert into results values ('free',pg_temp.add_item(-95007,'start',1,100,2)),
  ('empty-start',pg_temp.add_item(-95007,'start',0,100,4)),('empty-end',pg_temp.add_item(-95007,'end',0,100,5));
reset role;
select is(pg_temp.fixture_order(2),array[-95007,-95006]::bigint[],'Free v2 accepts exact variant');
select is(pg_temp.fixture_order(n),array[-95007]::bigint[],'Empty v2 insertion: ' || n) from unnest(array[4,5]) n;
select ok(e.destination='end' and e.anchor_item_id is null and e.fallback_item_ids='{}'::uuid[] and e.sequence=1,
  'Empty initial intent is explicit end: ' || n) from unnest(array[4,5]) n join private.collection_order_intents e on e.collection_id=pg_temp.parent(n);
select is((select count(*) from private.collection_operation_receipts where operation_id=pg_temp.operation(100)),4::bigint,'Same UUID independent per collection');
select lives_ok('set constraints all immediate','All free and empty fixtures valid');
set constraints all deferred;

set local role authenticated;
select throws_ok(format('select pg_temp.add_item(%s,%s,%s,%s)',variant,placement,revision,operation),code,message,label)
  from (values
    ('null',quote_literal('end'),'4','110','22023','collection_operation_invalid','NULL variant'),
    ('-95009','null','4','110','22023','collection_operation_invalid','NULL placement'),
    ('-95009',quote_literal('before'),'4','110','22023','collection_operation_invalid','Only start/end accepted'),
    ('-95009',quote_literal('end'),'null','110','22023','collection_operation_invalid','NULL revision'),
    ('-95009',quote_literal('end'),'-1','110','22023','collection_operation_invalid','Negative revision'),
    ('-95009',quote_literal('end'),'4','null','22023','collection_operation_invalid','NULL operation UUID'),
    ('-95001',quote_literal('end'),'4','110','23505','already_present','Automatic duplicate refused'),
    ('-95002',quote_literal('end'),'4','110','23505','already_present','Manual duplicate refused'),
    ('-95011',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','Inactive variant'),
    ('-95012',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','French unknown'),
    ('-95013',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','French unavailable'),
    ('-95014',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','Inactive source card'),
    ('-95015',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','Inactive set'),
    ('-95999',quote_literal('end'),'4','110','P0002','manual_variant_unavailable','Absent exact variant')) v(variant,placement,revision,operation,code,message,label);
select throws_ok($$select pg_temp.add_item(-95007,'end',0,110,3)$$,'23514','order_contract_upgrade_required','V2 refuses legacy');
reset role;
select is(pg_temp.fixture_state(),(select data from unchanged),'All refused operations leave no partial item, revision, intent or receipt');

savepoint outside_target;
select is(pg_temp.add_item(-95021,'end',4,111)->>'outcome','changed','Automatic collection accepts eligible variant outside target/canonical');
select is((select target_set_id from public.collections where id=pg_temp.parent()),-95001::bigint,'Outside-target manual add does not change target');
rollback to outside_target;
savepoint cross_kind;
select is(public.reorder_collection_item_v2(pg_temp.parent(),(select (result->>'collection_item_id')::uuid from results where label='end'),
  'end',null,4,pg_temp.operation(112))->>'outcome','noop','Reorder uses shared receipt store');
select throws_ok($$select pg_temp.add_item(-95009,'end',4,112)$$,'23505','operation_id_conflict','Add cannot reuse an accepted reorder UUID');
rollback to cross_kind;

-- Numeric edges, ties and decimals; comparisons use explicit expected order.
savepoint numeric_start;
update public.collection_items set sort_position=-99999999999999999999+sort_position/1000 where collection_id=pg_temp.parent();
insert into results values ('edge-start',pg_temp.add_item(-95009,'start',4,120));
select is(pg_temp.fixture_order(),array[-95009,-95007,-95001,-95002,-95003,-95004,-95005,-95008]::bigint[],'Negative bound rebalances without changing others relative order');
select is((select sort_position from public.collection_items where id=(select (result->>'collection_item_id')::uuid from results where label='edge-start')),0::numeric,'Rebalanced start position zero');
select is((select array_agg(sort_position order by sort_position,id) from public.collection_items where collection_id=pg_temp.parent()),
  array[0,1,2,3,4,5,6,7]::numeric[],'Rebalance exact bounded integer positions');
rollback to numeric_start;
savepoint numeric_end;
update public.collection_items set sort_position=99999999999999999999+sort_position/1000 where collection_id=pg_temp.parent();
insert into results values ('edge-end',pg_temp.add_item(-95009,'end',4,120));
select is(pg_temp.fixture_order(),array[-95007,-95001,-95002,-95003,-95004,-95005,-95008,-95009]::bigint[],'Positive bound rebalances without changing others relative order');
select is((select sort_position from public.collection_items where id=(select (result->>'collection_item_id')::uuid from results where label='edge-end')),8::numeric,'Rebalanced end position N+1');
rollback to numeric_end;
savepoint numeric_ties;
update public.collection_items set sort_position=1 where collection_id=pg_temp.parent();
create temp table tie_order as select array_agg(variant_id order by sort_position,id) variants,array_agg(id order by sort_position,id) ids from public.collection_items where collection_id=pg_temp.parent();
insert into results values ('ties',pg_temp.add_item(-95009,'start',4,120));
select is(pg_temp.fixture_order(),array[-95009]::bigint[] || (select variants from tie_order),'Tie rebalance respects authoritative position/UUID order');
select is((select fallback_item_ids from private.collection_order_intents where operation_id=pg_temp.operation(120)),
  (select ids[2:cardinality(ids)] from tie_order),'R1 captured before tie rebalance');
rollback to numeric_ties;
savepoint decimals;
update public.collection_items set sort_position=sort_position/100000000000000000000 where collection_id=pg_temp.parent();
create temp table decimal_items as select to_jsonb(i) data from public.collection_items i where collection_id=pg_temp.parent();
select lives_ok($$select pg_temp.add_item(-95009,'end',4,120)$$,'Precision-scale neighbours permit end without unnecessary rebalance');
select results_eq($$select to_jsonb(i) from public.collection_items i where id in (select (data->>'id')::uuid from decimal_items) order by id$$,
  $$select data from decimal_items order by data->>'id'$$,'Exact decimals of old items untouched');
rollback to decimals;

savepoint bigint_limits;
update public.collections set personal_revision=9223372036854775806 where id=pg_temp.parent();
insert into results values ('bigint',pg_temp.add_item(9007199254740997,'end',9223372036854775806,130));
select is((select result->>'personal_revision' from results where label='bigint'),'9223372036854775807','BIGINT revision exact to maximum');
select is((select variant_id from public.collection_items where id=(select (result->>'collection_item_id')::uuid from results where label='bigint')),
  9007199254740997::bigint,'Variant beyond JavaScript precision exact');
select lives_ok('set constraints all immediate','Maximum BIGINT introduction and initial sequence valid');
set constraints all deferred;
create temp table before_overflow as select pg_temp.fixture_state() data;
select throws_ok($$select pg_temp.add_item(-95009,'end',9223372036854775807,131)$$,'XX000','phase8_operation_unexpected','Revision overflow sanitized');
select is(pg_temp.fixture_state(),(select data from before_overflow),'Overflow rollback includes item/intent/receipt');
rollback to bigint_limits;
set constraints all deferred;

-- Injection proves intermediate item exists, then total subtransaction rollback.
create sequence pg_temp.injection_seen;
create function pg_temp.fail_intent() returns trigger language plpgsql as $$
begin
  if new.operation_id=pg_temp.operation(140) and exists(select 1 from public.collection_items
    where id=new.subject_item_id and introduced_revision=5) then
    perform nextval('pg_temp.injection_seen'); raise exception 'test injected after item';
  end if;
  return new;
end;
$$;
create trigger test_fail_initial_intent before insert on private.collection_order_intents for each row execute function pg_temp.fail_intent();
select throws_ok($$select pg_temp.add_item(-95009,'end',4,140)$$,'XX000','phase8_operation_unexpected','Failure after item before intent sanitized');
select is((select last_value from pg_temp.injection_seen),1::bigint,'Injection observed inserted item');
select ok((select is_called from pg_temp.injection_seen),'Injection sequence was actually incremented');
select is(pg_temp.fixture_state(),(select data from unchanged),'Failure after item rolls back all state');
drop trigger test_fail_initial_intent on private.collection_order_intents;
create function pg_temp.fail_receipt() returns trigger language plpgsql as $$
begin
  if new.operation_id=pg_temp.operation(141) and exists(select 1 from private.collection_order_intents
    where operation_id=new.operation_id and sequence=new.accepted_revision) then
    perform nextval('pg_temp.injection_seen'); raise exception 'test injected before receipt';
  end if;
  return new;
end;
$$;
create trigger test_fail_add_receipt before insert on private.collection_operation_receipts for each row execute function pg_temp.fail_receipt();
select throws_ok($$select pg_temp.add_item(-95009,'start',4,141)$$,'XX000','phase8_operation_unexpected','Failure before receipt sanitized');
select is((select last_value from pg_temp.injection_seen),2::bigint,'Receipt injection reached after initial intent');
select is(pg_temp.fixture_state(),(select data from unchanged),'Receipt failure rolls back rebalance/item/revision/intent/receipt');
drop trigger test_fail_add_receipt on private.collection_operation_receipts;
savepoint failed_retry;
select is(pg_temp.add_item(-95009,'start',4,141)->>'outcome','changed','Rolled back UUID can be accepted on retry');
rollback to failed_retry;

-- Force the initially deferred constraint inside a subtransaction; every
-- incoherent transaction is rolled back by throws_ok, not merely detected.
create function pg_temp.break_initial(mode text) returns void language plpgsql as $$
begin
  if mode='delete' then
    delete from private.collection_order_intents where collection_id=pg_temp.parent() and sequence=1;
  elsif mode='converted-delete' then
    update public.collection_items set origin='automatic',automatic_rank=4 where id=pg_temp.item(2);
    delete from private.collection_order_intents where collection_id=pg_temp.parent() and sequence=1;
  elsif mode='duplicate-initial' then
    insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
      values(pg_temp.parent(),5,pg_temp.operation(150),pg_temp.item(2),'manual_add','end','{}');
    update public.collections set personal_revision=5 where id=pg_temp.parent();
  elsif mode='native-automatic' then
    insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
      values(pg_temp.parent(),5,pg_temp.operation(150),pg_temp.item(1),'manual_add','end','{}');
    update public.collections set personal_revision=5 where id=pg_temp.parent();
  elsif mode='parent-revision' then
    update public.collections set personal_revision=1 where id=pg_temp.parent();
  elsif mode='move-before-introduction' then
    insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,introduced_revision)
      values(pg_temp.item(7),pg_temp.parent(),-95009,'manual',20,6);
    insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
      values(pg_temp.parent(),5,pg_temp.operation(150),pg_temp.item(7),'move','end','{}'),
        (pg_temp.parent(),6,pg_temp.operation(151),pg_temp.item(7),'manual_add','end','{}');
    update public.collections set personal_revision=6 where id=pg_temp.parent();
  else
    insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,introduced_revision)
      values(pg_temp.item(7),pg_temp.parent(),-95009,'manual',20,
        case mode when 'null' then null when 'duplicate-revision' then 1 else 5 end);
    if mode='mismatch' then
      insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
        values(pg_temp.parent(),6,pg_temp.operation(150),pg_temp.item(7),'manual_add','end','{}');
    end if;
    update public.collections set personal_revision=6 where id=pg_temp.parent();
  end if;
  set constraints all immediate;
end;
$$;
select throws_ok(format('select pg_temp.break_initial(%L)',mode),'23514','collection_initial_placement_invalid','Deferred integrity refuses ' || mode)
  from unnest(array['null','missing','mismatch','duplicate-revision','delete','converted-delete','duplicate-initial','native-automatic',
    'parent-revision','move-before-introduction']) mode;
select is(pg_temp.fixture_state(),(select data from unchanged),'Incoherent deferred transactions fully rolled back');
savepoint coherent_deferred;
select lives_ok($$insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,introduced_revision)
  values(pg_temp.item(7),pg_temp.parent(),-95009,'manual',20,5)$$,'Item before journal permitted inside transaction');
insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
  values(pg_temp.parent(),5,pg_temp.operation(150),pg_temp.item(7),'manual_add','end','{}');
update public.collections set personal_revision=5 where id=pg_temp.parent();
select lives_ok('set constraints all immediate','Completed initial placement accepted at transaction boundary');
rollback to coherent_deferred;
set constraints all deferred;
savepoint conversion;
create temp table initial_before as select to_jsonb(e) data from private.collection_order_intents e where collection_id=pg_temp.parent() and sequence=1;
update public.collection_items set origin='automatic',automatic_rank=4 where id=pg_temp.item(2);
select lives_ok('set constraints all immediate','Future conversion preserves introduction and initial intent');
select is((select introduced_revision from public.collection_items where id=pg_temp.item(2)),1::bigint,'Conversion retains introduction');
select is((select to_jsonb(e) from private.collection_order_intents e where collection_id=pg_temp.parent() and sequence=1),
  (select data from initial_before),'Conversion keeps initial intent byte-for-byte');
select throws_ok(format('update public.collection_items set %s where id=pg_temp.item(2)',assignment),
  '23514','collection_item_introduction_immutable','Converted lifecycle protects ' || assignment)
  from unnest(array['introduced_revision=null','introduced_revision=5','variant_id=-95009','id=pg_temp.item(99)',
    'origin=''manual'',automatic_rank=null,collection_id=pg_temp.parent(2)']) assignment;
rollback to conversion;
set constraints all deferred;

-- Legacy unchanged and exempt; activating an incomplete legacy fixture fails.
insert into results values ('legacy',jsonb_build_object('id',public.add_manual_collection_item(pg_temp.parent(3),-95007,'end')));
select ok(introduced_revision is null,'Legacy manual introduction remains NULL') from public.collection_items where collection_id=pg_temp.parent(3);
select lives_ok('set constraints all immediate','Legacy item without initial intent remains valid');
set constraints all deferred;
create function pg_temp.invalid_upgrade() returns void language plpgsql as $$
begin
  update public.collections set order_contract_version=2 where id=pg_temp.parent(3);
  set constraints all immediate;
end;
$$;
select throws_ok('select pg_temp.invalid_upgrade()','23514','collection_initial_placement_invalid','Parent mode change cannot bypass required initial intent');
select lives_ok($$select public.reorder_collection_item(pg_temp.parent(3),(select (result->>'id')::uuid from results where label='legacy'),'start')$$,'Legacy reorder remains functional');
select lives_ok($$select public.remove_manual_collection_item(pg_temp.parent(3),(select (result->>'id')::uuid from results where label='legacy'))$$,'Legacy removal remains functional');
select is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent(3)),0::bigint,'Legacy creates no receipt');

create function pg_temp.denied(id text,aal text,label text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal',aal)::text,true);
  return next throws_ok($q$select pg_temp.add_item(-95007,'start')$q$,'42501','collection_action_unavailable',label || ' retry refused');
  return next throws_ok($q$select pg_temp.add_item(-95009,'end',4,160)$q$,'42501','collection_action_unavailable',label || ' new add refused');
end;
$$;
grant execute on function pg_temp.denied(text,text,text) to authenticated;
set local role authenticated;
select pg_temp.denied(id,aal,label) from (values
  ('a2500000-0000-0000-0000-000000000001','aal1','Owner without AAL2'),
  ('a2500000-0000-0000-0000-000000000002','aal2','Shared recipient'),
  ('a2500000-0000-0000-0000-000000000003','aal2','Third party'),
  ('a2500000-0000-0000-0000-000000000004','aal2','Auth user without profile'),
  (null,'aal2','No session')) v(id,aal,label);
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok($$select pg_temp.add_item(-95009,'end',0,160,6)$$,'42501','collection_action_unavailable','Other owner collection isolated');
select throws_ok($$select pg_temp.add_item(-95009,'end',0,160,99)$$,'42501','collection_action_unavailable','Absent parent unavailable');
select throws_ok(sql,'42501',null,label) from (values
  ('select * from private.collection_order_intents','Owner cannot read journal'),
  ('select * from private.collection_operation_receipts','Owner cannot read receipts'),
  ($$delete from private.collection_order_intents where collection_id=pg_temp.parent()$$,'Owner cannot delete initial intent'),
  ($$update public.collection_items set introduced_revision=null where collection_id=pg_temp.parent()$$,'Owner cannot change introduction'),
  ($$update public.collections set personal_revision=5 where id=pg_temp.parent()$$,'Owner cannot change revision'),
  ($$insert into public.collection_items(collection_id,variant_id,origin,sort_position) values(pg_temp.parent(),-95009,'manual',10)$$,'Owner cannot insert directly')) v(sql,label);
set local role anon;
select throws_ok($$select pg_temp.add_item(-95009,'end',4,160)$$,'42501',null,'Anon EXECUTE refused');
set local role service_role;
select throws_ok($$select pg_temp.add_item(-95009,'end',4,160)$$,'42501',null,'Service role EXECUTE refused');
reset role;
savepoint owner_change;
update public.collections set owner_id='a2500000-0000-0000-0000-000000000003' where id=pg_temp.parent();
set local role authenticated;
select throws_ok($$select pg_temp.add_item(-95007,'start')$$,'42501','collection_action_unavailable','Historical receipt requires current ownership');
reset role;
rollback to owner_change;

-- Retired subject is never resurrected; other subjects retain historical R1.
delete from public.collection_items where id=(select (result->>'collection_item_id')::uuid from results where label='start');
update public.collections set personal_revision=5 where id=pg_temp.parent();
select is(pg_temp.add_item(-95007,'start'),(select result from results where label='start'),'Retry survives absent item without recreating it');
select is((select count(*) from public.collection_items where collection_id=pg_temp.parent() and variant_id=-95007),0::bigint,'Retry never resurrects subject');
insert into results values ('reintroduced',pg_temp.add_item(-95007,'start',5,170));
select isnt((select result->>'collection_item_id' from results where label='reintroduced'),
  (select result->>'collection_item_id' from results where label='start'),'Real reintroduction gets new identity');
select is(pg_temp.add_item(-95007,'start'),(select result from results where label='start'),'Old retry retains old UUID after reintroduction');
select is((select count(*) from public.collection_items where collection_id=pg_temp.parent() and variant_id=-95007),1::bigint,'No duplicate reintroduction');
delete from public.collection_items where id=pg_temp.item(2);
select ok(pg_temp.item(2)=any(fallback_item_ids),'Historical fallback survives removed manual identity') from private.collection_order_intents where operation_id=pg_temp.operation(170);
select lives_ok('set constraints all immediate','Subject cascade and historical references maintain final integrity');
delete from public.collections where id=pg_temp.parent();
select throws_ok($$select pg_temp.add_item(-95007,'start')$$,'42501','collection_action_unavailable','Deleted parent cannot recover receipt');
select is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent()),0::bigint,'Parent cascade removes receipts');
select * from finish();
rollback;
