begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir automatic_collection.fixtures.inc

select col_default_is('public','collections','order_contract_version','2','New parents default to contract 2');
select col_default_is('public','collections','personal_revision','0','New parents start at revision zero');
select ok(not has_column_privilege('authenticated','public.collections',c,p),c || ' cannot be client-selected via ' || p)
  from unnest(array['order_contract_version','personal_revision']) c cross join unnest(array['INSERT','UPDATE']) p;

-- Historical parent: explicit v1 fixture, unchanged even if target/name become invalid.
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,applied_target_version,order_contract_version)
values('c3000000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000003','Historical automatic','automatic','pokemon',-82001,7,1);
insert into public.collection_items(collection_id,variant_id,origin,automatic_rank,sort_position)
values('c3000000-0000-0000-0000-000000000001',-82101,'automatic',1,42);
create temp table historical as select to_jsonb(c) parent, public.get_collection_content(c.id) items
  from public.collections c where c.id='c3000000-0000-0000-0000-000000000001';
create temp table parents(label text, id uuid, created boolean);
create temp table gestures(label text, result jsonb);
grant select,insert on parents,gestures to authenticated;

set local role authenticated;
set local request.jwt.claims='{"sub":"a1100000-0000-0000-0000-000000000001","aal":"aal2"}';
with c as (insert into public.collections(name,collection_type) values('Activation free','free') returning id)
insert into parents select 'free',id,true from c;
insert into parents select 'pokemon',collection_id,created from public.create_automatic_collection('Activation Pokémon','pokemon',-82001);
insert into parents select 'set',collection_id,created from public.create_automatic_collection('Activation Extension','set',-82001);
insert into parents select 'reopen',collection_id,created from public.create_automatic_collection(null,'pokemon',-82001);
select ok((select bool_and(order_contract_version=2 and personal_revision=0) from public.collections where id in(select id from parents)),
  'All creation paths select contract 2/0');
select is((select id from parents where label='reopen'),(select id from parents where label='pokemon'),'Reopen preserves UUID');
select is((select created from parents where label='reopen'),false,'Reopen reports created=false');
select is(public.get_collection_content_v2((select id from parents where label='free')),
  '{"order_contract_version":2,"personal_revision":"0","items":[]}'::jsonb,'Free creation starts empty');
select results_eq($$select variant_id,origin,automatic_rank,sort_position::text,introduced_revision
  from public.collection_items where collection_id=(select id from parents where label='pokemon') order by automatic_rank$$,
  $$values (-82101::bigint,'automatic'::text,1::bigint,'1.00000000000000000000'::text,null::bigint),
  (-9007199254740995::bigint,'automatic'::text,2::bigint,'2.00000000000000000000'::text,null::bigint)$$,
  'Pokémon canonical IDs, origins, ranks, positions and NULL introductions preserved');
select results_eq($$select variant_id from public.collection_items where collection_id=(select id from parents where label='set') order by sort_position,id$$,
  $$values (-82103::bigint),(-82101::bigint),(-9007199254740995::bigint)$$,'Extension canonical complete sorted unique');
select throws_ok($$insert into public.collections(name,collection_type,order_contract_version) values('Forced legacy','free',1)$$,'42501',null,'Client cannot force legacy');
select throws_ok($$insert into public.collections(name,collection_type,order_contract_version) values('Forced v2','free',2)$$,'42501',null,'Client cannot explicitly select v2');
select throws_ok($$insert into public.collections(name,collection_type,personal_revision) values('Forced revision','free',5)$$,'42501',null,'Client cannot force revision');
reset role;
select is((select count(*) from private.collection_order_intents where collection_id in(select id from parents)),0::bigint,'No artificial initial intentions');
select is((select count(*) from private.collection_operation_receipts where collection_id in(select id from parents)),0::bigint,'No artificial initial receipts');

