begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir collection_content.fixtures.inc
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc

select has_function('public','get_collection_content_v2',array['uuid'],'V2 content reader exists');
select ok((select not prosecdef and provolatile='s' and prolang=(select oid from pg_language where lanname='sql')
  and prorettype='jsonb'::regtype and not proretset and proconfig @> array['search_path=""']
  from pg_proc where oid='public.get_collection_content_v2(uuid)'::regprocedure),'One stable invoker SQL snapshot');
select ok(has_function_privilege('authenticated','public.get_collection_content_v2(uuid)','EXECUTE'),'Authenticated execution');
select ok(not has_function_privilege(role_name,'public.get_collection_content_v2(uuid)','EXECUTE'),role_name || ' execution denied')
  from unnest(array['anon','service_role']) role_name;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.get_collection_content_v2(uuid)'::regprocedure and a.grantee=0),'No PUBLIC execution');
select ok(exists(select 1 from information_schema.columns where table_schema='public'
  and table_name='collection_items' and column_name='is_hidden'),'8C persisted masking column available');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000001","aal":"aal2"}';
select results_eq($$select key from jsonb_object_keys(public.get_collection_content_v2(
  'c1600000-0000-0000-0000-000000000001')) key order by key$$,
  array['items','order_contract_version','personal_revision'],'Exactly three envelope keys');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'order_contract_version','1'::jsonb,'Actual legacy contract');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'personal_revision','"0"'::jsonb,'Revision zero is string');
select is((select jsonb_agg(item - 'is_hidden' order by ordinal) from jsonb_array_elements(
  public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items') with ordinality e(item,ordinal)),
  public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'All 15 historical fields/joins/possession and exact complete order retained');
select ok((select bool_and((select count(*)=16 from jsonb_object_keys(item)) and item->'is_hidden'='false'::jsonb
  and jsonb_typeof(item->'owned')='boolean' and jsonb_typeof(item->'variant_id')='string'
  and jsonb_typeof(item->'source_card_id')='string' and jsonb_typeof(item->'set_id')='string')
  from jsonb_array_elements(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items') item),
  'Sixteen item keys; is_hidden false; exact BIGINT and boolean types');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items'->3->>'variant_id',
  '-9007199254740995','Historical/inactive BIGINT beyond Number precision remains present and exact');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items'->4->>'source_card_id',
  '-9007199254740995','Source card BIGINT exact');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items'->4->>'set_id',
  '-9007199254740996','Set BIGINT exact');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000002'),
  '{"order_contract_version":1,"personal_revision":"0","items":[]}'::jsonb,'Visible empty legacy envelope');
select is(jsonb_array_length(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000003')->'items'),1005,'Complete unpaginated volume');
select is((select array_agg((item->>'collection_item_id')::uuid order by ordinal) from jsonb_array_elements(
  public.get_collection_content_v2('c1600000-0000-0000-0000-000000000003')->'items') with ordinality e(item,ordinal)),
  public.get_collection_item_order('c1600000-0000-0000-0000-000000000003'),'Whole volume matches technical order');
select is(public.get_collection_content_v2(null),null::jsonb,'NULL parent is SQL NULL');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000099'),null::jsonb,'Missing parent is SQL NULL');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001'),null::jsonb,'Foreign parent invisible');

set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000002","aal":"aal2"}';
select is((select jsonb_agg(item - 'is_hidden' order by ordinal) from jsonb_array_elements(
  public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items') with ordinality e(item,ordinal)),
  public.get_collection_content('c1600000-0000-0000-0000-000000000001'),'Shared reader uses owner possession and same historical rows');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001')->'items'->2->'owned','false'::jsonb,
  'Recipient copy is not owner possession');
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000002'),null::jsonb,'Unshared empty parent invisible');
set local request.jwt.claims = '{"sub":"a1600000-0000-0000-0000-000000000003","aal":"aal2"}';
select is(public.get_collection_content_v2('c1600000-0000-0000-0000-000000000001'),null::jsonb,'Third party invisible');

set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000004'),
  '{"order_contract_version":2,"personal_revision":"0","items":[]}'::jsonb,'Visible empty v2 free envelope');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001')->'order_contract_version','2'::jsonb,'Actual v2 automatic contract');
select is(jsonb_array_length(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000002')->'items'),1,'V2 free manual content');
select is((select jsonb_agg(item - 'is_hidden' order by ordinal) from jsonb_array_elements(
  public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001')->'items') with ordinality e(item,ordinal)),
  public.get_collection_content('c2500000-0000-0000-0000-000000000001'),'V2 automatic parity without replaying intentions');
select is(public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000001',
  'd2500000-0000-0000-0000-000000000005','start',null,2,'e2900000-0000-0000-0000-000000000001')->>'personal_revision','3','Writer revision accepted');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001')->>'personal_revision','3','Reader revision matches changed content');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001')->'items'->0->>'collection_item_id',
  'd2500000-0000-0000-0000-000000000005','Reader consumes materialized order after writer');
reset role;
update public.collections set personal_revision=9007199254740994 where id='c2500000-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select is(public.add_manual_collection_item_v2('c2500000-0000-0000-0000-000000000004',9007199254740997,'end',
  9007199254740994,'e2900000-0000-0000-0000-000000000002')->>'personal_revision','9007199254740995','Exact addition revision');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000004')->'personal_revision','"9007199254740995"'::jsonb,'Revision beyond Number is exact string');
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000004')->'items'->0->>'variant_id','9007199254740997','Exact positive variant BIGINT');
reset role;
update public.collections set personal_revision=9223372036854775807 where id='c2500000-0000-0000-0000-000000000004';
create temporary table before_reads as select (select to_jsonb(c) from public.collections c where id='c2500000-0000-0000-0000-000000000004') parent,
  (select jsonb_agg(to_jsonb(i) order by collection_id,sequence) from private.collection_order_intents i) intents,
  (select jsonb_agg(to_jsonb(r) order by collection_id,operation_id) from private.collection_operation_receipts r) receipts;
grant select on before_reads to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal2"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000004')->>'personal_revision','9223372036854775807','Maximum BIGINT revision exact');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(jsonb_array_length(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001')->'items'),5,'V2 shared read complete');
select throws_ok($$select public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000001',
  'd2500000-0000-0000-0000-000000000005','end',null,3,'e2900000-0000-0000-0000-000000000003')$$,
  '42501','collection_action_unavailable','Shared reader cannot write');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000003","aal":"aal2"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001'),null::jsonb,'V2 third party invisible');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000004","aal":"aal2"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001'),null::jsonb,'Missing profile invisible');
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000001","aal":"aal1"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001'),null::jsonb,'AAL1 invisible');
reset role;
delete from public.collection_shares where collection_id='c2500000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2500000-0000-0000-0000-000000000002","aal":"aal2"}';
select is(public.get_collection_content_v2('c2500000-0000-0000-0000-000000000001'),null::jsonb,'Revoked share invisible');
reset role;
select is((select to_jsonb(c) from public.collections c where id='c2500000-0000-0000-0000-000000000004'),(select parent from before_reads),'Reads preserve parent');
select is((select jsonb_agg(to_jsonb(i) order by collection_id,sequence) from private.collection_order_intents i),(select intents from before_reads),'Reads preserve journal');
select is((select jsonb_agg(to_jsonb(r) order by collection_id,operation_id) from private.collection_operation_receipts r),(select receipts from before_reads),'Reads preserve receipts');
select * from finish();
rollback;
