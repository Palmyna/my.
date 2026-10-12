begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc
\ir collection_hidden.fixtures.inc
\ir collection_update.fixtures.inc

create function pg_temp.target(ids bigint[],version bigint) returns void language plpgsql as $$
begin
  update public.catalog_variants v set is_active=v.id=any(ids),sort_order=coalesce(array_position(ids,v.id),99) where v.source_card_id=-95001;
  update public.automatic_target_states set generation_version=version,content_hash=(select encode(sha256(convert_to('[' ||
    coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('set',-95001)) where id=-95001;
end;
$$;
create function pg_temp.event() returns jsonb language sql stable as $$
  select to_jsonb(e) from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001') e
    where collection_id='c2500000-0000-0000-0000-000000000001';
$$;
create function pg_temp.business_state() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'parents',(select jsonb_agg(to_jsonb(c) order by id) from public.collections c),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.collection_items i),
    'intents',(select jsonb_agg(to_jsonb(e) order by collection_id,sequence) from private.collection_order_intents e),
    'receipts',(select jsonb_agg(to_jsonb(r) order by collection_id,operation_id) from private.collection_operation_receipts r),
    'reads',(select jsonb_agg(to_jsonb(r) order by collection_id) from private.collection_notification_reads r),
    'announcements',(select jsonb_agg(to_jsonb(a) order by id) from private.notification_announcements a),
    'states',(select jsonb_agg(to_jsonb(s) order by user_id,announcement_id) from private.notification_announcement_states s),
    'copies',(select jsonb_agg(to_jsonb(c) order by id) from public.physical_copies c));
$$;
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);
select is(pg_temp.event(),null::jsonb,'Initial identical canonical has no event');
update public.source_cards set name_fr='Descriptive only' where id=-95001;
select is(pg_temp.event(),null::jsonb,'Descriptive change has no event');
select pg_temp.target(array[-95001,-95003,-95005]::bigint[],9);
select is(pg_temp.event(),null::jsonb,'Higher version with identical structure has no event');
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'update_available','false','Same result as authoritative 8E');
select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],10);
select is(pg_temp.event()->>'notification_key','collection:c2500000-0000-0000-0000-000000000001','Stable parent key');
select is(pg_temp.event()->>'target_version','10','Revision is current target version');
select is(pg_temp.event()->>'applied_target_version','7','Applied version remains untouched');
select is(pg_temp.event()->>'collection_name','V2 mixed','Current parent name projected');
select is(pg_temp.event()->>'is_read','false','Missing state means unread');
select is((pg_temp.event()->>'updated_at')::timestamptz,(select updated_at from public.automatic_target_states where id=-95001),'Timestamp from canonical target state');
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'update_available','true','Useful delta agrees with 8E');
select ok(not exists(select 1 from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),'Detection never creates read tracking');
select ok(not exists(select 1 from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001')
  where collection_id in('c2500000-0000-0000-0000-000000000002','c2500000-0000-0000-0000-000000000008')),'Free and legacy parents excluded');
select is((select count(*)::int from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000002')),0,'Shared recipient gets no owner update');
select is((select count(*)::int from private.read_collection_update_notifications(null)),0,'NULL owner yields no events');
select is((select count(*)::int from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000004')),0,'Absent profile owner has no parent');
select ok(not exists(select notification_key from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001')
  group by notification_key having count(*)>1),'No duplicate event per parent');

-- Pokémon target branch uses the same canonical function and predicate.
savepoint pokemon_projection;
insert into public.pokemon(id,dex_number,name_fr) overriding system value values(-97001,97001,'Notification fixture Pokémon');
insert into public.card_pokemon(card_id,pokemon_id) values(-95001,-97001);
insert into public.automatic_target_states(id,target_type,pokemon_id,generation_version,content_hash) overriding system value
  select -97001,'pokemon',-97001,10,encode(sha256(convert_to('[' ||
    coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('pokemon',-97001);
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,applied_target_version,order_contract_version)
  values('c3500000-0000-0000-0000-000000000010','a2500000-0000-0000-0000-000000000001','Pokémon notification','automatic','pokemon',-97001,7,2);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position)
  select ('d3500000-0000-0000-0000-'||lpad((automatic_rank+10)::text,12,'0'))::uuid,'c3500000-0000-0000-0000-000000000010',
    variant_id,'automatic',automatic_rank,automatic_rank from public.collection_items
    where collection_id='c2500000-0000-0000-0000-000000000001' and origin='automatic';
select is((select count(*)::int from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001')
  where collection_id='c3500000-0000-0000-0000-000000000010'),1,'Pokémon structural update projected');
select is(public.get_collection_update_status('c3500000-0000-0000-0000-000000000010')->>'update_available','true','Pokémon projection agrees with 8E');
rollback to pokemon_projection;

insert into private.collection_notification_reads values('c2500000-0000-0000-0000-000000000001',10,'2026-10-11T12:00:00Z');
select is(pg_temp.event()->>'is_read','true','Observed target is read');
update private.collection_notification_reads set read_target_version=11 where collection_id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.event()->>'is_read','true','Read version above current target is read');
select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],12);
select is(pg_temp.event()->>'is_read','false','Newer target becomes unread');
select is(pg_temp.event()->>'notification_key','collection:c2500000-0000-0000-0000-000000000001','New revision retains event identity');
select is((select read_target_version::text from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),'11','New version does not mutate read tracking');
select is((select read_at from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),'2026-10-11T12:00:00Z'::timestamptz,'Read timestamp unchanged');

-- Another owner, same target, no cross-owner read state.
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version,order_contract_version)
  values('c3500000-0000-0000-0000-000000000003','a2500000-0000-0000-0000-000000000003','Other owner','automatic','set',-95001,7,2);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position)
  select ('d3500000-0000-0000-0000-'||lpad(automatic_rank::text,12,'0'))::uuid,'c3500000-0000-0000-0000-000000000003',variant_id,'automatic',automatic_rank,automatic_rank
    from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001' and origin='automatic';
