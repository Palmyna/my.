begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
\ir manual_collection_items.fixtures.inc

-- Structural expansion, including nullable legacy introductions.
select col_type_is('public', 'collections', 'personal_revision', 'bigint', 'Personal revision BIGINT');
select col_type_is('public', 'collections', 'order_contract_version', 'smallint', 'Contract SMALLINT');
select col_type_is('public', 'collection_items', 'introduced_revision', 'bigint', 'Introduction BIGINT');
select col_not_null('public', 'collections', 'personal_revision', 'Revision required');
select col_not_null('public', 'collections', 'order_contract_version', 'Contract required');
select col_is_null('public', 'collection_items', 'introduced_revision', 'Introduction nullable');
select col_default_is('public', 'collections', 'personal_revision', '0', 'Revision defaults zero');
select col_default_is('public', 'collections', 'order_contract_version', '2', 'Contract defaults v2 after 8B.8 activation');
select col_hasnt_default('public', 'collection_items', 'introduced_revision', 'No introduction backfill/default');
select has_column('public', 'collection_items', 'is_hidden', '8C additive field present; ordering foundations unchanged');
select ok((select bool_and(order_contract_version=1 and personal_revision=0) from public.collections where owner_id='a1700000-0000-0000-0000-000000000001'),
  'All historical and fixture parents remain legacy at revision zero');
select ok((select bool_and(i.introduced_revision is null) from public.collection_items i join public.collections c on c.id=i.collection_id where c.owner_id='a1700000-0000-0000-0000-000000000001'),
  'Historical manual and automatic items need no introduction or journal');

select throws_ok(format('update public.collections set personal_revision=%s where id=%L', v,
  'c1700000-0000-0000-0000-000000000001'), code, null, label)
  from (values ('-1','23514','Negative revision refused'), ('null','23502','NULL revision refused')) t(v,code,label);
select throws_ok(format('update public.collections set order_contract_version=%s where id=%L', v,
  'c1700000-0000-0000-0000-000000000001'), code, null, label)
  from (values ('0','23514','Contract zero refused'), ('3','23514','Unknown contract refused'),
    ('null','23502','NULL contract refused')) t(v,code,label);
select throws_ok(format('update public.collection_items set introduced_revision=%s where id=%L', v,
  'd1700000-0000-0000-0000-000000000002'), '23514', null, 'Nonpositive introduction refused: ' || v)
  from unnest(array['0','-1']) v;
savepoint positive_values;
update public.collections set personal_revision=9223372036854775807,order_contract_version=2
  where id='c1700000-0000-0000-0000-000000000001';
update public.collection_items set introduced_revision=9223372036854775807
  where id='d1700000-0000-0000-0000-000000000002';
insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
  values('c1700000-0000-0000-0000-000000000001',9223372036854775807,gen_random_uuid(),
    'd1700000-0000-0000-0000-000000000002','manual_add','end','{}');
select is((select introduced_revision from public.collection_items where id='d1700000-0000-0000-0000-000000000002'),
  9223372036854775807::bigint, 'Positive BIGINT introduction supported with legitimate initial placement');
select lives_ok('set constraints all immediate','Complete maximum BIGINT fixture satisfies initial-placement invariant');
rollback to positive_values;

select col_type_is('private', t, c, typ, t || '.' || c || ' type') from (values
  ('collection_order_intents','collection_id','uuid'), ('collection_order_intents','sequence','bigint'),
  ('collection_order_intents','operation_id','uuid'), ('collection_order_intents','subject_item_id','uuid'),
  ('collection_order_intents','kind','text'), ('collection_order_intents','destination','text'),
  ('collection_order_intents','anchor_item_id','uuid'), ('collection_order_intents','fallback_item_ids','uuid[]'),
  ('collection_order_intents','accepted_at','timestamp with time zone'),
  ('collection_operation_receipts','collection_id','uuid'), ('collection_operation_receipts','operation_id','uuid'),
  ('collection_operation_receipts','kind','text'), ('collection_operation_receipts','request_hash','text'),
  ('collection_operation_receipts','accepted_revision','bigint'), ('collection_operation_receipts','result','jsonb'),
  ('collection_operation_receipts','accepted_at','timestamp with time zone')) fields(t,c,typ);
