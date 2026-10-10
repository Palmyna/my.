begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Compare actual installed storage, including legitimate v2 parents after activation.
create temp table engine_parents_before as select id,order_contract_version,personal_revision from public.collections;
create temp table engine_intents_before as select * from private.collection_order_intents;
create temp table engine_receipts_before as select * from private.collection_operation_receipts;

-- All fixtures live in temporary tables. No real collection or catalogue DML.
create temp table order_scenarios (id text primary key, input jsonb not null, expected text not null);
\ir relative_order_engine.fixtures.inc

-- Test-only adapters: native PostgreSQL types, exact decimal parsing, no sorting logic.
create function pg_temp.order_compute(data jsonb) returns jsonb language sql as $$
  select private.merge_collection_relative_order((data->>'collection_id')::uuid,
    array(select row(c.variant_id,c.automatic_rank)::private.collection_order_canonical_entry
      from jsonb_to_recordset(data->'canonical') c(variant_id bigint,automatic_rank bigint)),
    array(select row(i.collection_id,i.collection_item_id,i.variant_id,i.origin,i.automatic_rank,
      i.introduced_revision,i.is_hidden)::private.collection_order_item_entry
      from jsonb_to_recordset(data->'items') i(collection_id uuid,collection_item_id uuid,variant_id bigint,
        origin text,automatic_rank bigint,introduced_revision bigint,is_hidden boolean)),
    array(select jsonb_populate_record(null::private.collection_order_intents, value)
      from jsonb_array_elements(data->'intents')));
$$;
create function pg_temp.order_variants(result jsonb) returns text[] language sql as $$
  select coalesce(array_agg(value->>'variant_id' order by ordinal), '{}'::text[])
  from jsonb_array_elements(result->'final_order') with ordinality e(value,ordinal);
$$;
create function pg_temp.order_labels(result jsonb) returns text language sql as $$
  select coalesce(string_agg(chr(v::integer+64),' ' order by ordinal),'∅')
  from unnest(pg_temp.order_variants(result)) with ordinality e(v,ordinal);
$$;
create temp table order_results as select *,pg_temp.order_compute(input) result from order_scenarios;

select is((select count(*) from order_results),36::bigint,'Exactly 36 reference scenarios, including A/B');
select is(pg_temp.order_labels(result),expected,id || ' PostgreSQL expected order') from order_results order by id;
select is(pg_temp.order_compute(input),result,id || ' repeated reconstruction #2') from order_results order by id;
select is(pg_temp.order_compute(input),result,id || ' repeated reconstruction #3') from order_results order by id;

-- Universe, metadata and identity invariants independently of the expected order.
select results_eq(
  format('select v from unnest(pg_temp.order_variants(%L::jsonb)) v order by v collate "C"',result),
  format($q$select variant_id from (
    select c->>'variant_id' variant_id from jsonb_array_elements(%L::jsonb->'canonical') c
    union
    select i->>'variant_id' from jsonb_array_elements(%L::jsonb->'items') i where i->>'origin'='manual'
  ) u order by variant_id collate "C"$q$,input,input),id || ' exact final universe without duplicate')
from order_results order by id;
select ok(not exists (
  select 1 from jsonb_array_elements(result->'final_order') f
  left join lateral (select i from jsonb_array_elements(input->'items') i where i->>'variant_id'=f->>'variant_id') old on true
  where (old.i is not null and f->>'collection_item_id' is distinct from old.i->>'collection_item_id')
     or (old.i is null and f->'collection_item_id' <> 'null'::jsonb)
),id || ' preserved existing/converted IDs; no new UUID') from order_results order by id;
select ok(not exists (
  select 1 from jsonb_array_elements(result->'final_order') f
  left join lateral (select c from jsonb_array_elements(input->'canonical') c where c->>'variant_id'=f->>'variant_id') target on true
  left join lateral (select i from jsonb_array_elements(input->'items') i where i->>'variant_id'=f->>'variant_id') old on true
  where f->>'origin' is distinct from case when target.c is null then 'manual' else 'automatic' end
     or f->>'automatic_rank' is distinct from target.c->>'automatic_rank'
     or (f->>'is_hidden')::boolean is distinct from case when old.i->>'origin'='automatic'
       then (old.i->>'is_hidden')::boolean else false end
),id || ' canonical ranks/origins/hidden state unaffected by replay') from order_results order by id;
select is(pg_temp.order_compute(jsonb_set(input,'{items}',(
  select jsonb_agg(value order by ordinal desc) from jsonb_array_elements(input->'items') with ordinality e(value,ordinal)
))),result,id || ' input item reading order irrelevant') from order_results where jsonb_array_length(input->'items')>0 order by id;
select is(jsonb_array_length(result->'replay'),jsonb_array_length(input->'intents'),id || ' every intention processed') from order_results order by id;

