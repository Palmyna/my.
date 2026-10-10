begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc
\ir collection_hidden.fixtures.inc

create function pg_temp.parent(n integer default 1) returns uuid language sql immutable as $$
  select ('c2500000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.item(n integer) returns uuid language sql immutable as $$
  select ('d2500000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.op(n integer) returns uuid language sql immutable as $$
  select ('e2500000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.hide(n integer default 1, hidden boolean default true, revision bigint default 2,
  operation integer default 600, parent integer default 1) returns jsonb language sql as $$
  select public.set_collection_item_hidden(pg_temp.parent(parent),pg_temp.item(n),hidden,revision,pg_temp.op(operation));
$$;
create function pg_temp.state() returns jsonb language sql as $$
  select jsonb_build_object(
    'parents',(select jsonb_agg(to_jsonb(c) order by id) from public.collections c),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.collection_items i),
    'intents',(select jsonb_agg(to_jsonb(e) order by collection_id,sequence) from private.collection_order_intents e),
    'receipts',(select jsonb_agg(to_jsonb(r) order by collection_id,operation_id) from private.collection_operation_receipts r),
    'copies',(select jsonb_agg(to_jsonb(c) order by id) from public.physical_copies c));
$$;
create function pg_temp.progress() returns jsonb language sql as $$
  select jsonb_build_array(owned_count,total_count) from public.dashboard_collections where collection_id=pg_temp.parent();
$$;
grant execute on function pg_temp.parent(integer),pg_temp.item(integer),pg_temp.op(integer),
  pg_temp.hide(integer,boolean,bigint,integer,integer),pg_temp.progress() to authenticated,anon,service_role;
create temp table results(label text primary key,result jsonb);
grant select,insert on results to authenticated;
create temp table before_items as select to_jsonb(i)-'is_hidden'-'updated_at' data from public.collection_items i;
create temp table before_intents as select to_jsonb(e) data from private.collection_order_intents e;
create temp table before_copies as select to_jsonb(c) data from public.physical_copies c;
create temp table before_v1 as select public.get_collection_content(pg_temp.parent()) data;
create temp table before_order as select array_agg(id order by sort_position,id) data from public.collection_items where collection_id=pg_temp.parent();

select col_not_null('public','collection_items','is_hidden','Hidden NOT NULL');
select col_default_is('public','collection_items','is_hidden','false','New items default visible');
select ok(not exists(select 1 from public.collection_items where is_hidden),'Historical and fixture items visible by default');
select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""']
  and pronargdefaults=0 and prorettype='jsonb'::regtype,'Hide volatile definer, empty path, JSONB, no defaults')
  from pg_proc where oid='public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid)'::regprocedure;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='set_collection_item_hidden'),1::bigint,'No overload');
select ok(has_function_privilege('authenticated','public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid)','EXECUTE'),'Authenticated EXECUTE');
select ok(not has_function_privilege(r,'public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid)','EXECUTE'),r||' EXECUTE closed') from unnest(array['anon','service_role']) r;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.set_collection_item_hidden(uuid,uuid,boolean,bigint,uuid)'::regprocedure and a.grantee=0),'PUBLIC EXECUTE closed');
select ok(not has_column_privilege(r,'public.collection_items','is_hidden',p),r||' direct hidden '||p||' denied')
  from unnest(array['anon','authenticated']) r cross join unnest(array['INSERT','UPDATE']) p;
select ok(not has_table_privilege(r,t,p),r||' direct '||p||' denied: '||t)
  from unnest(array['anon','authenticated','service_role']) r cross join
  unnest(array['private.collection_order_intents','private.collection_operation_receipts']) t cross join
  unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select ok(reloptions @> array['security_invoker=true'],'Dashboard remains invoker') from pg_class where oid='public.dashboard_collections'::regclass;
select is(array(select attname::text from pg_attribute where attrelid='public.dashboard_collections'::regclass and attnum>0 order by attnum),
  array['collection_id','name','collection_type','access','target_type','target_name','owned_count','total_count','target_primary_type','target_secondary_type','target_id'],'Eleven historical view columns unchanged');