select col_not_null('private', t, c, t || '.' || c || ' required') from (values
  ('collection_order_intents','collection_id'), ('collection_order_intents','sequence'),
  ('collection_order_intents','operation_id'), ('collection_order_intents','subject_item_id'),
  ('collection_order_intents','kind'), ('collection_order_intents','destination'),
  ('collection_order_intents','fallback_item_ids'), ('collection_order_intents','accepted_at'),
  ('collection_operation_receipts','collection_id'), ('collection_operation_receipts','operation_id'),
  ('collection_operation_receipts','kind'), ('collection_operation_receipts','request_hash'),
  ('collection_operation_receipts','accepted_revision'), ('collection_operation_receipts','result'),
  ('collection_operation_receipts','accepted_at')) fields(t,c);
select col_is_null('private','collection_order_intents','anchor_item_id','Historical anchor nullable');
select col_default_is('private',t,'accepted_at','now()',t || ' server acceptance timestamp')
  from unnest(array['collection_order_intents','collection_operation_receipts']) t;
select has_pk('private',t,t || ' has PK') from unnest(array['collection_order_intents','collection_operation_receipts']) t;
select has_index('private','collection_order_intents','collection_order_intents_subject_idx','Subject removal index');
select ok((select count(*)=2 and bool_and(confdeltype='c') from pg_constraint
  where conrelid='private.collection_order_intents'::regclass and contype='f'), 'Journal has only parent/subject cascading FKs');
select ok((select count(*)=1 and bool_and(confdeltype='c') from pg_constraint
  where conrelid='private.collection_operation_receipts'::regclass and contype='f'), 'Receipt depends only on parent');

insert into public.collection_items(id,collection_id,variant_id,origin,sort_position) values
  ('d1700000-0000-0000-0000-000000000003','c1700000-0000-0000-0000-000000000001',-87003,'manual',3),
  ('d1700000-0000-0000-0000-000000000004','c1700000-0000-0000-0000-000000000001',-87004,'manual',4);
update public.collection_items set sort_position=5 where id='d1700000-0000-0000-0000-000000000002';
insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,anchor_item_id,fallback_item_ids) values
  ('c1700000-0000-0000-0000-000000000001',1,'e1700000-0000-0000-0000-000000000001',
   'd1700000-0000-0000-0000-000000000001','move','before','d1700000-0000-0000-0000-000000000003',
   array['d1700000-0000-0000-0000-000000000004','d1700000-0000-0000-0000-000000000002']::uuid[]),
  ('c1700000-0000-0000-0000-000000000001',2,'e1700000-0000-0000-0000-000000000002',
   'd1700000-0000-0000-0000-000000000002','manual_add','end',null,'{}'),
  ('c1700000-0000-0000-0000-000000000001',3,'e1700000-0000-0000-0000-000000000003',
   'd1700000-0000-0000-0000-000000000003','manual_add','end',null,'{}'),
  ('c1700000-0000-0000-0000-000000000001',10,'e1700000-0000-0000-0000-000000000010',
   'd1700000-0000-0000-0000-000000000001','move','end',null,'{}');
select is((select count(*) from private.collection_order_intents where subject_item_id='d1700000-0000-0000-0000-000000000001'),
  2::bigint, 'Repeated subjects and sequence gaps preserve full chronology');
create temp table intent_seed as select to_jsonb(i) data from private.collection_order_intents i where sequence=1;

-- Each failed insert has a fresh identity unless deliberately testing uniqueness.
select throws_ok(format('insert into private.collection_order_intents select * from jsonb_populate_record(null::private.collection_order_intents,%L::jsonb)',
  data || jsonb_build_object('sequence',30,'operation_id',gen_random_uuid()) || patch), code, null, label)