-- Full lifecycle begins with an actual column-limited creation, never a v2 fixture promotion.
set local role authenticated;
insert into gestures values('a',public.add_manual_collection_item_v2((select id from parents where label='free'),-82101,'end',0,'e3000000-0000-0000-0000-000000000001'));
insert into gestures values('noop',public.reorder_collection_item_v2((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='a'),'start',null,1,'e3000000-0000-0000-0000-000000000002'));
insert into gestures values('b',public.add_manual_collection_item_v2((select id from parents where label='free'),-82103,'start',1,'e3000000-0000-0000-0000-000000000003'));
insert into gestures values('move',public.reorder_collection_item_v2((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='a'),'before',(select (result->>'collection_item_id')::uuid from gestures where label='b'),2,'e3000000-0000-0000-0000-000000000004'));
insert into gestures values('c',public.add_manual_collection_item_v2((select id from parents where label='free'),-9007199254740995,'end',3,'e3000000-0000-0000-0000-000000000005'));
insert into public.physical_copies(variant_id,name,note) values(-82103,'Lifecycle copy','Preserved note');
select throws_ok($$select public.add_manual_collection_item_v2((select id from parents where label='free'),-82103,'end',0,'e3000000-0000-0000-0000-000000000090')$$,
  '40001','collection_structure_conflict','Stale revision cannot cause second gesture');
insert into gestures values('remove',public.remove_manual_collection_item_v2((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='b'),4,'e3000000-0000-0000-0000-000000000006'));
select is(public.remove_manual_collection_item_v2((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='b'),4,'e3000000-0000-0000-0000-000000000006'),
  (select result from gestures where label='remove'),'Remove retry returns historical receipt after disappearance');
insert into gestures values('reintroduced',public.add_manual_collection_item_v2((select id from parents where label='free'),-82103,'end',5,'e3000000-0000-0000-0000-000000000007'));
select isnt((select result->>'collection_item_id' from gestures where label='reintroduced'),(select result->>'collection_item_id' from gestures where label='b'),'Reintroduction gets new identity');
select is((select personal_revision from public.collections where id=(select id from parents where label='free')),6::bigint,'Six effective gestures increment exactly once');
select results_eq($$select variant_id from public.collection_items where collection_id=(select id from parents where label='free') order by sort_position,id$$,
  $$values (-82101::bigint),(-9007199254740995::bigint),(-82103::bigint)$$,'Materialized order after lifecycle');
select is(public.get_collection_content_v2((select id from parents where label='free'))->>'personal_revision','6','Displayed revision equals materialized revision');
select is(public.get_collection_operation_result((select id from parents where label='free'),'e3000000-0000-0000-0000-000000000006'),
  (select result from gestures where label='remove'),'Receipt retrieval never restores removed subject');
select results_eq($$select owned_count,total_count from public.dashboard_collections where collection_id=(select id from parents where label='free')$$,
  $$values (1::bigint,3::bigint)$$,'Dashboard counts restored possession after reintroduction');
select is((select note from public.physical_copies where variant_id=-82103),'Preserved note','Copies and notes survive removal/reintroduction');
select throws_ok($$select public.add_manual_collection_item((select id from parents where label='free'),-82101)$$,'23514','order_contract_upgrade_required','Legacy add cannot mutate new parent');
select throws_ok($$select public.reorder_collection_item((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='a'),'end',null)$$,'23514','order_contract_upgrade_required','Legacy reorder cannot mutate new parent');
select throws_ok($$select public.remove_manual_collection_item((select id from parents where label='free'),(select (result->>'collection_item_id')::uuid from gestures where label='a'))$$,'23514','order_contract_upgrade_required','Legacy remove cannot mutate new parent');
reset role;
select results_eq($$select sequence,kind from private.collection_order_intents where collection_id=(select id from parents where label='free') order by sequence$$,
  $$values (1::bigint,'manual_add'::text),(3::bigint,'move'::text),(4::bigint,'manual_add'::text),(6::bigint,'manual_add'::text)$$,'Chronology complete for living subjects; no noop or removed subject intentions');
select is((select anchor_item_id from private.collection_order_intents where operation_id='e3000000-0000-0000-0000-000000000004'),
  (select (result->>'collection_item_id')::uuid from gestures where label='b'),'Historical deleted anchor retained');
select is((select count(*) from private.collection_order_intents where subject_item_id=(select (result->>'collection_item_id')::uuid from gestures where label='reintroduced')),
  1::bigint,'Reintroduced subject inherits no customization');
