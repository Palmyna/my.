begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc
\ir collection_hidden.fixtures.inc
\ir collection_update.fixtures.inc
\ir collection_update_apply.fixtures.inc

create function pg_temp.parent() returns uuid language sql immutable as $$select 'c2500000-0000-0000-0000-000000000001'::uuid$$;
create function pg_temp.item(n int) returns uuid language sql immutable as $$select ('d2500000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.op(n int) returns uuid language sql immutable as $$select ('e2500000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.preview() returns jsonb language sql as $$select public.preview_collection_update(pg_temp.parent())$$;
create function pg_temp.apply(token jsonb, op int) returns jsonb language sql as $$select public.apply_collection_update(pg_temp.parent(),token,pg_temp.op(op))$$;
create function pg_temp.target(ids bigint[],version bigint) returns void language plpgsql as $$
begin
  update public.catalog_variants v set is_active=v.id=any(ids),sort_order=coalesce(array_position(ids,v.id),99) where v.source_card_id=-95001;
  update public.automatic_target_states set generation_version=version,content_hash=(select encode(sha256(convert_to('[' ||
    coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('set',-95001)) where id=-95001;
end;
$$;
create function pg_temp.state() returns jsonb language sql as $$
select jsonb_build_object(
  'parent',(select to_jsonb(c) from public.collections c where id=pg_temp.parent()),
  'items',(select jsonb_agg(to_jsonb(i) order by id) from public.collection_items i where collection_id=pg_temp.parent()),
  'copies',(select jsonb_agg(to_jsonb(i) order by id) from public.physical_copies i),
  'intents',(select jsonb_agg(to_jsonb(i) order by sequence) from private.collection_order_intents i where collection_id=pg_temp.parent()),
  'receipts',(select jsonb_agg(to_jsonb(i) order by operation_id) from private.collection_operation_receipts i where collection_id=pg_temp.parent()));
$$;
create function pg_temp.materialized() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('collection_item_id',id,'variant_id',variant_id::text,'origin',origin,
  'automatic_rank',automatic_rank::text,'is_hidden',is_hidden) order by sort_position,id),'[]')
  from public.collection_items where collection_id=pg_temp.parent();
$$;
create function pg_temp.expected(plan jsonb,result jsonb) returns jsonb language sql as $$
select coalesce(jsonb_agg(e || jsonb_build_object('collection_item_id',coalesce(e->>'collection_item_id',
  (select c->>'collection_item_id' from jsonb_array_elements(result->'created_items') c where c->>'variant_id'=e->>'variant_id'))) order by n),'[]')
  from jsonb_array_elements(plan->'final_order') with ordinality a(e,n);
$$;
grant execute on function pg_temp.parent(),pg_temp.item(int),pg_temp.op(int),pg_temp.preview(),pg_temp.apply(jsonb,int) to authenticated;
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);

-- Chronology is exercised by real accepted writers, including a removed subject.
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(4),'start',null,2,pg_temp.op(30));
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(3),'end',null,3,pg_temp.op(31));
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(4),'before',pg_temp.item(3),4,pg_temp.op(32));
create temp table confirmation as select pg_temp.preview() plan,pg_temp.state() before;
grant select on confirmation to authenticated;
select is((select plan from confirmation),private.collection_update_plan(private.read_collection_update_context(pg_temp.parent(),true)),
  'Expected plan is the real unchanged 8E planner');
select is((select jsonb_array_length(plan->'added') from confirmation),1,'Mixed plan adds one automatic');
select is((select jsonb_array_length(plan->'removed') from confirmation),1,'Mixed plan removes one automatic');
select is((select jsonb_array_length(plan->'converted') from confirmation),1,'Mixed plan converts one manual');
select is((select count(*)::int from private.collection_order_intents where collection_id=pg_temp.parent()),5,'Complete chronological journal before application');

