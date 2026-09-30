begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir manual_collection_items.fixtures.inc

select ok(prosecdef and provolatile='v' and proconfig @> array['search_path=""'], proname || ' safe definer')
  from pg_proc where oid in ('public.add_manual_collection_item(uuid,bigint,text)'::regprocedure,
    'public.remove_manual_collection_item(uuid,uuid)'::regprocedure);
select ok(has_function_privilege('authenticated', f, 'EXECUTE'), f || ' callable by authenticated')
  from unnest(array['public.add_manual_collection_item(uuid,bigint,text)','public.remove_manual_collection_item(uuid,uuid)']) f;
select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' cannot execute ' || f)
  from unnest(array['anon','service_role']) r cross join
    unnest(array['public.add_manual_collection_item(uuid,bigint,text)','public.remove_manual_collection_item(uuid,uuid)']) f;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid in ('public.add_manual_collection_item(uuid,bigint,text)'::regprocedure,
    'public.remove_manual_collection_item(uuid,uuid)'::regprocedure) and a.grantee=0),'No PUBLIC grants');
select ok(not has_table_privilege('authenticated','public.collection_items','INSERT,UPDATE,DELETE'),'Direct table writes closed');
select ok(not has_any_column_privilege('authenticated','public.collection_items','INSERT,UPDATE'),'Direct column writes closed');
select ok((select relrowsecurity from pg_class where oid='public.collection_items'::regclass),'RLS retained');

create temp table parents as select id,to_jsonb(c) data from public.collections c where id::text like 'c170%';
create temp table targets as select to_jsonb(s) data from public.automatic_target_states s where id=-87001;
create temp table catalogue as
  select 'v' kind,id,to_jsonb(v) data from public.catalog_variants v where source_card_id between -87003 and -87001
  union all select 'c',id,to_jsonb(c) from public.source_cards c where id between -87003 and -87001
  union all select 's',id,to_jsonb(s) from public.tcg_sets s where id between -87002 and -87001;
create temp table copies as select id,to_jsonb(c) data from public.physical_copies c where user_id::text like 'a170%';
create temp table added(label text, id uuid);
grant select,insert on added to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal2"}';
insert into added values ('empty',public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',9007199254740995));
select results_eq($$select id,variant_id,origin,automatic_rank,sort_position from public.collection_items
  where collection_id='c1700000-0000-0000-0000-000000000002'$$,
  $$select id,9007199254740995::bigint,'manual'::text,null::bigint,1::numeric from added where label='empty'$$,
  'Empty custom collection: exact BIGINT, returned UUID, manual, no rank, position 1; local MY source absent accepted');
select is(public.get_collection_content('c1700000-0000-0000-0000-000000000002')->0->>'variant_id',
  '9007199254740995','Read contract retains lossless decimal string');
insert into added values ('start',public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003,'start'));
insert into added values ('end',public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87004,'end'));
insert into added values ('default',public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',9007199254740995));
select results_eq($$select variant_id,sort_position from public.collection_items
  where collection_id='c1700000-0000-0000-0000-000000000001' order by sort_position,id$$,
  $$values (-87003::bigint,0::numeric),(-87001,1),(-87002,2),(-87004,3),(9007199254740995,4)$$,
  'Automatic collection: start, end and default end in exact authoritative order');
select ok((select bool_and(origin='manual' and automatic_rank is null) from public.collection_items
  where id in (select id from added)), 'Every added item is manual without automatic rank');

reset role;
create temp table before_duplicate as select id,to_jsonb(i) data from public.collection_items i where collection_id::text like 'c170%';
set local role authenticated;
select throws_ok(format('select public.add_manual_collection_item(%L,%s,%L)',
  'c1700000-0000-0000-0000-000000000001',v,'start'),'23505','already_present','Duplicate refused: ' || v)
  from unnest(array[-87001::bigint,-87002,9007199254740995]) v;
select throws_ok(format('select public.add_manual_collection_item(%L,-87003,%L)',
  'c1700000-0000-0000-0000-000000000002',p),'22023','manual_item_invalid_placement','Invalid placement: ' || coalesce(p,'NULL'))
  from unnest(array['before','after','START','',null]) p;
select throws_ok(format('select public.add_manual_collection_item(%L,%s)',
  'c1700000-0000-0000-0000-000000000002',coalesce(v::text,'null')),'P0002','manual_variant_unavailable','Ineligible or absent variant: ' || coalesce(v::text,'NULL'))
  from unnest(array[-87999::bigint,-87005,-87006,-87007,-87008,-87009,null]) v;
reset role;
select results_eq($$select id,to_jsonb(i) from public.collection_items i where collection_id::text like 'c170%' order by id$$,
  $$select id,data from before_duplicate order by id$$,'Rejected calls neither insert, move, convert nor alter any item');

-- Both operations enforce every authorization condition before revealing items.
set local role authenticated;
set local request.jwt.claims = '{}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Missing session cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Missing session cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal1"}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Insufficient MFA cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Insufficient MFA cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001"}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Missing MFA cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Missing MFA cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000099","aal":"aal2"}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Missing profile cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Missing profile cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000002","aal":"aal2"}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Share recipient cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Share recipient cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000003","aal":"aal2"}';
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87003)$$,
  '42501','collection_action_unavailable','Third party cannot add');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  '42501','collection_action_unavailable','Third party cannot remove');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok(format('select public.add_manual_collection_item(%L,-87003)',c),'42501','collection_action_unavailable','Absent/null parent add')
  from unnest(array['c1700000-0000-0000-0000-000000000099',null]) c;