set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
set local role authenticated;
select is(pg_temp.progress(),'[2,5]'::jsonb,'Multiple owner copies count one item; recipient possession excluded');
insert into results values('hide',pg_temp.hide());
select is((select result from results where label='hide'),jsonb_build_object('operation_id',pg_temp.op(600),'outcome','changed','personal_revision','3','collection_item_id',pg_temp.item(1)),'Changed exact result');
select is(pg_temp.hide(),(select result from results where label='hide'),'Identical retry returns historical result');
insert into results values('noop',pg_temp.hide(1,true,3,601));
select is((select result->>'outcome' from results where label='noop'),'noop','Same state no-op');
select is((select result->>'personal_revision' from results where label='noop'),'3','No-op no increment');
select is(pg_temp.progress(),'[1,4]'::jsonb,'Owned automatic hidden excluded from both counts');
select is((public.get_collection_content_v2(pg_temp.parent())->'items'->0->>'owned')::boolean,true,'Hidden owned item stays owned');
select is((public.get_collection_content_v2(pg_temp.parent())->'items'->0->>'is_hidden')::boolean,true,'Reader exposes persisted hidden state');
select is(jsonb_array_length(public.get_collection_content_v2(pg_temp.parent())->'items'),5,'Reader retains every hidden/visible item');
reset role;
select results_eq($$select to_jsonb(i)-'is_hidden'-'updated_at' from public.collection_items i order by id$$,$$select data from before_items order by data->>'id'$$,'All item business fields preserved; existing timestamp trigger retained');
select results_eq($$select to_jsonb(e) from private.collection_order_intents e order by collection_id,sequence$$,$$select data from before_intents order by data->>'collection_id',(data->>'sequence')::bigint$$,'Entire journal and R1 suffixes preserved');
select results_eq($$select to_jsonb(c) from public.physical_copies c order by id$$,$$select data from before_copies order by data->>'id'$$,'Copies and notes exactly preserved');
select is(public.get_collection_content(pg_temp.parent()),(select data from before_v1),'V1 full historical content unchanged');
select is((select array_agg(id order by sort_position,id) from public.collection_items where collection_id=pg_temp.parent()),(select data from before_order),'Order and identities unchanged');
select is((select personal_revision from public.collections where id=pg_temp.parent()),3::bigint,'Single increment despite retry and noop');
select is((select count(*) from private.collection_operation_receipts where collection_id=pg_temp.parent()),2::bigint,'Changed and noop each have one receipt');
select ok(kind='hide' and accepted_revision=3 and result=(select result from results where label='hide')
  and request_hash=encode(sha256(convert_to(jsonb_build_array('set_collection_item_hidden',pg_temp.parent(),pg_temp.item(1),true,'2')::text,'UTF8')),'hex'),'Canonical hide fingerprint includes state and expected revision')
  from private.collection_operation_receipts where operation_id=pg_temp.op(600);
select is(array(select jsonb_object_keys((select result from results where label='hide')) order by 1),array['collection_item_id','operation_id','outcome','personal_revision'],'MutationResult exactly four keys');
select is(jsonb_typeof((select result->'personal_revision' from results where label='hide')),'string','Revision JSON string');
select is(array(select jsonb_object_keys(public.get_collection_content_v2(pg_temp.parent())) order by 1),array['items','order_contract_version','personal_revision'],'Reader three-key envelope');
select is((select count(*) from jsonb_object_keys(x)),16::bigint,'Every item exactly sixteen keys') from jsonb_array_elements(public.get_collection_content_v2(pg_temp.parent())->'items') x;
select is(x-'is_hidden',v1,'All fifteen legacy values retained') from jsonb_array_elements(public.get_collection_content_v2(pg_temp.parent())->'items') with ordinality v2(x,n)
  join jsonb_array_elements(public.get_collection_content(pg_temp.parent())) with ordinality old(v1,n) using(n);