-- Strict token format rejects keys, JSON types, noncanonical decimals and overflow.
select throws_ok(format('select pg_temp.apply(%L::jsonb,100)',bad),'22023','collection_operation_invalid',description)
from confirmation cross join lateral (values
  (null::jsonb,'NULL token'),('[]'::jsonb,'Array token'),('null'::jsonb,'JSON null token'),
  (plan->'token'||'{"extra":true}'::jsonb,'Extra key'),((plan->'token')-'plan_hash','Missing key'),
  (plan->'token'||'{"contract_version":"1"}'::jsonb,'String format version'),
  (plan->'token'||'{"contract_version":2}'::jsonb,'Wrong format version'),
  (plan->'token'||'{"personal_revision":5}'::jsonb,'Numeric BIGINT'),
  (plan->'token'||'{"personal_revision":"05"}'::jsonb,'Leading zero'),
  (plan->'token'||'{"personal_revision":"+5"}'::jsonb,'Plus sign'),
  (plan->'token'||'{"personal_revision":"-1"}'::jsonb,'Negative revision'),
  (plan->'token'||'{"personal_revision":"5.0"}'::jsonb,'Fractional decimal'),
  (plan->'token'||'{"personal_revision":"5e0"}'::jsonb,'Exponential decimal'),
  (plan->'token'||'{"personal_revision":null}'::jsonb,'Null revision'),
  (plan->'token'||'{"applied_target_version":"0"}'::jsonb,'Zero applied version'),
  (plan->'token'||'{"target_version":"9223372036854775808"}'::jsonb,'BIGINT overflow'),
  (plan->'token'||'{"personal_revision":"99999999999999999999"}'::jsonb,'Oversized decimal'),
  (plan->'token'||jsonb_build_object('target_hash',repeat('A',64)),'Uppercase hash'),
  (plan->'token'||'{"plan_hash":"abc"}'::jsonb,'Short plan hash'),
  (plan->'token'||'{"target_hash":123}'::jsonb,'Numeric hash')) malformed(bad,description);
select throws_ok($$select public.apply_collection_update(pg_temp.parent(),(select plan->'token' from confirmation),null)$$,
  '22023','collection_operation_invalid','NULL operation UUID');
select is(pg_temp.state(),(select before from confirmation),'Malformed requests have no business effects');

-- Every field participates, including collection-bound plan hash.
select throws_ok(format('select pg_temp.apply(%L::jsonb,100)',bad),'40001','preview_stale',description)
from confirmation cross join lateral (values
  (plan->'token'||'{"applied_target_version":"6"}'::jsonb,'Applied version differs'),
  (plan->'token'||'{"target_version":"9"}'::jsonb,'Target version differs'),
  (plan->'token'||'{"personal_revision":"4"}'::jsonb,'Personal revision differs'),
  (plan->'token'||jsonb_build_object('target_hash',repeat('b',64)),'Canonical hash differs'),
  (plan->'token'||jsonb_build_object('plan_hash',repeat('b',64)),'Plan hash differs'),
  (plan->'token'||jsonb_build_object('plan_hash',private.collection_update_plan_hash('c2500000-0000-0000-0000-000000000007',plan)),
   'Plan belongs to another parent')) stale(bad,description);
select is(pg_temp.state(),(select before from confirmation),'Stale requests leave complete state unchanged');

-- Real structural mutations invalidate the token; rollback each isolated probe.
savepoint structural;
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(2),'start',null,5,pg_temp.op(40));
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'40001','preview_stale','Stale after reorder');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),40)$$,'23505','operation_id_conflict','Existing move UUID precedes freshness check');
rollback to structural;
select public.set_collection_item_hidden(pg_temp.parent(),pg_temp.item(1),false,5,pg_temp.op(41));
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'40001','preview_stale','Stale after masking');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),41)$$,'23505','operation_id_conflict','Existing hide UUID precedes freshness check');
rollback to structural;
select public.add_manual_collection_item_v2(pg_temp.parent(),-95021,'end',5,pg_temp.op(42));
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'40001','preview_stale','Stale after manual add');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),42)$$,'23505','operation_id_conflict','Existing add UUID precedes freshness check');
rollback to structural;
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(4),5,pg_temp.op(43));
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'40001','preview_stale','Stale after manual removal');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),43)$$,'23505','operation_id_conflict','Existing remove UUID precedes freshness check');
rollback to structural;
select pg_temp.target(array[-95001,-95002,-95005,9007199254740997]::bigint[],9);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'40001','preview_stale','Stale after catalogue sync');
rollback to structural;
set constraints all deferred;

