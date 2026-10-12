begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc
\ir collection_hidden.fixtures.inc
\ir collection_update.fixtures.inc

-- Pokémon uses the same verified canonical reader, with native automatic IDs.
insert into public.pokemon(id,dex_number,name_fr) overriding system value values(-97001,97001,'Pokémon synthétique 8E');
insert into public.card_pokemon(card_id,pokemon_id) values(-95001,-97001);
insert into public.automatic_target_states(id,target_type,pokemon_id,generation_version,content_hash) overriding system value
  select -97001,'pokemon',-97001,7,encode(sha256(convert_to('[' || coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
  from private.canonical_collection_variants('pokemon',-97001);
insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_pokemon_id,applied_target_version,order_contract_version)
  values('c2600000-0000-0000-0000-000000000001','a2500000-0000-0000-0000-000000000001','Pokémon preview','automatic','pokemon',-97001,7,2);
insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,sort_position)
  select ('d2600000-0000-0000-0000-'||lpad(automatic_rank::text,12,'0'))::uuid,'c2600000-0000-0000-0000-000000000001',variant_id,'automatic',automatic_rank,automatic_rank
    from private.canonical_collection_variants('pokemon',-97001);

create function pg_temp.target(ids bigint[],version bigint) returns void language plpgsql as $$
begin
  update public.catalog_variants v set is_active=v.id=any(ids),sort_order=coalesce(array_position(ids,v.id),99) where v.source_card_id=-95001;
  update public.automatic_target_states set generation_version=version,content_hash=(select encode(sha256(convert_to('[' ||
    coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('set',-95001)) where id=-95001;
end;
$$;
create function pg_temp.business_state() returns jsonb language sql as $$
select jsonb_build_object(
  'collections',(select jsonb_agg(to_jsonb(t) order by id) from public.collections t),
  'items',(select jsonb_agg(to_jsonb(t) order by id) from public.collection_items t),
  'copies',(select jsonb_agg(to_jsonb(t) order by id) from public.physical_copies t),
  'shares',(select jsonb_agg(to_jsonb(t) order by id) from public.collection_shares t),
  'intents',(select jsonb_agg(to_jsonb(t) order by collection_id,sequence) from private.collection_order_intents t),
  'receipts',(select jsonb_agg(to_jsonb(t) order by collection_id,operation_id) from private.collection_operation_receipts t));
$$;
create temp table purity_before as select pg_temp.business_state() state;
grant execute on function pg_temp.target(bigint[],bigint),pg_temp.business_state() to authenticated;
grant select on purity_before to authenticated;
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'update_available','false','Unchanged canonical');
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'added','[]'::jsonb,'Unchanged preview no additions');
select is(public.get_collection_update_status('c2600000-0000-0000-0000-000000000001')->>'update_available','false','Pokémon canonical target verified');
select is(jsonb_array_length(public.preview_collection_update('c2600000-0000-0000-0000-000000000001')->'final_order'),3,'Pokémon preview contains complete canonical');
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000008')->>'order_contract_version','1','Owner can read legacy automatic status');
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000008')$q$,'23514','order_contract_upgrade_required','Legacy preview refused');
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000002')$q$,'23514','collection_update_ineligible','Free preview refused');
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000002')$q$,'23514','collection_update_ineligible','Free status refused');
reset role;
update public.source_cards set name_fr='Description changed only' where id=-95001;
update public.catalog_variants set image_url='https://example.test/description.png' where id=-95001;
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'update_available','false','Description does not change structural status');
select pg_temp.target(array[-95001,-95003,-95005]::bigint[],9);
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'update_available','false','Higher version returned to same structure');
select is((select applied_target_version::text from public.collections where id='c2500000-0000-0000-0000-000000000001'),'7','Applied version never silently advanced');