-- Prefix proofs use the actual engine on both sides of each move once all current
-- introductions are included. No handwritten replay function supplies the result.
create temp table order_steps as
select s.id,e.intent,e.ordinal,
  pg_temp.order_compute(jsonb_set(s.input,'{intents}',coalesce((select jsonb_agg(v order by n)
    from jsonb_array_elements(s.input->'intents') with ordinality a(v,n) where n<e.ordinal),'[]'))) before_result,
  pg_temp.order_compute(jsonb_set(s.input,'{intents}',(select jsonb_agg(v order by n)
    from jsonb_array_elements(s.input->'intents') with ordinality a(v,n) where n<=e.ordinal))) after_result
from order_scenarios s cross join lateral jsonb_array_elements(s.input->'intents') with ordinality e(intent,ordinal)
where e.intent->>'kind'='move' and not exists (
  select 1 from jsonb_array_elements(s.input->'items') i
  where (i->>'introduced_revision')::bigint >= (e.intent->>'sequence')::bigint);
select is(
  array(select f->>'variant_id' from jsonb_array_elements(after_result->'final_order') f
    where f->>'collection_item_id' is distinct from intent->>'subject_item_id'),
  array(select f->>'variant_id' from jsonb_array_elements(before_result->'final_order') f
    where f->>'collection_item_id' is distinct from intent->>'subject_item_id'),
  id || ' step ' || ordinal || ': exact relative order outside moved subject') from order_steps order by id,ordinal;
select results_eq(
  format('select v from unnest(pg_temp.order_variants(%L::jsonb)) v order by v collate "C"',after_result),
  format('select v from unnest(pg_temp.order_variants(%L::jsonb)) v order by v collate "C"',before_result),
  id || ' step ' || ordinal || ': unchanged set during replay') from order_steps order by id,ordinal;

-- Exhaustive primitive invariant: 24 canonical permutations x 16 destinations.
-- Expected adjacency/other-order/set properties do not duplicate FUSIONNER.
create temp table primitive_results as
with recursive permutations(keys) as (
  select '{}'::integer[] union all
  select keys || v from permutations cross join generate_series(1,4) v
  where cardinality(keys)<4 and not v=any(keys)
), cases as (
  select keys,subject,anchor,s.input,
    (select jsonb_agg(jsonb_build_object('variant_id',v::text,'automatic_rank',n::text) order by n)
      from unnest(keys) with ordinality a(v,n)) canonical,
    jsonb_build_array(jsonb_build_object('collection_id',input->>'collection_id','sequence','1',
      'operation_id','81000000-0000-0000-0000-000000000001',
      'subject_item_id',format('80000000-0000-0000-0000-%s',lpad(subject::text,12,'0')),
      'kind','move','destination',case when anchor=0 then 'end' else 'before' end,
      'anchor_item_id',case when anchor=0 then null else format('80000000-0000-0000-0000-%s',lpad(anchor::text,12,'0')) end,
      'fallback_item_ids','[]'::jsonb,'accepted_at','2026-10-08T00:00:00Z')) intents
  from permutations cross join generate_series(1,4) subject cross join generate_series(0,4) anchor
  cross join order_scenarios s where cardinality(keys)=4 and anchor<>subject and s.id='S01'
)
select keys,subject,anchor,pg_temp.order_variants(pg_temp.order_compute(
  jsonb_set(jsonb_set(input,'{canonical}',canonical),'{intents}',intents))) final_keys from cases;
select is((select count(*) from primitive_results),384::bigint,'384 exhaustive primitive cases executed by PostgreSQL');
select ok((select bool_and(array_remove(final_keys,subject::text)=
  array(select v::text from unnest(keys) v where v<>subject)) from primitive_results),
  'Every primitive preserves exact relative order outside subject');
select ok((select bool_and(cardinality(final_keys)=4 and
  (select count(distinct v)=4 from unnest(final_keys) v)) from primitive_results),
  'Every primitive preserves full set without duplicates');
select ok((select bool_and(case when anchor=0 then final_keys[4]=subject::text
  else array_position(final_keys,subject::text)+1=array_position(final_keys,anchor::text) end) from primitive_results),
  'Every primitive achieves immediate-before or explicit-end destination');

