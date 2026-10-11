begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir notification_api.fixtures.inc
create function pg_temp.caller(n integer,aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a2500000-0000-0000-0000-'||lpad(n::text,12,'0'),'aal',aal)::text,true)::void;
$$;
create function pg_temp.a(n integer) returns uuid language sql immutable as $$
  select ('f3600000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.read_collection(version text) returns text language sql as $$
  select public.mark_notification_read('collection:c2500000-0000-0000-0000-000000000001',version)->>'outcome';
$$;
create function pg_temp.state(n integer) returns jsonb language sql stable as $$
  select to_jsonb(s) from private.notification_announcement_states s
  where user_id='a2500000-0000-0000-0000-000000000001' and announcement_id=pg_temp.a(n);
$$;
select pg_temp.caller(1);
update public.collections set applied_target_version=1 where id='c2500000-0000-0000-0000-000000000001';
update public.catalog_variants set sort_order=7-sort_order where source_card_id=-95001;
update public.automatic_target_states set generation_version=2,content_hash=(select encode(sha256(convert_to('['||
  string_agg(to_json(variant_id::text)::text,',' order by automatic_rank)||']','UTF8')),'hex')
  from private.canonical_collection_variants('set',-95001)) where id=-95001;
create temp table parent_before as select to_jsonb(c) data from public.collections c where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.read_collection('3'),'obsolete','Future revision not acknowledged');
select is((select count(*)::int from private.collection_notification_reads),0,'Future read writes nothing');
select is(pg_temp.read_collection('2'),'recorded','First read observed version 2');
create temp table read_before as select * from private.collection_notification_reads where collection_id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.read_collection('2'),'recorded','Same-version retry');
select is((select to_jsonb(r) from private.collection_notification_reads r where collection_id='c2500000-0000-0000-0000-000000000001'),
  (select to_jsonb(r) from read_before r),'Retry preserves exact version/date');