select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],10);
create temp table previews as select public.preview_collection_update('c2500000-0000-0000-0000-000000000001') plan;
select is((select plan->>'update_available' from previews),'true','Higher version with structural change');
select is((select plan->'added' from previews),'[{"variant_id":"9007199254740997","automatic_rank":"4"}]'::jsonb,'Exact BIGINT addition without UUID');
select is((select plan->'removed' from previews),'[{"collection_item_id":"d2500000-0000-0000-0000-000000000003","variant_id":"-95003","automatic_rank":"2"}]'::jsonb,'Removed automatic identity');
select is((select plan->'converted' from previews),'[{"collection_item_id":"d2500000-0000-0000-0000-000000000002","variant_id":"-95002","automatic_rank":"2"}]'::jsonb,'Conversion retains identity');
select is((select jsonb_array_length(plan->'rank_changes') from previews),2,'Both retained automatics changed rank');
select ok((select (e->>'is_hidden')::boolean from previews,jsonb_array_elements(plan->'final_order') e where e->>'variant_id'='-95001'),'Retained automatic mask preserved');
select ok((select not (e->>'is_hidden')::boolean from previews,jsonb_array_elements(plan->'final_order') e where e->>'variant_id'='-95002'),'Conversion visible');
select ok((select e->'collection_item_id'='null'::jsonb and not (e->>'is_hidden')::boolean from previews,jsonb_array_elements(plan->'final_order') e where e->>'variant_id'='9007199254740997'),'New automatic NULL identity and visible');
select is((select e->>'origin' from previews,jsonb_array_elements(plan->'final_order') e where e->>'variant_id'='-95004'),'manual','Outside canonical manual retained');
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001'),(select plan from previews),'Same snapshot same plan/token');
select is((select plan-'token'-'collection_id'-'update_available'-'target_empty' from previews),
  private.merge_collection_relative_order('c2500000-0000-0000-0000-000000000001',
    array(select row(variant_id,automatic_rank)::private.collection_order_canonical_entry from private.canonical_collection_variants('set',-95001) order by automatic_rank),
    array(select row(collection_id,id,variant_id,origin,automatic_rank,introduced_revision,is_hidden)::private.collection_order_item_entry
      from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001'),
    array(select e from private.collection_order_intents e where collection_id='c2500000-0000-0000-0000-000000000001' order by sequence))-'replay',
  'Actual table inputs equal unchanged 8B.2 engine exactly');
select is(pg_temp.business_state(),(select state from purity_before),'All business rows/timestamps identical after status and previews');
update public.collections set personal_revision=9007199254740997,applied_target_version=9007199254740997 where id='c2500000-0000-0000-0000-000000000001';
select pg_temp.target(array[-95005,-95002,-95001,9007199254740997]::bigint[],9007199254740998);
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'token'->>'personal_revision','9007199254740997','Revision exact above safe integer');
select is(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')->>'target_version','9007199254740998','Version exact above safe integer');
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'token'->>'plan_hash',(select plan->'token'->>'plan_hash' from previews),'Revision/version change do not decorate structural hash');
select isnt(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'token',(select plan->'token' from previews),'Token binds exact revision and versions');
select pg_temp.target('{}'::bigint[],9007199254740999);
select is(jsonb_array_length(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'removed'),3,'Empty target explicit all automatic removals');
select is(jsonb_array_length(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'final_order'),2,'Empty target preserves both manuals');
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->>'target_empty','true','Empty target explicit flag');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}',true);
select throws_ok($q$select public.create_automatic_collection('New empty','set',-95002)$q$,'23514','automatic_collection_empty','Creating new empty target still refused');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);

savepoint no_manuals;
delete from public.collection_items where collection_id='c2500000-0000-0000-0000-000000000001' and origin='manual';
select is(public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'final_order','[]'::jsonb,'Empty target without manuals yields empty retained collection');
rollback to no_manuals;

-- Synthetic corruption only, rolled back. No real user's parent converted/deleted.
savepoint corruption;
update public.collection_items set automatic_rank=100 where id='d2500000-0000-0000-0000-000000000001';
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Impossible applied ranks refused');
rollback to corruption;
update public.automatic_target_states set content_hash=repeat('a',64) where id=-95001;
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Incorrect canonical hash sanitized');
rollback to corruption;
update public.automatic_target_states set generation_version=1 where id=-95001;
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Version regression refused');
rollback to corruption;
delete from public.automatic_target_states where id=-95001;
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Missing target state sanitized');
rollback to corruption;
update public.collections set personal_revision=1 where id='c2500000-0000-0000-0000-000000000001';
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Journal beyond revision refused');
rollback to corruption;
delete from private.collection_order_intents where collection_id='c2500000-0000-0000-0000-000000000001' and sequence=1;
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Incomplete manual history refused by engine');
rollback to corruption;
update public.automatic_target_states set generation_version=9007199254740997 where id=-95001;
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'23514','collection_update_state_invalid','Same version with different applied universe refused');
rollback to corruption;