select throws_ok(format('select public.remove_manual_collection_item(%L,%L)',c,'d1700000-0000-0000-0000-000000000002'),
  '42501','collection_action_unavailable','Absent/null parent remove')
  from unnest(array['c1700000-0000-0000-0000-000000000099',null]) c;
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000001')$$,
  '23514','automatic_item_removal_forbidden','Automatic item cannot be removed');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000002','d1700000-0000-0000-0000-000000000002')$$,
  'P0002','manual_item_unavailable','Item from different collection refused');
select throws_ok(format('select public.remove_manual_collection_item(%L,%L)','c1700000-0000-0000-0000-000000000001',i),
  'P0002','manual_item_unavailable','Absent/null item refused') from unnest(array['d1700000-0000-0000-0000-000000000099',null]) i;
select lives_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  'Owner removes manual item');
select is((select count(*) from public.collection_items where id='d1700000-0000-0000-0000-000000000002'),0::bigint,'Exactly requested item removed');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002')$$,
  'P0002','manual_item_unavailable','Retry is explicit item unavailable');
reset role;
select results_eq($$select id,to_jsonb(i) from public.collection_items i where collection_id::text like 'c170%' order by id$$,
  $$select id,data from before_duplicate where id<>'d1700000-0000-0000-0000-000000000002' order by id$$,
  'Removal changes no other item, timestamp or position, including other collection');
select results_eq($$select 'v' kind,id,to_jsonb(v) data from public.catalog_variants v where source_card_id between -87003 and -87001
  union all select 'c',id,to_jsonb(c) from public.source_cards c where id between -87003 and -87001
  union all select 's',id,to_jsonb(s) from public.tcg_sets s where id between -87002 and -87001 order by kind,id$$,
  $$select kind,id,data from catalogue order by kind,id$$,'Catalogue including timestamps unchanged');

-- Existing item stays readable and removable after eligibility changes.
update public.catalog_variants set is_active=false where id=9007199254740995;
set local role authenticated;
select is(public.get_collection_content('c1700000-0000-0000-0000-000000000002')->0->>'variant_id',
  '9007199254740995','Historical ineligible item remains readable');
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',9007199254740995)$$,
  '23505','already_present','Existing ineligible variant still duplicate');
select lives_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000002',(select id from added where label='empty'))$$,
  'Ineligible manual item can still be removed');
reset role;
-- Revert fixture-only catalogue mutation with its original timestamps.
update public.catalog_variants v set is_active=true,updated_at=(c.data->>'updated_at')::timestamptz
  from catalogue c where c.kind='v' and v.id=c.id and v.id=9007199254740995;

-- Extreme exact bounds and legacy ties trigger deterministic local rebalance.
update public.collection_items set sort_position=99999999999999999999.99999999999999999999
  where collection_id='c1700000-0000-0000-0000-000000000001';