select is((select count(*) from private.collection_operation_receipts where collection_id=(select id from parents where label='free')),7::bigint,'One receipt per successful UUID including noop');
set constraints all immediate;
select pass('Real new-parent lifecycle satisfies deferred placement invariant');
set constraints all deferred;

-- Automatic gestures keep canonical rank independent; native automatic cannot be removed.
set local role authenticated;
insert into gestures values('automove',public.reorder_collection_item_v2((select id from parents where label='pokemon'),
  (select id from public.collection_items where collection_id=(select id from parents where label='pokemon') and variant_id=-9007199254740995),'start',null,0,'e3000000-0000-0000-0000-000000000010'));
insert into gestures values('automanual',public.add_manual_collection_item_v2((select id from parents where label='pokemon'),-82103,'end',1,'e3000000-0000-0000-0000-000000000011'));
select throws_ok($$select public.remove_manual_collection_item_v2((select id from parents where label='pokemon'),
  (select id from public.collection_items where collection_id=(select id from parents where label='pokemon') and variant_id=-82101),2,'e3000000-0000-0000-0000-000000000012')$$,
  '23514','automatic_item_removal_forbidden','Automatic removal stays forbidden');
insert into gestures values('autoremoval',public.remove_manual_collection_item_v2((select id from parents where label='pokemon'),
  (select (result->>'collection_item_id')::uuid from gestures where label='automanual'),2,'e3000000-0000-0000-0000-000000000013'));
select results_eq($$select variant_id from public.collection_items where collection_id=(select id from parents where label='pokemon') order by sort_position,id$$,
  $$values (-9007199254740995::bigint),(-82101::bigint)$$,'Personal automatic order changes');
select results_eq($$select variant_id from public.collection_items where collection_id=(select id from parents where label='pokemon') order by automatic_rank$$,
  $$values (-82101::bigint),(-9007199254740995::bigint)$$,'Canonical automatic ranks unchanged');
reset role;

update public.automatic_target_states set content_hash='invalid-on-purpose' where id=-82001;
set local role authenticated;
set local request.jwt.claims='{"sub":"a1100000-0000-0000-0000-000000000003","aal":"aal2"}';
insert into parents select 'legacy',collection_id,created from public.create_automatic_collection(null,'pokemon',-82001);
select is((select created from parents where label='legacy'),false,'Existing v1 returned before name/hash revalidation');
reset role;
select is((select to_jsonb(c) from public.collections c where id='c3000000-0000-0000-0000-000000000001'),(select parent from historical),'Existing v1 parent unchanged');
select is(public.get_collection_content('c3000000-0000-0000-0000-000000000001'),(select items from historical),'Existing v1 content positions and identity unchanged');

-- Creation and its native materialization disappear together on rollback.
savepoint creation_rollback;
set local role authenticated;
insert into parents select 'rolled-back',collection_id,created from public.create_automatic_collection('Rollback Extension','set',-82001);
reset role;
set constraints all immediate;
rollback to creation_rollback;
set constraints all deferred;
select is((select count(*) from public.collections where owner_id='a1100000-0000-0000-0000-000000000003' and target_set_id=-82001),0::bigint,'Rollback leaves no parent or canonical content');

select ok(not has_function_privilege(r,'private.raise_collection_structure_conflict()','EXECUTE'),r || ' cannot call internal error renderer')
  from unnest(array['anon','authenticated','service_role']) r;
select throws_ok($$select private.raise_collection_structure_conflict()$$,'40001','collection_structure_conflict','Direct SQL conflict retains documented SQLSTATE');
set local request.jwt.claims='{"sub":"a1100000-0000-0000-0000-000000000001","aal":"aal2"}';
set local request.method='POST';
select throws_ok($$select public.reorder_collection_item_v2((select id from parents where label='free'),
  (select (result->>'collection_item_id')::uuid from gestures where label='a'),'end',null,0,'e3000000-0000-0000-0000-000000000099')$$,
  'PGRST','{"code":"40001","message":"collection_structure_conflict","details":null,"hint":null}',
  'HTTP context receives structured definitive conflict without transaction retry');
set local request.method='';
select is((select personal_revision from public.collections where id=(select id from parents where label='free')),6::bigint,'Error rendering cannot mutate revision');

select * from finish();
rollback;