-- Exact public envelopes and closed private helpers.
select is((select array_agg(key order by key) from jsonb_object_keys(public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')) key),
  array['applied_target_version','collection_id','order_contract_version','target_hash','target_version','update_available'],'Strict status keys');
select is((select array_agg(key order by key) from jsonb_object_keys((select plan from previews)) key),
  array['added','collection_id','converted','final_order','rank_changes','removed','target_empty','token','update_available'],'Strict preview keys');
select is((select array_agg(key order by key) from jsonb_object_keys((select plan->'token' from previews)) key),
  array['applied_target_version','contract_version','personal_revision','plan_hash','target_hash','target_version'],'Strict six token keys');
select is(private.collection_update_plan_hash('c3500000-0000-0000-0000-000000000001',
  '{"added":[],"removed":[],"converted":[],"rank_changes":[],"final_order":[]}'::jsonb),
  'd3b3d15061db8d6721b1ad5f7b33fcd96adb1105b96380c5e06696d2aa5cbef7','Version 1 serialization golden SHA256 from independent Node crypto');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='collection_update_plan'),'Shared update planner remains private');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname in('get_collection_update_status','preview_collection_update','read_collection_update_context','collection_update_plan','collection_update_plan_hash')
  and pg_get_functiondef(p.oid) ~* '(insert into|update public|delete from|gen_random_uuid|uuid_generate|nextval)'), 'No reader contains business DML or UUID/sequence allocator');
select ok(p.provolatile='v' and p.prosecdef and p.proconfig @> array['search_path=""'],p.proname||' safe definer/volatile') from pg_proc p
  where p.oid in('public.get_collection_update_status(uuid)'::regprocedure,'public.preview_collection_update(uuid)'::regprocedure);
select ok(not has_function_privilege(role,p.oid,'EXECUTE'),role||' denied '||p.proname) from pg_proc p
  cross join unnest(array['anon','service_role']) role where p.oid in('public.get_collection_update_status(uuid)'::regprocedure,'public.preview_collection_update(uuid)'::regprocedure);
select ok(not has_function_privilege('authenticated',p.oid,'EXECUTE'),'Private helper closed: '||p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in('read_collection_update_context','collection_update_plan','collection_update_plan_hash');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}',true);
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','Shared recipient cannot preview');
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','Shared recipient cannot read status');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}',true);
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','Third party denied');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000004","aal":"aal2"}',true);
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','Profile absent denied');
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal1"}',true);
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','AAL1 denied');
select set_config('request.jwt.claims','{}',true);
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501','collection_update_unavailable','No caller denied');
reset role;
set local role anon;
select throws_ok($q$select public.preview_collection_update('c2500000-0000-0000-0000-000000000001')$q$,'42501',null,'Anonymous EXECUTE denied');
reset role;
set local role service_role;
select throws_ok($q$select public.get_collection_update_status('c2500000-0000-0000-0000-000000000001')$q$,'42501',null,'Service EXECUTE denied');
reset role;
select set_config('request.jwt.claims','{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}',true);

-- Actual database projection of every reference scenario, including A/B/S08/S35.
-- Map small catalogue IDs into a reserved negative namespace, preserve UUIDs and
-- complete chronology of living subjects. No replay logic in the test adapter.
create temp table order_scenarios(id text primary key,input jsonb,expected text);
\ir relative_order_engine.fixtures.inc
insert into public.tcg_sets(id,series_id,is_active) overriding system value values(-96001,-95001,true);
insert into public.source_cards(id,set_id,source_present,origin,is_active) overriding system value values(-96001,-96001,false,'my',true);
create function pg_temp.adapt(data jsonb) returns jsonb language sql as $$
select jsonb_set(jsonb_set(jsonb_set(data,'{canonical}',coalesce((select jsonb_agg(jsonb_set(e,'{variant_id}',to_jsonb((-96000-(e->>'variant_id')::bigint)::text))) from jsonb_array_elements(data->'canonical') e),'[]')),
  '{items}',coalesce((select jsonb_agg(jsonb_set(e,'{variant_id}',to_jsonb((-96000-(e->>'variant_id')::bigint)::text))) from jsonb_array_elements(data->'items') e),'[]')),
  '{intents}',coalesce((select jsonb_agg(e order by (e->>'sequence')::bigint) from jsonb_array_elements(data->'intents') e where exists(
    select 1 from jsonb_array_elements(data->'items') i where i->>'collection_item_id'=e->>'subject_item_id')),'[]'));