create temp table tied_order as select array_agg(variant_id order by sort_position,id) ids
  from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000001';
grant select on tied_order to authenticated;
set local role authenticated;
select lives_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87002)$$,'Upper bound and ties rebalance');
select is((select array_agg(variant_id order by sort_position,id) from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000001'),
  (select ids || array[-87002::bigint] from tied_order),'Rebalance retains authoritative UUID tie order and appends');
select results_eq($$select sort_position from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000001' order by sort_position,id$$,
  array[1,2,3,4,5]::numeric[],'Exact compact positions after rebalance');
select lives_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',-87003,'start')$$,'Empty start accepted');
select is((select sort_position from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000002'),1::numeric,'Empty start uses position 1');
reset role;
update public.collection_items set sort_position=-99999999999999999999.99999999999999999999
  where collection_id='c1700000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',-87004,'start')$$,'Lower bound rebalances');
select results_eq($$select variant_id,sort_position from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000002' order by sort_position,id$$,
  $$values (-87004::bigint,0::numeric),(-87003,1)$$,'Start remains strictly before first item');
reset role;
update public.collection_items set sort_position=99999999999999999999.99999999999999999999
  where collection_id='c1700000-0000-0000-0000-000000000002' and variant_id=-87003;
set local role authenticated;
select lives_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',-87002,'end')$$,
  'Upper bound without ties also rebalances');
select results_eq($$select variant_id,sort_position from public.collection_items where collection_id='c1700000-0000-0000-0000-000000000002' order by sort_position,id$$,
  $$values (-87004::bigint,1::numeric),(-87003,2),(-87002,3)$$,'Unique upper-bound order preserved');
select lives_ok($$select public.reorder_collection_item('c1700000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000001','end')$$,
  'Existing reorder interoperates after add/remove');
select results_eq($$select origin,automatic_rank from public.collection_items where id='d1700000-0000-0000-0000-000000000001'$$,
  $$values ('automatic'::text,1::bigint)$$,'Automatic origin and canonical rank preserved');

reset role;
select results_eq($$select id,to_jsonb(c) from public.collections c where id::text like 'c170%' order by id$$,
  $$select id,data from parents order by id$$,'Parent targets, applied versions and timestamps unchanged');
select results_eq($$select to_jsonb(s) from public.automatic_target_states s where id=-87001$$,$$select data from targets$$,'Canonical hash/version untouched');
select results_eq($$select id,to_jsonb(c) from public.physical_copies c where user_id::text like 'a170%' order by id$$,
  $$select id,data from copies order by id$$,'All physical copies preserved, including removed variant');
select results_eq($$select kind,id,data from (
  select 'v' kind,id,to_jsonb(v)-'updated_at' data from public.catalog_variants v where source_card_id between -87003 and -87001
  union all select 'c',id,to_jsonb(c)-'updated_at' from public.source_cards c where id between -87003 and -87001
  union all select 's',id,to_jsonb(s)-'updated_at' from public.tcg_sets s where id between -87002 and -87001) x order by kind,id$$,
  $$select kind,id,data-'updated_at' from catalogue order by kind,id$$,'Catalogue data untouched by RPCs');

-- Unexpected storage errors are not arbitrary PostgreSQL text in the API contract.
create function pg_temp.fail_manual_item() returns trigger language plpgsql as $$
begin raise exception 'internal fixture detail'; end;
$$;
create trigger test_manual_failure before insert or delete on public.collection_items
  for each row execute function pg_temp.fail_manual_item();
set local role authenticated;
select throws_ok($$select public.add_manual_collection_item('c1700000-0000-0000-0000-000000000002',9007199254740995)$$,
  'XX000','manual_item_unexpected','Unexpected insert failure sanitized');
select throws_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001',(select id from added where label='end'))$$,
  'XX000','manual_item_unexpected','Unexpected delete failure sanitized');
select is((select count(*) from public.collection_items where id=(select id from added where label='end')),1::bigint,
  'Failed delete retains item');
reset role;
drop trigger test_manual_failure on public.collection_items;
select * from finish();
rollback;