from intent_seed cross join (values
  ('Sequence zero','{"sequence":0}'::jsonb,'23514'), ('Negative sequence','{"sequence":-1}','23514'),
  ('NULL sequence','{"sequence":null}','23502'), ('NULL operation','{"operation_id":null}','23502'),
  ('NULL subject','{"subject_item_id":null}','23502'), ('NULL kind','{"kind":null}','23502'),
  ('Unknown intention','{"kind":"remove"}','23514'), ('Unknown destination','{"destination":"after"}','23514'),
  ('NULL destination','{"destination":null}','23502'), ('Before needs anchor','{"anchor_item_id":null}','23514'),
  ('Self anchor','{"anchor_item_id":"d1700000-0000-0000-0000-000000000001"}','23514'),
  ('End forbids anchor','{"destination":"end","fallback_item_ids":[]}','23514'),
  ('End forbids fallback','{"destination":"end","anchor_item_id":null}','23514'),
  ('NULL fallback','{"fallback_item_ids":null}','23502'), ('NULL fallback member','{"fallback_item_ids":[null]}','23514'),
  ('Duplicate fallback','{"fallback_item_ids":["d1700000-0000-0000-0000-000000000004","d1700000-0000-0000-0000-000000000004"]}','23514'),
  ('Subject in fallback','{"fallback_item_ids":["d1700000-0000-0000-0000-000000000001"]}','23514'),
  ('Anchor in fallback','{"fallback_item_ids":["d1700000-0000-0000-0000-000000000003"]}','23514'),
  ('Multidimensional fallback','{"fallback_item_ids":[["d1700000-0000-0000-0000-000000000004"]]}','23514'),
  ('NULL timestamp','{"accepted_at":null}','23502'),
  ('Subject absent','{"subject_item_id":"d1700000-0000-0000-0000-000000000099"}','23503'),
  ('Subject outside parent','{"collection_id":"c1700000-0000-0000-0000-000000000002"}','23503'),
  ('Parent absent','{"collection_id":"c1700000-0000-0000-0000-000000000099"}','23503'),
  ('Duplicate sequence','{"sequence":1}','23505'),
  ('Duplicate operation','{"operation_id":"e1700000-0000-0000-0000-000000000001"}','23505')
) invalid(label,patch,code);
select throws_ok($$insert into private.collection_order_intents select collection_id,30,gen_random_uuid(),subject_item_id,
  kind,destination,anchor_item_id,'[0:0]={d1700000-0000-0000-0000-000000000004}'::uuid[],accepted_at
  from private.collection_order_intents where sequence=1$$, '23514', null, 'Noncanonical array bounds refused');
insert into public.collection_items(id,collection_id,variant_id,origin,sort_position) values
  ('d1700000-0000-0000-0000-000000000005','c1700000-0000-0000-0000-000000000002',-87002,'manual',1);
select lives_ok($$insert into private.collection_order_intents values
  ('c1700000-0000-0000-0000-000000000002',1,'e1700000-0000-0000-0000-000000000001',
   'd1700000-0000-0000-0000-000000000005',
   'move','before','d1700000-0000-0000-0000-000000000099',
   array['d1700000-0000-0000-0000-000000000098']::uuid[],now())$$,
  'Operation/sequence scoped by collection; absent historical identities accepted without FK');
select lives_ok($$insert into private.collection_order_intents values
  ('c1700000-0000-0000-0000-000000000001',9223372036854775807,gen_random_uuid(),
   'd1700000-0000-0000-0000-000000000001','move','before',
   'd1700000-0000-0000-0000-000000000099','{}',now())$$,
  'BIGINT sequence and before with empty historical suffix accepted');
select throws_ok(format('update private.collection_order_intents set %s where collection_id=%L and sequence=1',
  assignment,'c1700000-0000-0000-0000-000000000001'), '23514', 'collection_order_intent_immutable', label)
from (values
  ('anchor_item_id=''d1700000-0000-0000-0000-000000000098''','Anchor immutable'),
  ('fallback_item_ids=array[''d1700000-0000-0000-0000-000000000002'',''d1700000-0000-0000-0000-000000000004'']::uuid[]','Fallback order immutable'),
  ('sequence=40','Chronology immutable'), ('operation_id=gen_random_uuid()','Operation immutable'),
  ('accepted_at=accepted_at+interval ''1 second''','Acceptance time immutable'),
  ('kind=''manual_add''','Nature immutable'), ('subject_item_id=''d1700000-0000-0000-0000-000000000002''','Subject immutable'),
  ('destination=''end''','Destination immutable'),
  ('collection_id=''c1700000-0000-0000-0000-000000000002''','Parent immutable')
) changes(assignment,label);