-- Copy, note, name and viewer preferences do not change the structural plan.
update public.physical_copies set note='Edited after preview',name='Edited name' where user_id='a2500000-0000-0000-0000-000000000001';
insert into public.physical_copies(user_id,variant_id,note) values('a2500000-0000-0000-0000-000000000001',-95002,'Copy added after preview');
update public.collections set name='Renamed after preview' where id=pg_temp.parent();
insert into public.collection_view_preferences(user_id,collection_id,binder_format)
  values('a2500000-0000-0000-0000-000000000001',pg_temp.parent(),'2x2');
select is(pg_temp.preview(),(select plan from confirmation),'Notes/copies/parent name preserve exact token and plan');
update confirmation set before=pg_temp.state();

-- Failure after deletion and insertion, during conversion, rolls everything back.
create function pg_temp.fail_conversion() returns trigger language plpgsql as $$
begin
  if old.origin='manual' and new.origin='automatic'
    and not exists(select 1 from public.collection_items where id=pg_temp.item(3))
    and exists(select 1 from public.collection_items where collection_id=pg_temp.parent() and variant_id=9007199254740997) then
    raise exception 'Injected conversion failure';
  end if;
  return new;
end;
$$;
create trigger phase8f1_injected_conversion after update on public.collection_items for each row execute function pg_temp.fail_conversion();
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'XX000','collection_update_unexpected','Partial conversion failure sanitized');
select is(pg_temp.state(),(select before from confirmation),'Rollback restores deletions, insertions, conversions, masks, journal, copies, parent and receipt');
drop trigger phase8f1_injected_conversion on public.collection_items;

create function pg_temp.fail_receipt() returns trigger language plpgsql as $$
begin
  if new.kind='apply' and (select personal_revision from public.collections where id=pg_temp.parent()) = 6 then
    raise exception 'Injected receipt failure';
  end if;
  return new;
end;
$$;
create trigger phase8f1_injected_receipt before insert on private.collection_operation_receipts for each row execute function pg_temp.fail_receipt();
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),100)$$,'XX000','collection_update_unexpected','Failure at final receipt sanitized');
select is(pg_temp.state(),(select before from confirmation),'Late failure restores complete transaction');
drop trigger phase8f1_injected_receipt on private.collection_operation_receipts;

set local role authenticated;
create temp table applied as select pg_temp.apply((select plan->'token' from confirmation),100) result;
reset role;
select is(pg_temp.materialized(),pg_temp.expected((select plan from confirmation),(select result from applied)),
  'Application equals actual 8E final order with only allocated placeholders substituted');
select ok(not exists(select 1 from public.collection_items where collection_id=pg_temp.parent() and sort_position <>
  (select n from jsonb_array_elements((select plan->'final_order' from confirmation)) with ordinality a(e,n) where e->>'variant_id'=variant_id::text)),
  'Every exact position is plan ordinality 1..N');
select is((select array_agg(sort_position::int order by sort_position) from public.collection_items where collection_id=pg_temp.parent()),array[1,2,3,4,5],'Positions continuous');
select is((select id from public.collection_items where collection_id=pg_temp.parent() and variant_id=-95002),pg_temp.item(2),'Converted UUID retained');
select is((select introduced_revision::text from public.collection_items where id=pg_temp.item(2)),'1','Converted introduction retained');
select is((select origin from public.collection_items where id=pg_temp.item(2)),'automatic','Converted origin');
select is((select automatic_rank::text from public.collection_items where id=pg_temp.item(2)),'2','Converted canonical rank');
select ok((select not is_hidden from public.collection_items where id=pg_temp.item(2)),'Conversion visible');
select ok((select is_hidden from public.collection_items where id=pg_temp.item(1)),'Retained automatic remains hidden');
select is((select array_agg(id order by id) from public.collection_items where collection_id=pg_temp.parent() and variant_id in(-95001,-95005,-95004)),
  array[pg_temp.item(1),pg_temp.item(4),pg_temp.item(5)],'Surviving identities retained');
select is((select result->'created_items' from applied),
  (select jsonb_agg(jsonb_build_object('variant_id',variant_id::text,'collection_item_id',id)) from public.collection_items where collection_id=pg_temp.parent() and variant_id=9007199254740997),
  'created_items exact, only newly inserted automatics with exact BIGINT');