set local role authenticated;
select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(5),'start',null,3,pg_temp.op(602));
select is(pg_temp.hide(1,false,4,603)->>'outcome','changed','Redisplay accepted after reorder');
select is(pg_temp.progress(),'[2,5]'::jsonb,'Redisplay restores owned numerator and denominator');
select is(pg_temp.hide(),(select result from results where label='hide'),'Historical hide retry survives reorder and inverse mutation');
select is(public.get_collection_operation_result(pg_temp.parent(),pg_temp.op(600)),(select result from results where label='hide'),'Secure receipt returns stored historical result');
reset role;
select ok(not is_hidden,'Historical retry never reapplies hiding') from public.collection_items where id=pg_temp.item(1);
select is((select array_agg(sequence order by sequence) from private.collection_order_intents where collection_id=pg_temp.parent()),array[1,2,4]::bigint[],'Hide revision creates legal gap, no new intention');
create temp table stable as select pg_temp.state() data;
set local role authenticated;
select throws_ok(sql,code,message,label) from (values
  ('select pg_temp.hide(1,false,2,600)','23505','operation_id_conflict','UUID different state'),
  ('select pg_temp.hide(3,true,2,600)','23505','operation_id_conflict','UUID different subject'),
  ('select pg_temp.hide(1,true,3,600)','23505','operation_id_conflict','UUID different revision'),
  ('select pg_temp.hide(1,true,4,604)','40001','collection_structure_conflict','Stale revision'),
  ('select pg_temp.hide(2,true,5,604)','23514','collection_item_hidden_invalid','Manual cannot hide'),
  ('select pg_temp.hide(2,false,5,604)','23514','collection_item_hidden_invalid','Manual cannot even no-op hide'),
  ('select pg_temp.hide(6,true,1,604,2)','23514','collection_item_hidden_invalid','Free collection ineligible'),
  ('select pg_temp.hide(1,true,0,604,3)','23514','order_contract_upgrade_required','Legacy ineligible'),
  ('select pg_temp.hide(8,true,0,604,8)','23514','order_contract_upgrade_required','Legacy automatic ineligible'),
  ('select pg_temp.hide(6,true,5,604)','P0002','collection_item_unavailable','Other-parent item'),
  ('select pg_temp.hide(99,true,5,604)','P0002','collection_item_unavailable','Missing item'),
  ('select pg_temp.hide(null,true,5,604)','22023','collection_operation_invalid','NULL item'),
  ('select pg_temp.hide(1,null,5,604)','22023','collection_operation_invalid','NULL boolean'),
  ('select pg_temp.hide(1,true,null,604)','22023','collection_operation_invalid','NULL revision'),
  ('select pg_temp.hide(1,true,-1,604)','22023','collection_operation_invalid','Negative revision'),
  ('select pg_temp.hide(1,true,5,null)','22023','collection_operation_invalid','NULL UUID'),
  ('select pg_temp.hide(1,true,5,602)','23505','operation_id_conflict','Move UUID collides with hide'),
  ($$select public.reorder_collection_item_v2(pg_temp.parent(),pg_temp.item(5),'end',null,2,pg_temp.op(600))$$,'23505','operation_id_conflict','Hide UUID collides with move'),
  ($$select public.add_manual_collection_item_v2(pg_temp.parent(),-95007,'end',2,pg_temp.op(600))$$,'23505','operation_id_conflict','Hide UUID collides with add'),
  ('select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(2),2,pg_temp.op(600))','23505','operation_id_conflict','Hide UUID collides with remove')
) v(sql,code,message,label);
reset role;
select is(pg_temp.state(),(select data from stable),'All failures fully preserve data and receipts');