$$;
create function pg_temp.order_compute(data jsonb) returns jsonb language sql as $$
select private.merge_collection_relative_order((data->>'collection_id')::uuid,
  array(select row(c.variant_id,c.automatic_rank)::private.collection_order_canonical_entry from jsonb_to_recordset(data->'canonical') c(variant_id bigint,automatic_rank bigint)),
  array(select row(i.collection_id,i.collection_item_id,i.variant_id,i.origin,i.automatic_rank,i.introduced_revision,i.is_hidden)::private.collection_order_item_entry from jsonb_to_recordset(data->'items') i(collection_id uuid,collection_item_id uuid,variant_id bigint,origin text,automatic_rank bigint,introduced_revision bigint,is_hidden boolean)),
  array(select jsonb_populate_record(null::private.collection_order_intents,e) from jsonb_array_elements(data->'intents') e));
$$;
create function pg_temp.scenario_preview(data jsonb) returns jsonb language plpgsql as $$
declare d jsonb:=pg_temp.adapt(data); pid uuid:=(data->>'collection_id')::uuid;
begin
  delete from public.collections where id=pid;
  delete from public.catalog_variants where source_card_id=-96001;
  delete from public.automatic_target_states where id=-96001;
  insert into public.catalog_variants(id,source_card_id,variant_key,source_present,origin,french_availability,size,is_active,sort_order) overriding system value
    select v,-96001,v::text,false,'my','confirmed','standard',exists(select 1 from jsonb_array_elements(d->'canonical') e where (e->>'variant_id')::bigint=v),
      coalesce((select (e->>'automatic_rank')::int from jsonb_array_elements(d->'canonical') e where (e->>'variant_id')::bigint=v),99)
    from (select (e->>'variant_id')::bigint v from jsonb_array_elements(d->'canonical') e union select (e->>'variant_id')::bigint from jsonb_array_elements(d->'items') e) ids;
  insert into public.automatic_target_states(id,target_type,set_id,generation_version,content_hash) overriding system value
    select -96001,'set',-96001,2,encode(sha256(convert_to('[' || coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex') from private.canonical_collection_variants('set',-96001);
  insert into public.collections(id,owner_id,name,collection_type,automatic_target_type,target_set_id,applied_target_version,order_contract_version,personal_revision)
    select pid,'a2500000-0000-0000-0000-000000000001','Engine scenario','automatic','set',-96001,1,2,
      greatest(coalesce((select max((e->>'sequence')::bigint) from jsonb_array_elements(d->'intents') e),0),coalesce((select max((e->>'introduced_revision')::bigint) from jsonb_array_elements(d->'items') e),0));
  insert into public.collection_items(id,collection_id,variant_id,origin,automatic_rank,introduced_revision,is_hidden,sort_position)
    select (e->>'collection_item_id')::uuid,pid,(e->>'variant_id')::bigint,e->>'origin',(e->>'automatic_rank')::bigint,(e->>'introduced_revision')::bigint,(e->>'is_hidden')::boolean,n
      from jsonb_array_elements(d->'items') with ordinality a(e,n);
  insert into private.collection_order_intents select (jsonb_populate_record(null::private.collection_order_intents,e)).* from jsonb_array_elements(d->'intents') e;
  return public.preview_collection_update(pid);
end;
$$;
create temp table scenario_results as select id,input,pg_temp.scenario_preview(input) result from order_scenarios order by id;
select is(result-'collection_id'-'token'-'update_available'-'target_empty',pg_temp.order_compute(pg_temp.adapt(input))-'replay',id||' real table preview equals real engine') from scenario_results order by id;
select is(private.collection_update_plan_hash((input->>'collection_id')::uuid,pg_temp.order_compute(pg_temp.adapt(input))),result->'token'->>'plan_hash',id||' exact reusable deterministic plan hash') from scenario_results order by id;
select * from finish();
rollback;