select ok((select introduced_revision is null and origin='automatic' and not is_hidden and automatic_rank=4
  and id not in(select (e->>'id')::uuid from confirmation,jsonb_array_elements(before->'items') e)
  from public.collection_items where collection_id=pg_temp.parent() and variant_id=9007199254740997),'New automatic UUID, no artificial introduction or mask');
select ok(not exists(select 1 from public.collection_items where id=pg_temp.item(3)),'Absent automatic deleted');
select ok(not exists(select 1 from private.collection_order_intents where subject_item_id=pg_temp.item(3)),'Removed subject intentions cascade');
select is((select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=pg_temp.parent()),
  (select jsonb_agg(e order by (e->>'sequence')::bigint) from confirmation,jsonb_array_elements(before->'intents') e where e->>'subject_item_id'<>pg_temp.item(3)::text),
  'All surviving chronological intentions unchanged; no application move');
select ok(exists(select 1 from private.collection_order_intents where collection_id=pg_temp.parent() and subject_item_id=pg_temp.item(2)
  and anchor_item_id=pg_temp.item(3) and fallback_item_ids=array[pg_temp.item(5)]),'R1 removed anchor and historic suffix preserved for converted subject');
select is((select jsonb_agg(to_jsonb(c) order by id) from public.physical_copies c),(select before->'copies' from confirmation),'Every copy and note unchanged by application');
select is((select name from public.collections where id=pg_temp.parent()),'Renamed after preview','Parent name preserved');
select is((select personal_revision::text from public.collections where id=pg_temp.parent()),'6','Exactly one revision increment');
select is((select applied_target_version::text from public.collections where id=pg_temp.parent()),'8','Applied target version updated');
select is((select result-'created_items' from applied),jsonb_build_object('operation_id',pg_temp.op(100),'outcome','applied','personal_revision','6','applied_target_version','8'),'Exact result envelope');
select is((select array_agg(k order by k) from applied,jsonb_object_keys(result) k),array['applied_target_version','created_items','operation_id','outcome','personal_revision'],'Five result fields only');
select is((select result from private.collection_operation_receipts where collection_id=pg_temp.parent() and operation_id=pg_temp.op(100)),(select result from applied),'Receipt is exact result including UUID mapping');
select is((select kind from private.collection_operation_receipts where collection_id=pg_temp.parent() and operation_id=pg_temp.op(100)),'apply','Receipt kind apply');
select is((select accepted_revision::text from private.collection_operation_receipts where collection_id=pg_temp.parent() and operation_id=pg_temp.op(100)),'6','Receipt accepted revision');
select is((select request_hash from private.collection_operation_receipts where collection_id=pg_temp.parent() and operation_id=pg_temp.op(100)),
  encode(sha256(convert_to(jsonb_build_array('apply_collection_update',pg_temp.parent(),(select plan->'token' from confirmation))::text,'UTF8')),'hex'),'Canonical request fingerprint');
select lives_ok('set constraints all immediate','Deferred converted introduction valid at final state');
set constraints all deferred;
create temp table after_apply as select pg_temp.state() state;
select is(pg_temp.apply((select plan->'token' from confirmation),100),(select result from applied),'Same UUID/token returns original result');
select is(pg_temp.state(),(select state from after_apply),'Retry does not allocate UUID, mutate order or increment revision');
select is(public.get_collection_operation_result(pg_temp.parent(),pg_temp.op(100)),(select result from applied),'Lost response recoverable with receipt RPC');
select throws_ok($$select pg_temp.apply((select plan->'token'||'{"personal_revision":"6"}'::jsonb from confirmation),100)$$,
  '23505','operation_id_conflict','Same UUID different token collides before freshness');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),30)$$,'23505','operation_id_conflict','Apply UUID collides with move receipt');
select throws_ok($$select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(4),'end',null,6,pg_temp.op(100))$$,
  '23505','operation_id_conflict','Move UUID collides with apply receipt');
select throws_ok($$select public.add_manual_collection_item_v2(pg_temp.parent(),-95021,'end',6,pg_temp.op(100))$$,
  '23505','operation_id_conflict','Add UUID collides with apply receipt');