insert into private.collection_operation_receipts(collection_id,operation_id,kind,request_hash,accepted_revision,result) values
  ('c1700000-0000-0000-0000-000000000001','e1700000-0000-0000-0000-000000000001','move',repeat('a',64),0,
   '{"outcome":"noop","personal_revision":"0"}');
create temp table receipt_seed as select to_jsonb(r) data from private.collection_operation_receipts r;
select throws_ok(format('insert into private.collection_operation_receipts select * from jsonb_populate_record(null::private.collection_operation_receipts,%L::jsonb)',
  data || jsonb_build_object('operation_id',gen_random_uuid()) || patch), code, null, label)
from receipt_seed cross join (values
  ('Unknown receipt kind','{"kind":"manual_add"}'::jsonb,'23514'), ('NULL receipt kind','{"kind":null}','23502'),
  ('Short hash','{"request_hash":"abc"}','23514'), ('Uppercase hash','{"request_hash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}','23514'),
  ('Nonhex hash','{"request_hash":"gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"}','23514'),
  ('NULL hash','{"request_hash":null}','23502'), ('Negative accepted revision','{"accepted_revision":-1}','23514'),
  ('NULL accepted revision','{"accepted_revision":null}','23502'), ('NULL result','{"result":null}','23502'),
  ('Array result','{"result":[]}','23514'), ('Scalar result','{"result":true}','23514'),
  ('NULL receipt timestamp','{"accepted_at":null}','23502'), ('NULL receipt operation','{"operation_id":null}','23502'),
  ('NULL receipt parent','{"collection_id":null}','23502'),
  ('Missing receipt parent','{"collection_id":"c1700000-0000-0000-0000-000000000099"}','23503'),
  ('Duplicate collection operation','{"operation_id":"e1700000-0000-0000-0000-000000000001"}','23505')
) invalid(label,patch,code);
select throws_ok($$insert into private.collection_operation_receipts values
  ('c1700000-0000-0000-0000-000000000001',gen_random_uuid(),'move',repeat('a',64),0,null,now())$$,
  '23502',null,'SQL NULL result refused');
select throws_ok($$insert into private.collection_operation_receipts values
  ('c1700000-0000-0000-0000-000000000001',gen_random_uuid(),'move',repeat('a',64),0,'null'::jsonb,now())$$,
  '23514',null,'JSON null result refused');
select lives_ok(format('insert into private.collection_operation_receipts values (%L,gen_random_uuid(),%L,%L,9223372036854775807,%L,now())',
  'c1700000-0000-0000-0000-000000000001',kind,repeat('b',64),'{"outcome":"accepted"}'), 'Receipt kind accepted: ' || kind)
from unnest(array['move','add','remove','hide','apply']) kind;
select lives_ok($$insert into private.collection_operation_receipts values
  ('c1700000-0000-0000-0000-000000000002','e1700000-0000-0000-0000-000000000001','move',repeat('a',64),0,'{}',now())$$,
  'Same UUID may belong to another collection');

-- New columns stay server-owned; existing column grants remain usable.
select ok(not has_column_privilege('authenticated','public.collections',c,p), 'Browser cannot ' || p || ' ' || c)
  from unnest(array['personal_revision','order_contract_version']) c cross join unnest(array['INSERT','UPDATE']) p;
select ok(not has_column_privilege('authenticated','public.collection_items','introduced_revision',p), 'Browser cannot ' || p || ' introduction')
  from unnest(array['INSERT','UPDATE']) p;
select ok(has_column_privilege('authenticated','public.collections','name','INSERT,UPDATE'), 'Existing collection name grants retained');
select ok(not has_any_column_privilege('authenticated','public.collection_items','INSERT,UPDATE'), 'Direct item writes remain closed');
select ok(relrowsecurity, relname || ' has RLS') from pg_class
  where oid in ('private.collection_order_intents'::regclass,'private.collection_operation_receipts'::regclass);