select is((select count(*)::int from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000003')),1,'Second owner receives only own delta');
select ok((select not is_read from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000003')),'Read state never shared between parents/owners');
select ok(not exists(select 1 from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001')
  where collection_id='c3500000-0000-0000-0000-000000000003'),'First owner cannot project foreign parent');

-- Real 8F application atomically removes the active event; no process write.
savepoint application;
create temp table before_application as select read_target_version,read_at from private.collection_notification_reads
  where collection_id='c2500000-0000-0000-0000-000000000001';
select lives_ok($q$select public.apply_collection_update('c2500000-0000-0000-0000-000000000001',
  public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'token','e3500000-0000-0000-0000-000000000001')$q$,'Existing 8F writer applies target');
select is(pg_temp.event(),null::jsonb,'Applied event is treated and excluded');
select is((select read_target_version from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),
  (select read_target_version from before_application),'Application does not update read storage');
rollback to application;
select pg_temp.target(array[-95001,-95003,-95005]::bigint[],13);
select is(pg_temp.event(),null::jsonb,'Return to applied structure makes event obsolete');
select is((select read_target_version::text from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),'11','Obsolete event keeps prior read state');
select pg_temp.target(array[-95005,-95003,-95001]::bigint[],14);
select is(pg_temp.event()->>'target_version','14','Ordered structural change alone is useful');

savepoint corruption;
update public.automatic_target_states set content_hash=repeat('a',64) where id=-95001;
select is(pg_temp.event(),null::jsonb,'Inconsistent canonical hash never fabricates event');
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','8E retains safe invalid-state error');
rollback to corruption;
update public.automatic_target_states set generation_version=1 where id=-95001;
select is(pg_temp.event(),null::jsonb,'Target version below applied is excluded');
rollback to corruption;
update public.automatic_target_states set generation_version=7 where id=-95001;
select is(pg_temp.event(),null::jsonb,'Same version but different structure is inconsistent');
rollback to corruption;
delete from public.automatic_target_states where id=-95001;
select is(pg_temp.event(),null::jsonb,'Missing target state excluded');
rollback to corruption;
update public.collection_items set automatic_rank=100 where id='d2500000-0000-0000-0000-000000000001';
select is(pg_temp.event(),null::jsonb,'Invalid applied canonical ranks excluded');
rollback to corruption;
select is(private.collection_update_available(null,14,repeat('a',64),
  '{}'::private.collection_order_canonical_entry[],'{}'::private.collection_order_item_entry[]),null::boolean,'Missing applied version invalid at common predicate');

-- Existing empty targets are still a useful removal update.
select pg_temp.target('{}'::bigint[],15);
select is(pg_temp.event()->>'target_version','15','Empty canonical removal update active');
select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],9007199254740998);
select is(pg_temp.event()->>'target_version','9007199254740998','Exact BIGINT projection above JS safe integer');
create temp table purity_before as select pg_temp.business_state() state;
select lives_ok($q$select * from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000001')$q$,'Projection can be consulted repeatedly');
select lives_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'Status remains consultative');
select lives_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'Preview remains consultative');
select is(pg_temp.business_state(),(select state from purity_before),'Consultation leaves all business/notification rows unchanged');

savepoint transfer;
delete from public.collection_shares where collection_id='c2500000-0000-0000-0000-000000000001';
update public.collections set owner_id='a2500000-0000-0000-0000-000000000002' where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.event(),null::jsonb,'Former owner loses event');
select is((select count(*)::int from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000002')),1,'Only current owner eligible');
rollback to transfer;
delete from public.collections where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.event(),null::jsonb,'Deleted collection has no event');
select ok(not exists(select 1 from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001'),'Deleted fixture cascades tracking');

select ok(p.provolatile='s' and not p.prosecdef,'Projection STABLE INVOKER, same nested statement snapshot')
  from pg_proc p where p.oid='private.read_collection_update_notifications(uuid)'::regprocedure;
select ok(p.provolatile='s' and not p.prosecdef,'Structural predicate STABLE INVOKER (JSON text conversion)')
  from pg_proc p where p.oid='private.collection_update_available(bigint,bigint,text,private.collection_order_canonical_entry[],private.collection_order_item_entry[])'::regprocedure;
select ok(not has_function_privilege(role,'private.read_collection_update_notifications(uuid)','EXECUTE'),role||' cannot call private owner projection')
  from unnest(array['anon','authenticated','service_role']) role;
select ok(not has_function_privilege(role,'private.collection_update_available(bigint,bigint,text,private.collection_order_canonical_entry[],private.collection_order_item_entry[])','EXECUTE'),role||' cannot call structural helper')
  from unnest(array['anon','authenticated','service_role']) role;
set local role authenticated;
select throws_ok($q$select * from private.read_collection_update_notifications('a2500000-0000-0000-0000-000000000003')$q$,'42501',null,'Private function cannot be exploited with another owner');
reset role;
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('get_notification_center','get_notification_unread_count','get_notification_content','mark_notification_read','process_announcement_notification')),5,'8G.2 APIs now wrap the unchanged private projection');
select * from finish();
rollback;