-- Counterexamples are real engine executions with deliberately wrong inputs.
select is(pg_temp.order_labels(pg_temp.order_compute(jsonb_set(input,'{intents}',(input->'intents')-0))),
  'A X C B D','S08 last-subject compression counterexample') from order_scenarios where id='S08';
select is(pg_temp.order_labels(pg_temp.order_compute(jsonb_set(input,'{canonical}',
  '[{"variant_id":"3","automatic_rank":"1"},{"variant_id":"1","automatic_rank":"2"},
    {"variant_id":"2","automatic_rank":"3"},{"variant_id":"4","automatic_rank":"4"}]'))),
  'D C A B','S35 replaying personalized output as canonical drifts') from order_scenarios where id='S35';
select is((select result->'converted' from order_results where id='S20'),
  '[{"collection_item_id":"80000000-0000-0000-0000-000000000013","variant_id":"13","automatic_rank":"2"}]'::jsonb,
  'Conversion preserves manual identity and assigns target rank');
select is((select result->'added' from order_results where id='S02'),
  '[{"variant_id":"24","automatic_rank":"2"},{"variant_id":"25","automatic_rank":"3"},
    {"variant_id":"26","automatic_rank":"6"}]'::jsonb,'Multiple additions classified in target order');
select is((select result->'removed' from order_results where id='S14'),
  '[{"collection_item_id":"80000000-0000-0000-0000-000000000001","variant_id":"1","automatic_rank":"1"},
    {"collection_item_id":"80000000-0000-0000-0000-000000000002","variant_id":"2","automatic_rank":"2"}]'::jsonb,
  'Removals follow applied canonical ranks');
select is((select result->'rank_changes'->0 from order_results where id='S22'),
  '{"collection_item_id":"80000000-0000-0000-0000-000000000004","variant_id":"4","previous_rank":"4","next_rank":"1"}'::jsonb,
  'Rank changes classified in target order');
select is((select result->'replay'->0->>'resolution' from order_results where id='S16'),
  'subject_absent','Removed automatic subject explicitly skipped');
select is((select result->'replay'->0->>'resolved_anchor_item_id' from order_results where id='S36'),
  '80000000-0000-0000-0000-000000000008','Hidden fallback anchor remains structural');
select is((select input->'intents'->0->'fallback_item_ids' from order_scenarios where id='S34'),
  '["80000000-0000-0000-0000-000000000004"]'::jsonb,'S34 old context excludes newly introduced X/Y');
select is((select input->'intents'->1->'fallback_item_ids' from order_scenarios where id='S34'),
  '["80000000-0000-0000-0000-000000000003","80000000-0000-0000-0000-000000000002"]'::jsonb,
  'S34 later context captured in second epoch');

-- R3: same variant with a different UUID cannot inherit its old subject/anchor.
create temp table lifecycle_cases as select id,input from order_scenarios where id in ('A','B','S20');
update lifecycle_cases set input=jsonb_set(input,'{items,2,collection_item_id}',
  '"82000000-0000-0000-0000-000000000003"') where id='A';
select is(pg_temp.order_labels(pg_temp.order_compute(input)),'A X B C D',
  'R3 reintroduced automatic subject gets no old intentions') from lifecycle_cases where id='A';
update lifecycle_cases set input=jsonb_set(input,'{items,1,collection_item_id}',
  '"82000000-0000-0000-0000-000000000002"') where id='B';
select is(pg_temp.order_labels(pg_temp.order_compute(input)),'A X B C D',
  'R3 reintroduced anchor does not replace old identity; fallback D used') from lifecycle_cases where id='B';
-- Same inputs after a conversion has already been materialized, with introduction retained.
update lifecycle_cases set input=jsonb_set(input,'{items}',(
  select jsonb_agg(i || jsonb_build_object('origin','automatic','automatic_rank',c->>'automatic_rank') order by (c->>'automatic_rank')::bigint)
  from jsonb_array_elements(input->'items') i join lateral jsonb_array_elements(input->'canonical') c
    on c->>'variant_id'=i->>'variant_id'
)) where id='S20';
-- Include already-created X without allocating any new identity in the engine.
update lifecycle_cases set input=jsonb_set(input,'{items}',(input->'items') ||
  '[{"collection_id":"80000000-0000-0000-0000-000000000000","collection_item_id":"80000000-0000-0000-0000-000000000024",
    "variant_id":"24","origin":"automatic","automatic_rank":"3","introduced_revision":null,"is_hidden":false}]') where id='S20';