select is((select count(*) from pg_policy where polrelid in
  ('private.collection_order_intents'::regclass,'private.collection_operation_receipts'::regclass)),0::bigint,'Private tables have no access policy');
select ok(not has_table_privilege(r,'private.' || t,p), r || ' has no ' || p || ' on ' || t)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['collection_order_intents','collection_operation_receipts']) t cross join
    unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
select ok(not exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
  where c.oid in ('private.collection_order_intents'::regclass,'private.collection_operation_receipts'::regclass)
  and acl.grantee=0), 'No PUBLIC private-table grants');
select ok(not has_function_privilege(r,f,'EXECUTE'), r || ' cannot execute internal helper ' || f)
  from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['private.collection_order_fallback_is_valid(uuid[],uuid,uuid)','private.reject_collection_order_intent_update()']) f;

set local role anon;
select throws_ok('select * from private.collection_order_intents','42501',null,'Anonymous journal read refused');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Anonymous receipt read refused');
reset role;
set local role service_role;
select throws_ok('select * from private.collection_order_intents','42501',null,'Service role journal read refused despite BYPASSRLS');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Service role receipt read refused despite BYPASSRLS');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal2"}';
select throws_ok('select * from private.collection_order_intents','42501',null,'Owner journal read refused');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Owner receipt read refused');
select throws_ok($$insert into public.collections(name,collection_type,order_contract_version) values ('Forbidden v2','free',2)$$,
  '42501',null,'Browser cannot select contract on creation');
select throws_ok($$update public.collections set personal_revision=1 where id='c1700000-0000-0000-0000-000000000001'$$,
  '42501',null,'Browser cannot increment revision');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000002","aal":"aal2"}';
select throws_ok('select * from private.collection_order_intents','42501',null,'Shared viewer journal read refused');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Shared viewer receipt read refused');
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000003","aal":"aal2"}';
select throws_ok('select * from private.collection_order_intents','42501',null,'Third-party journal read refused');
select throws_ok('select * from private.collection_operation_receipts','42501',null,'Third-party receipt read refused');
reset role;
-- Defense in depth if a future migration accidentally grants SELECT.
grant select on private.collection_order_intents,private.collection_operation_receipts to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal2"}';
select is((select count(*) from private.collection_order_intents),0::bigint,'RLS hides journal even from owner with test SELECT grant');
select is((select count(*) from private.collection_operation_receipts),0::bigint,'RLS hides receipts even from owner with test SELECT grant');
reset role;
revoke select on private.collection_order_intents,private.collection_operation_receipts from authenticated;

-- Legacy mutations still work and do not write revision/introduction/history.
create temp table history_before as select data from intent_seed;
create temp table legacy_added(id uuid);
grant select,insert on legacy_added to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000001","aal":"aal2"}';
select lives_ok($$select public.reorder_collection_item('c1700000-0000-0000-0000-000000000001',
  'd1700000-0000-0000-0000-000000000002','start')$$,'Legacy reorder remains usable');
select is((public.get_collection_item_order('c1700000-0000-0000-0000-000000000001'))[1],
  'd1700000-0000-0000-0000-000000000002'::uuid,'Legacy order reader follows materialized order');
select lives_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001',
  'd1700000-0000-0000-0000-000000000003')$$,'Legacy removal of historical anchor remains usable');
reset role;
select results_eq($$select to_jsonb(i) from private.collection_order_intents i where collection_id='c1700000-0000-0000-0000-000000000001' and sequence=1$$,
  $$select data from history_before$$,'Removing anchor preserves entire historical intention including ordered fallback');
select is((select count(*) from private.collection_order_intents where subject_item_id='d1700000-0000-0000-0000-000000000003'),
  0::bigint,'Only removed anchor own intentions cascade');
set local role authenticated;
select lives_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001',
  'd1700000-0000-0000-0000-000000000004')$$,'Legacy removal of historical fallback remains usable');