select throws_ok($$select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(4),6,pg_temp.op(100))$$,
  '23505','operation_id_conflict','Remove UUID collides with apply receipt');
select throws_ok($$select public.set_collection_item_hidden(pg_temp.parent(),pg_temp.item(1),false,6,pg_temp.op(100))$$,
  '23505','operation_id_conflict','Hide UUID collides with apply receipt');
select throws_ok($$select pg_temp.apply(pg_temp.preview()->'token',101)$$,'23514','collection_update_not_available','Fresh operation without useful delta refused');
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),101)$$,'40001','preview_stale','Old token for new operation refused');

-- R3 reintroduction allocates another identity; old historical references remain.
select pg_temp.target(array[-95003,-95005,-95002,-95001,9007199254740997]::bigint[],9);
create temp table reintroduced_plan as select pg_temp.preview() plan;
create temp table reintroduced as select pg_temp.apply((select plan->'token' from reintroduced_plan),102) result;
select is(pg_temp.materialized(),pg_temp.expected((select plan from reintroduced_plan),(select result from reintroduced)),'R1/R3 chronological replay matches next real plan');
select ok((select id<>pg_temp.item(3) and not is_hidden and introduced_revision is null from public.collection_items where collection_id=pg_temp.parent() and variant_id=-95003),'Reintroduced automatic has new identity and no old personalization');
select ok(not exists(select 1 from private.collection_order_intents e join public.collection_items i on e.subject_item_id=i.id where i.collection_id=pg_temp.parent() and i.variant_id=-95003),'No old intents transferred by variant');
select is(pg_temp.apply((select plan->'token' from confirmation),100),(select result from applied),'Historic retry ignores later application/catalogue');
select pg_temp.target(array[-95003,-95005,-95002,-95001]::bigint[],10);
select pg_temp.apply(pg_temp.preview()->'token',104);
select ok(not exists(select 1 from public.collection_items where collection_id=pg_temp.parent() and variant_id=9007199254740997),'Previously allocated automatic really deleted by later application');
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(4),8,pg_temp.op(103));
delete from public.automatic_target_states where id=-95001;
create temp table before_retry as select pg_temp.state() state;
select is(pg_temp.apply((select plan->'token' from confirmation),100),(select result from applied),'Retry after subject deletion and missing old canonical state');
select is(public.get_collection_operation_result(pg_temp.parent(),pg_temp.op(100)),(select result from applied),'Receipt lookup retains created UUID even when allocated item no longer exists');
select is(pg_temp.state(),(select state from before_retry),'Historical retry needs no live items or canonical read');

-- Empty target, with and without surviving manuals; no new empty creation.
rollback to structural;
set constraints all deferred;
select pg_temp.target('{}'::bigint[],10);
create temp table empty_plan as select pg_temp.preview() plan;
create temp table empty_result as select pg_temp.apply((select plan->'token' from empty_plan),200) result;
select is(pg_temp.materialized(),pg_temp.expected((select plan from empty_plan),(select result from empty_result)),'Empty canonical preserves exact manual plan');
select is((select count(*)::int from public.collection_items where collection_id=pg_temp.parent()),2,'Two surviving manuals');
select is((select result->'created_items' from empty_result),'[]'::jsonb,'Empty update creates no UUIDs');
select ok(exists(select 1 from public.collections where id=pg_temp.parent()),'Empty canonical keeps parent');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}',true);
select throws_ok($$select * from public.create_automatic_collection('New empty target','set',-95001)$$,'23514','automatic_collection_empty','Empty target still cannot create a new automatic collection');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);
rollback to structural;
set constraints all deferred;
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(2),5,pg_temp.op(210));
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(4),6,pg_temp.op(211));
select pg_temp.target('{}'::bigint[],10);
select lives_ok($$select pg_temp.apply(pg_temp.preview()->'token',212)$$,'Empty target without manuals applies');
select is((select count(*)::int from public.collection_items where collection_id=pg_temp.parent()),0,'Existing automatic becomes empty');
select is((select applied_target_version::text from public.collections where id=pg_temp.parent()),'10','Empty applied version stored');
select lives_ok('set constraints all immediate','Empty final deferred invariants valid');
rollback to structural;
set constraints all deferred;