select is(pg_temp.order_labels(pg_temp.order_compute(input)),'A X M B C',
  'Already-applied conversion reconstructs same permutation') from lifecycle_cases where id='S20';

create temp table manual_reintroduction as select input from order_scenarios where id='S18';
update manual_reintroduction set input=jsonb_set(jsonb_set(input,
  '{items,3,collection_item_id}','"82000000-0000-0000-0000-000000000013"'),'{items,3,introduced_revision}','"3"');
update manual_reintroduction set input=jsonb_set(input,'{intents}',(input->'intents') ||
  '[{"collection_id":"80000000-0000-0000-0000-000000000000","sequence":"3", "operation_id":"81000000-0000-0000-0000-000000000003",
    "subject_item_id":"82000000-0000-0000-0000-000000000013","kind":"manual_add","destination":"end",
    "anchor_item_id":null,"fallback_item_ids":[],"accepted_at":"2026-10-08T00:00:00Z"}]');
select is(pg_temp.order_labels(pg_temp.order_compute(input)),'A X B C M',
  'R3 manual readdition uses new initial placement, old moves ignored') from manual_reintroduction;
select is(pg_temp.order_compute(input)->'replay'->0->>'resolution','subject_absent',
  'R3 historical manual_add cannot resurrect old identity') from manual_reintroduction;

select ok((select bool_and((e->>'is_hidden')::boolean=false) from jsonb_array_elements(result->'final_order') e
  where e->'collection_item_id'='null'::jsonb),id || ' new automatics visible by default')
from order_results where jsonb_array_length(result->'added')>0 order by id;

-- Empty universe, singleton and exact signed BIGINT transport.
select is(pg_temp.order_compute('{"collection_id":"80000000-0000-0000-0000-000000000000","canonical":[],"items":[],"intents":[]}')->'final_order',
  '[]'::jsonb,'Completely empty input accepted');
select is(pg_temp.order_compute('{"collection_id":"80000000-0000-0000-0000-000000000000",
  "canonical":[{"variant_id":"9223372036854775807","automatic_rank":"1"},
    {"variant_id":"-9223372036854775808","automatic_rank":"2"}],"items":[],"intents":[]}')->'added',
  '[{"variant_id":"9223372036854775807","automatic_rank":"1"},
    {"variant_id":"-9223372036854775808","automatic_rank":"2"}]'::jsonb,'Signed BIGINT boundaries remain exact decimal strings');
select lives_ok(format('select pg_temp.order_compute(%L::jsonb)',jsonb_set(input,'{intents,0,sequence}',
  '"9223372036854775807"')),'Sequence BIGINT MAX accepted, independent of timestamp') from order_scenarios where id='A';

-- Native function rejects SQL NULL and noncanonical/multidimensional array shapes.
select throws_ok($$select private.merge_collection_relative_order(null,'{}','{}','{}')$$,
  '22023','collection_order_input_invalid','NULL collection refused');
select throws_ok(format('select private.merge_collection_relative_order(%L,%s,%s,%s)',
  '80000000-0000-0000-0000-000000000000',c,i,e),'22023','collection_order_input_invalid',label)