select is(pg_temp.read_collection('1'),'recorded','Older positive observation accepted monotonically');
select is((select read_target_version::text from private.collection_notification_reads),'2','Older read cannot regress version');
select is((select read_at from private.collection_notification_reads),(select read_at from read_before),'Older read cannot reset timestamp');
select is((select e->>'state' from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'),'read','Observed current collection is read but active');
select is((select to_jsonb(c) from public.collections c where id='c2500000-0000-0000-0000-000000000001'),(select data from parent_before),'Read never applies or alters parent/revision');
update public.automatic_target_states set generation_version=3 where id=-95001;
select is(pg_temp.read_collection('2'),'recorded','Version 2 acknowledgement after version 3 arrives');
select is((select e->>'state' from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'),'unread','Version 3 remains unread');
select is((select read_target_version::text from private.collection_notification_reads),'2','Never acknowledge unseen version 3');
select is(pg_temp.read_collection('3'),'recorded','Explicit version progression');
select ok((select read_at from private.collection_notification_reads)>(select read_at from read_before),'Date changes only on real progression');
select is(pg_temp.read_collection('2'),'recorded','Late old observation after progression');
select is((select read_target_version::text from private.collection_notification_reads),'3','Progression remains monotone');
select pg_temp.caller(2);
select is(pg_temp.read_collection('3'),'obsolete','Shared recipient cannot acknowledge owner event');
select pg_temp.caller(3);
select is(pg_temp.read_collection('3'),'obsolete','Third party cannot acknowledge owner event');
select pg_temp.caller(1);
select is(public.mark_notification_read('collection:c2500000-0000-0000-0000-000000000002','1')->>'outcome','obsolete','Free collection inactive');
select is(public.mark_notification_read('collection:c2500000-0000-0000-0000-000000000008','1')->>'outcome','obsolete','Legacy inactive');
select throws_ok('select pg_temp.read_collection(''0'')','22023','notification_input_invalid','Zero version rejected');
select throws_ok('select pg_temp.read_collection(''02'')','22023','notification_input_invalid','Noncanonical decimal rejected');
select throws_ok('select pg_temp.read_collection(''9223372036854775808'')','22023','notification_input_invalid','BIGINT overflow rejected');
select throws_ok('select pg_temp.read_collection(''-1'')','22023','notification_input_invalid','Negative version rejected');
select throws_ok('select public.mark_notification_read(''collection:not-a-uuid'',''2'')','22023','notification_input_invalid','Malformed key rejected');

select is(public.mark_notification_read('announcement:'||pg_temp.a(1),repeat('b',64))->>'outcome','obsolete','Wrong announcement hash no write');
select is(pg_temp.state(1),null::jsonb,'Wrong hash leaves sparse state absent');
select is(public.mark_notification_read('announcement:'||pg_temp.a(1),repeat('a',64))->>'outcome','recorded','First announcement read');
create temp table announcement_read as select pg_temp.state(1) data;
select is(public.mark_notification_read('announcement:'||pg_temp.a(1),repeat('a',64))->>'outcome','recorded','Announcement read retry');
select is(pg_temp.state(1),(select data from announcement_read),'Read retry timestamps preserved');
select is(pg_temp.state(1)->'processed_at','null'::jsonb,'Reading does not process announcement');
select is(public.get_notification_content(pg_temp.a(1))->>'state','read','Read content remains accessible');
select is(public.process_announcement_notification(pg_temp.a(1),repeat('a',64))->>'outcome','recorded','Ordinary announcement processed');
select is(pg_temp.state(1)->'read_at',(select data->'read_at' from announcement_read),'Processing preserves acquired read date');
select ok((pg_temp.state(1)->>'processed_at')::timestamptz >= (pg_temp.state(1)->>'read_at')::timestamptz,'Atomic ordered timestamps');
create temp table processed_before as select pg_temp.state(1) data;
select is(public.process_announcement_notification(pg_temp.a(1),repeat('a',64))->>'outcome','recorded','Process retry idempotent');
select is(pg_temp.state(1),(select data from processed_before),'Process retry preserves both timestamps');
select is(public.mark_notification_read('announcement:'||pg_temp.a(1),repeat('a',64))->>'outcome','obsolete','Processed read obsolete');
select is(pg_temp.state(1),(select data from processed_before),'Late read cannot resurrect or erase processed date');
select is(public.get_notification_content(pg_temp.a(1)),null::jsonb,'Processed content unavailable');
select ok(not exists(select 1 from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'announcement_id'=pg_temp.a(1)::text),'Processed excluded from centre');
select is(public.process_announcement_notification(pg_temp.a(2),repeat('a',64))->>'outcome','recorded','Changelog direct process reads and processes atomically');
select is(pg_temp.state(2)->'read_at',pg_temp.state(2)->'processed_at','Fresh ordinary process has identical read/process dates');
select throws_ok('select public.process_announcement_notification(pg_temp.a(3),repeat(''a'',64))','42501','notification_action_unresolved','Action-required cannot be treated by click/RPC');
select is(pg_temp.state(3),null::jsonb,'Refused action creates no state');
select is(public.mark_notification_read('announcement:'||pg_temp.a(3),repeat('a',64))->>'outcome','recorded','Action-required may be read');
select throws_ok('select public.process_announcement_notification(pg_temp.a(3),repeat(''a'',64))','42501','notification_action_unresolved','Read is still not action proof');
select is(pg_temp.state(3)->'processed_at','null'::jsonb,'Action-required stays unprocessed');
select is(public.process_announcement_notification('c2500000-0000-0000-0000-000000000001',repeat('a',64))->>'outcome','obsolete','Announcement RPC cannot treat collection UUID');
select is(public.process_announcement_notification(pg_temp.a(5),repeat('a',64))->>'outcome','obsolete','Expired process obsolete');
select is(public.process_announcement_notification(pg_temp.a(6),repeat('a',64))->>'outcome','obsolete','Withdrawn process obsolete');
select is(public.mark_notification_read('announcement:'||pg_temp.a(6),repeat('a',64))->>'outcome','obsolete','Withdrawn read obsolete');
select pg_temp.caller(2);
select is(public.process_announcement_notification(pg_temp.a(3),repeat('a',64))->>'outcome','obsolete','Ineligible caller safely obsolete before action info');
select is(public.process_announcement_notification(pg_temp.a(4),repeat('a',64))->>'outcome','recorded','Eligible exception affects only caller');
select pg_temp.caller(1);
select is(pg_temp.state(4),null::jsonb,'Another user process never changes owner state');
update private.notification_announcements set withdrawn_at=clock_timestamp() where id=pg_temp.a(1);
select is(public.process_announcement_notification(pg_temp.a(1),repeat('a',64))->>'outcome','obsolete','Retired process retry does not resurrect');
select is(pg_temp.state(1),(select data from processed_before),'Retirement preserves history');
select throws_ok('select public.process_announcement_notification(pg_temp.a(2),''ABC'')','22023','notification_input_invalid','Malformed observed hash rejected');

-- Exact BIGINT transport and actual application, no alternate process path.
update public.automatic_target_states set generation_version=9007199254740999 where id=-95001;
select is(pg_temp.read_collection('9007199254740997'),'recorded','Observed version above JS safe integer');
select is((select read_target_version::text from private.collection_notification_reads),'9007199254740997','Exact BIGINT persisted');
select is((select e->>'revision' from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'),'9007199254740999','Exact current BIGINT returned');
select is((select e->>'state' from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'),'unread','Newer exact BIGINT unread');
select is(public.apply_collection_update('c2500000-0000-0000-0000-000000000001',public.preview_collection_update('c2500000-0000-0000-0000-000000000001')->'token','e3700000-0000-0000-0000-000000000001')->>'outcome','applied','Actual 8F application');
select is(pg_temp.read_collection('9007199254740999'),'obsolete','Already-applied collection obsolete');
select ok(not exists(select 1 from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'),'Applied event disappears');
delete from public.collections where id='c2500000-0000-0000-0000-000000000001';
select is(pg_temp.read_collection('3'),'obsolete','Deleted collection obsolete');
select is((select count(*)::int from private.collection_notification_reads),0,'Deleted synthetic collection cascades read tracking');

select pg_temp.caller(1,'aal1');
select throws_ok('select pg_temp.read_collection(''2'')','42501','notification_unavailable','AAL1 read denied');
select throws_ok('select public.process_announcement_notification(pg_temp.a(4),repeat(''a'',64))','42501','notification_unavailable','AAL1 process denied');
select pg_temp.caller(4);
select throws_ok('select pg_temp.read_collection(''2'')','42501','notification_unavailable','Absent-profile read denied');
select throws_ok('select public.process_announcement_notification(pg_temp.a(4),repeat(''a'',64))','42501','notification_unavailable','Absent-profile process denied');
select set_config('request.jwt.claims','{}',true);
select throws_ok('select pg_temp.read_collection(''2'')','42501','notification_unavailable','Anonymous read denied');
select throws_ok('select public.process_announcement_notification(pg_temp.a(4),repeat(''a'',64))','42501','notification_unavailable','Anonymous process denied');
select * from finish();
rollback;
