-- Prepared for manual Phase 6A.3 application. Never replay the migration here.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir collection_reorder.fixtures.inc

select has_function('public','reorder_collection_item',array['uuid','uuid','text','uuid'],'Narrow reorder RPC exists');
select ok((select not prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid='public.get_collection_item_order(uuid)'::regprocedure),'Order reader is invoker with fixed search_path');
select ok(not has_function_privilege(role_name,'public.get_collection_item_order(uuid)','EXECUTE'),role_name || ' cannot call order reader')
  from unnest(array['anon','service_role']) role_name;
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid='public.reorder_collection_item(uuid,uuid,text,uuid)'::regprocedure),'Definer has fixed empty search_path');
select ok(has_function_privilege('authenticated','public.reorder_collection_item(uuid,uuid,text,uuid)','EXECUTE'),'Authenticated can call RPC');
select ok(not has_function_privilege(role_name,'public.reorder_collection_item(uuid,uuid,text,uuid)','EXECUTE'),role_name || ' cannot call RPC')
  from unnest(array['anon','service_role']) role_name;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.reorder_collection_item(uuid,uuid,text,uuid)'::regprocedure and a.grantee=0),'No PUBLIC execute grant');
select ok(not has_table_privilege('authenticated','public.collection_items','INSERT,UPDATE,DELETE'),'Direct writes stay closed');
select ok(not has_column_privilege('authenticated','public.collection_items','sort_position','UPDATE'),'No direct position grant');
select ok((select relrowsecurity from pg_class where oid='public.collection_items'::regclass),'RLS still enabled');

create temp table item_invariants as select id,to_jsonb(i)-'sort_position'-'updated_at' as data
  from public.collection_items i where collection_id in ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002');
create temp table parents as select id,to_jsonb(c) as data from public.collections c
  where id in ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002');
create temp table target_state as select to_jsonb(s) as data from public.automatic_target_states s where id=-85001;
create temp table variant_count as select count(*) as n from public.catalog_variants;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000001","aal":"aal2"}';
select is(public.get_collection_item_order('c1500000-0000-0000-0000-000000000001'),
  array['d1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000002','d1500000-0000-0000-0000-000000000003']::uuid[], 'Order RPC returns IDs only in authoritative order');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','start')$$,'Owner moves to beginning');
select results_eq($$select variant_id from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[-85003,-85001,-85002]::bigint[],'Beginning order');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','end')$$,'Owner moves to end');
select results_eq($$select variant_id from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[-85001,-85002,-85003]::bigint[],'End order');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','before','d1500000-0000-0000-0000-000000000002')$$,'Move between two items');
select results_eq($$select sort_position from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[1,1.5,2]::numeric[],'Exact midpoint, neighbours unchanged');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','after','d1500000-0000-0000-0000-000000000002')$$,'Automatic item can move after an anchor');
select results_eq($$select variant_id from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[-85003,-85002,-85001]::bigint[],'Automatic rank never resets display order');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','after','d1500000-0000-0000-0000-000000000002')$$,'Retry is a no-op');
select results_eq($$select sort_position from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[1.5,2,3]::numeric[],'Retry keeps exact positions');
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000002','d1500000-0000-0000-0000-000000000004','end')$$,'Single-item custom collection remains valid');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000004','start')$$,'P0002','reorder_item_unavailable','Foreign collection item refused');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','before','d1500000-0000-0000-0000-000000000004')$$,'P0002','reorder_item_unavailable','Foreign anchor refused');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000099','start')$$,'P0002','reorder_item_unavailable','Missing item refused');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','before','d1500000-0000-0000-0000-000000000001')$$,'22023','reorder_invalid_move','Self-anchor refused');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','before')$$,'22023','reorder_invalid_move','Missing anchor refused');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','reset')$$,'22023','reorder_invalid_move','No reset contract');

set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select count(*) from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001'),3::bigint,'Shared recipient reads items');
select is(cardinality(public.get_collection_item_order('c1500000-0000-0000-0000-000000000001')),3,'Shared recipient reads order');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','start')$$,'42501','reorder_not_authorized','Shared recipient cannot reorder');
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000003","aal":"aal2"}';
select is(public.get_collection_item_order('c1500000-0000-0000-0000-000000000001'),'{}'::uuid[],'Order reader respects third-party RLS');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','start')$$,'42501','reorder_not_authorized','Third party cannot reorder');
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000001","aal":"aal1"}';
select is(public.get_collection_item_order('c1500000-0000-0000-0000-000000000001'),'{}'::uuid[],'Order reader respects MFA RLS');
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','start')$$,'42501','reorder_not_authorized','MFA required');
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000099","aal":"aal2"}';
select throws_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','start')$$,'42501','reorder_not_authorized','Residual JWT without profile refused');

reset role;
-- Force adjacent positions at the smallest representable distance.
update public.collection_items set sort_position=case variant_id when -85001 then 1 when -85002 then 1.00000000000000000001 else 3 end
  where collection_id='c1500000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1500000-0000-0000-0000-000000000001","aal":"aal2"}';
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','before','d1500000-0000-0000-0000-000000000002')$$,'Precision exhaustion rebalances');
select results_eq($$select variant_id,sort_position from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  $$values (-85001::bigint,1::numeric),(-85003,2),(-85002,3)$$,'Rebalance preserves exact requested order');

reset role;
update public.collection_items set sort_position=1 where collection_id='c1500000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','start')$$,'Legacy tied positions rebalanced deterministically');
select results_eq($$select variant_id from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[-85003,-85001,-85002]::bigint[],'UUID tie-break preserved before insertion');

reset role;
update public.collection_items set sort_position=case variant_id when -85001 then -99999999999999999999.99999999999999999999 when -85002 then 0 else 99999999999999999999.99999999999999999999 end
  where collection_id='c1500000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000003','start')$$,'Negative numeric edge rebalanced without overflow');
reset role;
update public.collection_items set sort_position=case variant_id when -85001 then -1 when -85002 then 0 else 99999999999999999999.99999999999999999999 end
  where collection_id='c1500000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.reorder_collection_item('c1500000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','end')$$,'Positive numeric edge rebalanced without overflow');
select results_eq($$select variant_id from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[-85002,-85003,-85001]::bigint[],'Edge rebalance retains intended order');
select is((select count(distinct sort_position) from public.collection_items where collection_id='c1500000-0000-0000-0000-000000000001'),3::bigint,'No duplicate positions');
select is((select sort_position from public.collection_items where id='d1500000-0000-0000-0000-000000000004'),1::numeric,'Other collection untouched');

reset role;
select results_eq($$select id,to_jsonb(i)-'sort_position'-'updated_at' from public.collection_items i
  where collection_id in ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002') order by id$$,
  $$select id,data from item_invariants order by id$$,'All items preserved: IDs, variants, origin, automatic_rank and creation metadata');
select results_eq($$select id,to_jsonb(c) from public.collections c where id in ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002') order by id$$,
  $$select id,data from parents order by id$$,'Targets, applied versions and all parent fields untouched');
select results_eq($$select to_jsonb(s) from public.automatic_target_states s where id=-85001$$,$$select data from target_state$$,'Canonical hashes and versions untouched');
select is((select count(*) from public.catalog_variants),(select n from variant_count),'No variants created or deleted');
select * from finish();
rollback;