from (values
  ('null','''{}''','''{}''','NULL canonical list'),
  ('''{}''','null','''{}''','NULL items list'),
  ('''{}''','''{}''','null','NULL intents list'),
  ('array[null]::private.collection_order_canonical_entry[]','''{}''','''{}''','NULL canonical member'),
  ('''{}''','array[null]::private.collection_order_item_entry[]','''{}''','NULL item member'),
  ('''{}''','''{}''','array[null]::private.collection_order_intents[]','NULL intent member'),
  ('array[array[row(1,1)::private.collection_order_canonical_entry]]','''{}''','''{}''','2D canonical array'),
  ('''{}''','array[array[null::private.collection_order_item_entry]]','''{}''','2D item array'),
  ('''{}''','''{}''','array[array[null::private.collection_order_intents]]','2D intention array'),
  ('''[0:0]={"(1,1)"}''::private.collection_order_canonical_entry[]','''{}''','''{}''','Zero-bound canonical array')
) invalid(c,i,e,label);

create temp table invalid_inputs(label text,input jsonb);
insert into invalid_inputs select label,jsonb_set(input,path,value) from order_scenarios cross join (values
  ('NULL item identity','{items,0,collection_item_id}'::text[],'null'::jsonb),
  ('Item outside collection','{items,0,collection_id}','"83000000-0000-0000-0000-000000000000"'),
  ('Duplicate item identity','{items,1,collection_item_id}','"80000000-0000-0000-0000-000000000001"'),
  ('Duplicate item variant','{items,1,variant_id}','"1"'),
  ('Unknown origin','{items,0,origin}','"other"'),
  ('Automatic without rank','{items,0,automatic_rank}','null'),
  ('Invalid applied rank','{items,0,automatic_rank}','"9"'),
  ('Duplicate applied rank','{items,1,automatic_rank}','"1"'),
  ('Hidden NULL','{items,0,is_hidden}','null'),
  ('Introduction zero','{items,0,introduced_revision}','"0"'),
  ('Canonical rank zero','{canonical,0,automatic_rank}','"0"'),
  ('Canonical rank gap','{canonical,1,automatic_rank}','"9"'),
  ('Duplicate canonical rank','{canonical,1,automatic_rank}','"1"'),
  ('Duplicate canonical variant','{canonical,1,variant_id}','"1"'),
  ('NULL canonical variant','{canonical,0,variant_id}','null'),
  ('Sequence zero','{intents,0,sequence}','"0"'),
  ('NULL sequence','{intents,0,sequence}','null'),
  ('NULL operation','{intents,0,operation_id}','null'),
  ('NULL subject','{intents,0,subject_item_id}','null'),
  ('NULL timestamp','{intents,0,accepted_at}','null'),
  ('Wrong journal parent','{intents,0,collection_id}','"83000000-0000-0000-0000-000000000000"'),
  ('Unknown kind','{intents,0,kind}','"remove"'),
  ('Automatic subject incompatible with manual_add','{intents,0,kind}','"manual_add"'),
  ('Unknown destination','{intents,0,destination}','"after"'),
  ('Missing anchor','{intents,0,anchor_item_id}','null'),
  ('Self anchor','{intents,0,anchor_item_id}','"80000000-0000-0000-0000-000000000003"'),
  ('End with anchor/context','{intents,0,destination}','"end"'),
  ('NULL suffix','{intents,0,fallback_item_ids}','null'),
  ('NULL suffix member','{intents,0,fallback_item_ids}','[null]'),
  ('Subject in suffix','{intents,0,fallback_item_ids}','["80000000-0000-0000-0000-000000000003"]'),
  ('Anchor in suffix','{intents,0,fallback_item_ids}','["80000000-0000-0000-0000-000000000001"]'),
  ('Duplicate suffix','{intents,0,fallback_item_ids}','["80000000-0000-0000-0000-000000000002","80000000-0000-0000-0000-000000000002"]')
) bad(label,path,value) where id='A';
insert into invalid_inputs select label,jsonb_set(input,path,value) from order_scenarios cross join (values
  ('Duplicate chronology','{intents,1,sequence}'::text[],'"1"'::jsonb),
  ('Descending chronology','{intents,0,sequence}','"9"'),
  ('Duplicate operation','{intents,1,operation_id}','"81000000-0000-0000-0000-000000000001"')
) bad(label,path,value) where id='S08';
insert into invalid_inputs select label,jsonb_set(input,path,value) from order_scenarios cross join (values
  ('Manual missing introduction','{items,3,introduced_revision}'::text[],'null'::jsonb),
  ('Manual hidden','{items,3,is_hidden}','true'),
  ('Manual has rank','{items,3,automatic_rank}','"1"'),
  ('Initial placement missing','{intents}','[]'),
  ('Initial placement mismatch','{items,3,introduced_revision}','"2"'),
  ('Initial placement wrong kind','{intents,0,kind}','"move"'),
  ('End suffix nonempty','{intents,0,fallback_item_ids}','["80000000-0000-0000-0000-000000000001"]')
) bad(label,path,value) where id='S21';
insert into invalid_inputs select label,jsonb_set(input,path,value) from order_scenarios cross join (values
  ('Future manual anchor','{intents,0,anchor_item_id}'::text[],'"80000000-0000-0000-0000-000000000014"'::jsonb),
  ('Future manual fallback','{intents,0,fallback_item_ids}','["80000000-0000-0000-0000-000000000014"]')
) bad(label,path,value) where id='S19';
insert into invalid_inputs select 'Duplicate manual introduction revision',jsonb_set(input,'{items,4,introduced_revision}','"1"')
  from order_scenarios where id='S19';
insert into invalid_inputs select 'Repeated manual_add',jsonb_set(input,'{intents,1,kind}','"manual_add"')
  from order_scenarios where id='S18';
insert into invalid_inputs select 'Move before its manual_add',jsonb_set(input,'{intents,0,kind}','"move"')
  from order_scenarios where id='S18';
select throws_ok(format('select pg_temp.order_compute(%L::jsonb)',input),
  '22023','collection_order_input_invalid',label) from invalid_inputs order by label;
select throws_ok($$select pg_temp.order_compute('{"collection_id":"80000000-0000-0000-0000-000000000000",
  "canonical":[{"variant_id":"9223372036854775808","automatic_rank":"1"}],"items":[],"intents":[]}')$$,
  '22003',null,'Native BIGINT overflow refused before engine');
select throws_ok(format($q$select private.merge_collection_relative_order(%L,'{}','{}',array[
  row(%L,1,%L,%L,'move','before',%L,'[0:0]={80000000-0000-0000-0000-000000000004}'::uuid[],now())::private.collection_order_intents])$q$,
  '80000000-0000-0000-0000-000000000000','80000000-0000-0000-0000-000000000000',
  '81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002'),
  '22023','collection_order_input_invalid','Noncanonical historical suffix bounds refused even for absent subject');
select throws_ok(format($q$select private.merge_collection_relative_order(%L,'{}','{}',array[
  row(%L,1,%L,%L,'move','before',%L,array[array['80000000-0000-0000-0000-000000000004'::uuid]],now())::private.collection_order_intents])$q$,
  '80000000-0000-0000-0000-000000000000','80000000-0000-0000-0000-000000000000',
  '81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002'),
  '22023','collection_order_input_invalid','2D historical suffix refused even for absent subject');

-- R4: engine consumes recorded intentions; it cannot reconstruct/capture no-ops.
select is(pg_temp.order_labels(pg_temp.order_compute('{"collection_id":"80000000-0000-0000-0000-000000000000",
  "canonical":[{"variant_id":"1","automatic_rank":"1"},{"variant_id":"3","automatic_rank":"2"},
    {"variant_id":"24","automatic_rank":"3"},{"variant_id":"2","automatic_rank":"4"}],"items":[],"intents":[]}')),
  'A C X B','R4 unrecorded no-op creates no intention during reconstruction');

-- Internal privileges and actual role calls, including service_role BYPASSRLS.
select ok(not p.prosecdef and p.provolatile='s' and p.proparallel='s' and p.proconfig=array['search_path=""'],
  'Pure stable parallel-safe invoker with empty search_path') from pg_proc p
  where p.oid='private.merge_collection_relative_order(uuid,private.collection_order_canonical_entry[],private.collection_order_item_entry[],private.collection_order_intents[])'::regprocedure;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.proname='merge_collection_relative_order' and a.grantee=0),'No PUBLIC function grant');
select ok(not has_function_privilege(r,
  'private.merge_collection_relative_order(uuid,private.collection_order_canonical_entry[],private.collection_order_item_entry[],private.collection_order_intents[])',
  'EXECUTE'),r || ' cannot execute engine') from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_type_privilege(r,'private.' || t,'USAGE'),r || ' cannot use input type ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['collection_order_canonical_entry','collection_order_item_entry']) t;
set local role anon;
select throws_ok($$select private.merge_collection_relative_order('80000000-0000-0000-0000-000000000000','{}','{}','{}')$$,
  '42501',null,'Actual anon call refused');
reset role;
set local role authenticated;
select throws_ok($$select private.merge_collection_relative_order('80000000-0000-0000-0000-000000000000','{}','{}','{}')$$,
  '42501',null,'Actual authenticated call refused');
reset role;
set local role service_role;
select throws_ok($$select private.merge_collection_relative_order('80000000-0000-0000-0000-000000000000','{}','{}','{}')$$,
  '42501',null,'Actual service_role call refused');
reset role;
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('merge_collection_relative_order','preview_collection_update',
    'apply_collection_update')),'No public engine/preview/apply writer; hiding delivered separately in 8C');
select results_eq($$select id,order_contract_version,personal_revision from public.collections order by id$$,
  $$select * from engine_parents_before order by id$$,'Pure engine preserves every actual parent contract/revision');
select results_eq($$select * from private.collection_order_intents order by collection_id,sequence$$,
  $$select * from engine_intents_before order by collection_id,sequence$$,'Pure engine preserves actual journal');
select results_eq($$select * from private.collection_operation_receipts order by collection_id,operation_id$$,
  $$select * from engine_receipts_before order by collection_id,operation_id$$,'Pure engine preserves actual receipts');
select * from finish();
rollback;