savepoint progression;
set local role authenticated;
select pg_temp.hide(1,true,5,610);
select pg_temp.hide(3,true,6,611);
select is(pg_temp.progress(),'[1,3]'::jsonb,'Missing hidden automatic also excluded');
select pg_temp.hide(5,true,7,612);
select is(pg_temp.progress(),'[1,2]'::jsonb,'All automatics hidden; both manuals counted');
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(2),8,pg_temp.op(613));
select public.remove_manual_collection_item_v2(pg_temp.parent(),pg_temp.item(4),9,pg_temp.op(614));
select is(pg_temp.progress(),'[0,0]'::jsonb,'Only hidden automatics yields 0/0');
select is(jsonb_array_length(public.get_collection_content_v2(pg_temp.parent())->'items'),3,'0/0 still has three full content items');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(pg_temp.progress(),'[0,0]'::jsonb,'Share same authoritative 0/0');
select is((select count(*) from jsonb_array_elements(public.get_collection_content_v2(pg_temp.parent())->'items') x where (x->>'owned')::boolean),1::bigint,'Share still reads owner possession on hidden automatic');
rollback to progression;
set constraints all deferred;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
reset role;

-- Persisted hidden state is already an input of the unchanged pure 8B engine.
savepoint future_projection;
select pg_temp.hide(1,true,5,620);
create temp table replay as select private.merge_collection_relative_order(pg_temp.parent(),
  array(select row(v,r)::private.collection_order_canonical_entry from unnest(array[-95001,-95002,-95003,-95005,-95007]::bigint[]) with ordinality c(v,r)),
  array(select row(collection_id,id,variant_id,origin,automatic_rank,introduced_revision,is_hidden)::private.collection_order_item_entry from public.collection_items where collection_id=pg_temp.parent() order by id),
  array(select e from private.collection_order_intents e where collection_id=pg_temp.parent() order by sequence)) data;
select is((x->>'is_hidden')::boolean,true,'Retained automatic preserves real hidden state') from replay,jsonb_array_elements(data->'final_order') x where x->>'variant_id'='-95001';
select is((x->>'is_hidden')::boolean,false,'Converted/new automatic visible in existing engine') from replay,jsonb_array_elements(data->'final_order') x where x->>'variant_id' in('-95002','-95007');
select throws_ok($$update public.collection_items set origin='automatic',automatic_rank=4,is_hidden=true where id=pg_temp.item(2)$$,'23514','collection_item_hidden_invalid','Conversion cannot begin hidden');
update public.collection_items set origin='automatic',automatic_rank=4 where id=pg_temp.item(2);
select ok(not is_hidden,'Persisted conversion initially visible') from public.collection_items where id=pg_temp.item(2);
select lives_ok('set constraints all immediate','Conversion preserves initial-placement invariant');
rollback to future_projection;
set constraints all deferred;

-- Local CHECK works even apart from the parent trigger.
savepoint local_check;
set constraints all immediate;
alter table public.collection_items disable trigger collection_items_check_parent;
select throws_ok($$update public.collection_items set is_hidden=true where id=pg_temp.item(2)$$,'23514',null,'CHECK rejects hidden manual without trigger');
rollback to local_check;
select throws_ok($$update public.collection_items set is_hidden=true where id=pg_temp.item(2)$$,'23514','collection_item_hidden_invalid','Parent trigger rejects hidden manual');
select throws_ok($$update public.collection_items set collection_id=pg_temp.parent(2),is_hidden=true where id=pg_temp.item(1)$$,'23514','Free collections only contain manual items','Hidden automatic cannot move to free parent');
select throws_ok($$update public.collections set collection_type='free',automatic_target_type=null,target_set_id=null,applied_target_version=null where id=pg_temp.parent()$$,'23514','collection_type is immutable in V1','Parent invariant protects type changes');

create sequence pg_temp.injection_seen;
create function pg_temp.fail_hide_receipt() returns trigger language plpgsql as $$
begin
  if new.operation_id=pg_temp.op(630) and new.kind='hide'
    and (select is_hidden from public.collection_items where id=pg_temp.item(1))
    and (select personal_revision from public.collections where id=pg_temp.parent())=6 then
    perform nextval('pg_temp.injection_seen'); raise exception 'private injected failure';
  end if;
  return new;