select lives_ok($$select public.remove_manual_collection_item('c1700000-0000-0000-0000-000000000001',
  'd1700000-0000-0000-0000-000000000002')$$,'Subject removal cascades without compaction');
insert into legacy_added values(public.add_manual_collection_item('c1700000-0000-0000-0000-000000000001',-87002));
select ok((select id <> 'd1700000-0000-0000-0000-000000000002'::uuid from legacy_added),'Reintroduction creates a new UUID');
select ok((select introduced_revision is null from public.collection_items where id=(select id from legacy_added)),
  'Legacy add keeps NULL introduction without requiring intent');
select is((select sort_position from public.collection_items where id='d1700000-0000-0000-0000-000000000001'),
  1::numeric,'Other positions unchanged by removal/add');
select is((select count(*) from public.physical_copies where variant_id=-87002),1::bigint,'Copies retained on subject removal');
select is((select jsonb_array_length(public.get_collection_content('c1700000-0000-0000-0000-000000000001'))),2,'Legacy content reader intact');
reset role;
select results_eq($$select to_jsonb(i) from private.collection_order_intents i where collection_id='c1700000-0000-0000-0000-000000000001' and sequence=1$$,
  $$select data from history_before$$,'Removed fallbacks and reintroduced variant do not rewrite historical UUIDs');
select is((select count(*) from private.collection_order_intents where subject_item_id=(select id from legacy_added)),
  0::bigint,'New item does not inherit old intentions');
select is((select count(*) from private.collection_order_intents where subject_item_id='d1700000-0000-0000-0000-000000000002'),
  0::bigint,'Removed manual subject own placement deleted');
select is((select count(*) from private.collection_operation_receipts where collection_id='c1700000-0000-0000-0000-000000000001'),
  6::bigint,'Receipts retained independently of removed subjects');
delete from public.collection_items where id='d1700000-0000-0000-0000-000000000001';
select is((select count(*) from private.collection_order_intents where collection_id='c1700000-0000-0000-0000-000000000001'),
  0::bigint,'Real removal of automatic subject cascades all repeated intentions');

-- Creation paths now activate v2; historical fixtures above still exercise legacy.
update public.catalog_variants set size='standard' where source_card_id=-87001;
update public.automatic_target_states set content_hash=(select encode(extensions.digest(convert_to(
  '[' || coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']', 'UTF8'),'sha256'),'hex')
  from private.canonical_collection_variants('set',-87001)) where id=-87001;
create temp table created(collection_id uuid,created boolean);
grant select,insert on created to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1700000-0000-0000-0000-000000000003","aal":"aal2"}';
insert into created select * from public.create_automatic_collection('New created auto','set',-87001);
select ok((select created from created),'Existing automatic creation still creates');
select ok((select order_contract_version=2 and personal_revision=0 from public.collections where id=(select collection_id from created)),
  'New automatic parent contract 2 at revision zero');
select ok((select bool_and(introduced_revision is null) from public.collection_items where collection_id=(select collection_id from created)),
  'Native automatic items need no manual introduction');
select lives_ok($$insert into public.collections(name,collection_type) values ('New free creation','free')$$,
  'Existing column-limited free creation remains usable');
select ok((select order_contract_version=2 and personal_revision=0 from public.collections where name='New free creation'),
  'New free parent contract 2 at revision zero');
reset role;
select ok((select bool_and(order_contract_version=1 and personal_revision=0) from public.collections where owner_id='a1700000-0000-0000-0000-000000000001'),
  'Legacy mutations preserve their original contract and revisions');

delete from public.collections where id='c1700000-0000-0000-0000-000000000002';
select is((select count(*) from private.collection_order_intents where collection_id='c1700000-0000-0000-0000-000000000002'),
  0::bigint,'Parent deletion cascades journal');
select is((select count(*) from private.collection_operation_receipts where collection_id='c1700000-0000-0000-0000-000000000002'),
  0::bigint,'Parent deletion cascades receipts');
select is((select count(*) from private.collection_operation_receipts where collection_id='c1700000-0000-0000-0000-000000000001'),
  6::bigint,'Unrelated parent receipts intact');
select * from finish();
rollback;