-- Useful delta absent even if catalogue version advanced and returned to old IDs.
select pg_temp.target(array[-95001,-95003,-95005]::bigint[],10);
select throws_ok($$select pg_temp.apply(pg_temp.preview()->'token',220)$$,'23514','collection_update_not_available','Higher version with identical applied canonical is not useful');
select is((select applied_target_version::text from public.collections where id=pg_temp.parent()),'7','No silent version advance');
rollback to structural;
set constraints all deferred;

-- Exact revisions/versions and variant IDs above JavaScript MAX_SAFE_INTEGER.
update public.collections set personal_revision=9007199254740997,applied_target_version=9007199254740997 where id=pg_temp.parent();
select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],9007199254740999);
create temp table big_result as select pg_temp.apply(pg_temp.preview()->'token',230) result;
select is((select result->>'personal_revision' from big_result),'9007199254740998','Exact huge revision increment');
select is((select result->>'applied_target_version' from big_result),'9007199254740999','Exact huge applied version');
select is((select result->'created_items'->0->>'variant_id' from big_result),'9007199254740997','Exact huge variant ID');
select lives_ok('set constraints all immediate','Huge final deferred introduction remains valid');
rollback to structural;
set constraints all deferred;

-- Current security is mandatory for new calls and historical retries alike.
set local role authenticated;
select throws_ok($$select public.apply_collection_update('c2500000-0000-0000-0000-000000000002',(select plan->'token' from confirmation),pg_temp.op(300))$$,'23514','collection_update_ineligible','Free collection refused');
select throws_ok($$select public.apply_collection_update('c2500000-0000-0000-0000-000000000008',(select plan->'token' from confirmation),pg_temp.op(300))$$,'23514','order_contract_upgrade_required','Legacy automatic refused');
select throws_ok($$select public.apply_collection_update('ffffffff-ffff-ffff-ffff-ffffffffffff',(select plan->'token' from confirmation),pg_temp.op(300))$$,'42501','collection_update_unavailable','Missing parent refused');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal1"}',true);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),300)$$,'42501','collection_update_unavailable','AAL1 refused');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),300)$$,'42501','collection_update_unavailable','Missing profile refused');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}',true);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),300)$$,'42501','collection_update_unavailable','Shared recipient refused');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}',true);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),300)$$,'42501','collection_update_unavailable','Third party refused');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select pg_temp.apply((select plan->'token' from confirmation),300)$$,'42501','collection_update_unavailable','No authenticated identity refused');
reset role;
set local role anon;
select throws_ok($$select public.apply_collection_update(null,null,null)$$,'42501','permission denied for function apply_collection_update','Anonymous EXECUTE denied');
reset role;

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_collection_update'),1,'Exactly one public signature');
select is((select pronargdefaults from pg_proc where oid='public.apply_collection_update(uuid,jsonb,uuid)'::regprocedure),0::smallint,'No default parameters');
select ok(provolatile='v' and prosecdef and proconfig @> array['search_path=""'],'VOLATILE definer with empty search_path') from pg_proc where oid='public.apply_collection_update(uuid,jsonb,uuid)'::regprocedure;
select ok(has_function_privilege('authenticated','public.apply_collection_update(uuid,jsonb,uuid)','EXECUTE'),'Authenticated EXECUTE granted');
select ok(not has_function_privilege(role,'public.apply_collection_update(uuid,jsonb,uuid)','EXECUTE'),role||' EXECUTE denied') from unnest(array['anon','service_role']) role;
select ok(not has_function_privilege(role,'private.raise_collection_preview_stale()','EXECUTE'),role||' private renderer denied') from unnest(array['anon','authenticated','service_role']) role;
select ok(not has_table_privilege(role,'private.collection_order_intents','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege(role,'private.collection_operation_receipts','SELECT,INSERT,UPDATE,DELETE'),role||' direct private tables denied') from unnest(array['anon','authenticated','service_role']) role;
select is((select count(*)::int from pg_constraint where conname in('collection_items_initial_placement','collection_intents_initial_placement','collections_initial_placement') and condeferrable and condeferred),3,'Three initial-placement constraints remain initially deferred');

select * from finish();
rollback;