end;
$$;
create trigger test_fail_hide_receipt before insert on private.collection_operation_receipts for each row execute function pg_temp.fail_hide_receipt();
select throws_ok('select pg_temp.hide(1,true,5,630)','XX000','phase8_operation_unexpected','Failure before receipt sanitized');
select ok((select is_called and last_value=1 from pg_temp.injection_seen),'Real hidden update and revision seen before injected error');
select is(pg_temp.state(),(select data from stable),'Complete hidden/revision/journal/receipt rollback');
drop trigger test_fail_hide_receipt on private.collection_operation_receipts;
savepoint retry_failure;
select is(pg_temp.hide(1,true,5,630)->>'outcome','changed','Same failed UUID can succeed after rollback');
rollback to retry_failure;
set constraints all deferred;
savepoint exact_bigint;
update public.collections set personal_revision=9007199254740993 where id=pg_temp.parent();
select is(pg_temp.hide(1,true,9007199254740993,631)->>'personal_revision','9007199254740994','BIGINT above JS safe integer exact');
rollback to exact_bigint;
set constraints all deferred;
savepoint overflow;
update public.collections set personal_revision=9223372036854775807 where id=pg_temp.parent();
create temp table max_state as select pg_temp.state() data;
select is(pg_temp.hide(1,false,9223372036854775807,632)->>'personal_revision','9223372036854775807','Max BIGINT noop supported');
select throws_ok('select pg_temp.hide(1,true,9223372036854775807,633)','XX000','phase8_operation_unexpected','Overflow sanitized');
select ok(not is_hidden,'Overflow restores hidden flag') from public.collection_items where id=pg_temp.item(1);
rollback to overflow;
set constraints all deferred;

create function pg_temp.denied(id text,aal text,label text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal',aal)::text,true);
  return next throws_ok('select pg_temp.hide()','42501','collection_action_unavailable',label||' historical retry denied');
  return next throws_ok('select pg_temp.hide(1,true,5,640)','42501','collection_action_unavailable',label||' new operation denied');
end;
$$;
grant execute on function pg_temp.denied(text,text,text) to authenticated;
set local role authenticated;
select pg_temp.denied(id,aal,label) from (values
  ('a2500000-0000-0000-0000-000000000001','aal1','Owner AAL1'),
  ('a2500000-0000-0000-0000-000000000002','aal2','Shared recipient'),
  ('a2500000-0000-0000-0000-000000000003','aal2','Third party'),
  ('a2500000-0000-0000-0000-000000000004','aal2','Missing profile'),
  (null,'aal2','No session')) v(id,aal,label);
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok('select pg_temp.hide(1,true,0,640,6)','42501','collection_action_unavailable','Foreign parent');
select throws_ok('select pg_temp.hide(1,true,0,640,99)','42501','collection_action_unavailable','Missing parent');
select throws_ok('select public.set_collection_item_hidden(null,pg_temp.item(1),true,5,pg_temp.op(640))','42501','collection_action_unavailable','NULL parent safely denied');
select throws_ok($$update public.collection_items set is_hidden=true where id=pg_temp.item(1)$$,'42501',null,'Direct browser hidden update denied');
select is(public.get_collection_content_v2(pg_temp.parent(4))->'items','[]'::jsonb,'Visible empty remains empty envelope');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(pg_temp.progress(),'[2,5]'::jsonb,'Share same owner progression despite recipient copy');
reset role;
savepoint revoked;
delete from public.collection_shares where collection_id=pg_temp.parent();
set local role authenticated;
select is(public.get_collection_content_v2(pg_temp.parent()),null::jsonb,'Revoked share invisible');
select is(pg_temp.progress(),null::jsonb,'Revoked share no progress');
rollback to revoked;
set constraints all deferred;
set local role anon;
select throws_ok('select pg_temp.hide()','42501',null,'Anonymous EXECUTE denied');
reset role;
select is(pg_temp.state(),(select data from stable),'All security refusals preserve data');
select lives_ok('set constraints all immediate','Final deferred invariants valid');
select * from finish();
rollback;
