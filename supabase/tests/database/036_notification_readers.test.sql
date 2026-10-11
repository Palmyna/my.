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
savepoint empty_centre;
select pg_temp.caller(3);
delete from private.notification_announcements where id in (select pg_temp.a(n) from generate_series(1,7) n);
select is(public.get_notification_center(),'{"items":[],"unread_count":"0","next_cursor":null}'::jsonb,'Empty centre strict envelope');
select is(public.get_notification_unread_count(),'{"unread_count":"0"}'::jsonb,'Empty global count');
rollback to empty_centre;
select pg_temp.caller(1);
select ok(not exists(select 1 from jsonb_array_elements(public.get_notification_center()->'items') i
  where i->>'kind'='collection_update'),'No useful delta excludes owner collection');
select is(public.get_notification_unread_count()->>'unread_count','4','No-delta centre/count agree');
update public.catalog_variants set sort_order=7-sort_order where source_card_id=-95001;
update public.automatic_target_states set generation_version=8,content_hash=(select encode(sha256(convert_to('['||
  string_agg(to_json(variant_id::text)::text,',' order by automatic_rank)||']','UTF8')),'hex')
  from private.canonical_collection_variants('set',-95001)) where id=-95001;
create temp table tracking_before as select jsonb_build_object(
  'collections',(select jsonb_agg(to_jsonb(r)) from private.collection_notification_reads r),
  'announcements',(select jsonb_agg(to_jsonb(s)) from private.notification_announcement_states s)) data;
create temp table head as select public.get_notification_center(2,null) data;
select is((select data->>'unread_count' from head),'5','Global count includes collection and four active publications');
select is(public.get_notification_unread_count()->>'unread_count','5','Centre/count same predicates');
select is((select jsonb_array_length(data->'items') from head),2,'Requested page length');
select is((select data->'items'->0->>'kind' from head),'collection_update','Collection first by newer target date');
select is((select data->'items'->0->>'revision' from head),'8','Collection revision decimal text');
select is((select data->'items'->0->>'applied_target_version' from head),'7','Applied BIGINT decimal text');
select is((select data->'items'->0->'action' from head),'{"kind":"collection_preview","collection_id":"c2500000-0000-0000-0000-000000000001"}'::jsonb,'Typed collection action');
select is((select data->'next_cursor' from head),jsonb_build_object('updated_at',(select data->'items'->1->>'updated_at' from head),
  'notification_key','announcement:'||pg_temp.a(1)::text),'Strict cursor at last item');
create temp table second as select public.get_notification_center(2,(select data->'next_cursor' from head)) data;
select is((select data->>'unread_count' from second),'5','Global count independent of cursor');
select is((select data->'items'->0->>'kind' from second),'changelog','Timestamp tie resolved by key');
select is((select data->'items'->0->'action' from second),jsonb_build_object('kind','notification_content','announcement_id',pg_temp.a(2)),'Unvalidated publication action never returned');
create temp table tail as select public.get_notification_center(2,(select data->'next_cursor' from second)) data;
select is((select jsonb_array_length(data->'items') from tail),1,'Final partial page');
select is((select data->'next_cursor' from tail),'null'::jsonb,'No trailing cursor');
select is((select count(distinct item->>'notification_key')::int from
  (select jsonb_array_elements(data->'items') item from head union all select jsonb_array_elements(data->'items') from second
    union all select jsonb_array_elements(data->'items') from tail) all_pages),5,'All page identities unique');
select is(public.get_notification_content(pg_temp.a(1))->>'body','Plain text <script>alert(1)</script> javascript:example','Body preserved as plain text');
select is(public.get_notification_content(pg_temp.a(2))->>'revision',repeat('a',64),'Content revision is immutable hash');
select is(public.get_notification_content(pg_temp.a(2))->>'app_version','0.8.15','Changelog version');
select is(public.get_notification_content(pg_temp.a(5)),null::jsonb,'Expired content safely unavailable');
select is(public.get_notification_content(pg_temp.a(6)),null::jsonb,'Withdrawn content safely unavailable');
select is(public.get_notification_content(pg_temp.a(7)),null::jsonb,'Future publication unavailable');
select is(public.get_notification_content(pg_temp.a(99)),null::jsonb,'Unknown identity same unavailable result');
select is(jsonb_build_object('collections',(select jsonb_agg(to_jsonb(r)) from private.collection_notification_reads r),
  'announcements',(select jsonb_agg(to_jsonb(s)) from private.notification_announcement_states s)),
  (select data from tracking_before),'All readers pure, no tracking writes');
select ok(not exists(select 1 from jsonb_array_elements(public.get_notification_center()->'items') i
  where i->>'collection_id' in ('c2500000-0000-0000-0000-000000000002','c2500000-0000-0000-0000-000000000008')),'Free/legacy excluded');
select pg_temp.caller(2);
select is(public.get_notification_unread_count()->>'unread_count','1','New Auth account sees only include_new_users');
select is(public.get_notification_content(pg_temp.a(1)),null::jsonb,'Historical account audience cannot be chosen by browser');
select is(public.get_notification_content(pg_temp.a(4))->>'kind','announcement','Explicit audience exception');
select ok(not exists(select 1 from jsonb_array_elements(public.get_notification_center()->'items') i where i->>'kind'='collection_update'),'Shared recipient excluded');
select pg_temp.caller(1);
select is(public.get_notification_unread_count()->>'unread_count','5','Late profile creation does not change Auth audience');
savepoint auth_boundary;
update auth.users set created_at=(select published_at from private.notification_announcements where id=pg_temp.a(1))
  where id='a2500000-0000-0000-0000-000000000001';
select is(public.get_notification_unread_count()->>'unread_count','5','Auth registration exactly at publication is eligible');
update auth.users set created_at=created_at+interval '1 microsecond' where id='a2500000-0000-0000-0000-000000000001';
select is(public.get_notification_unread_count()->>'unread_count','2','Auth registration after publication sees only collection and explicit exception');
rollback to auth_boundary;
insert into private.notification_announcement_states values('a2500000-0000-0000-0000-000000000001',pg_temp.a(1),now(),now());
select is(public.get_notification_content(pg_temp.a(1)),null::jsonb,'Processed content excluded');
select is(public.get_notification_unread_count()->>'unread_count','4','Processed excluded from count');
select is(public.get_notification_center()->>'unread_count','4','Processed excluded from centre');
-- More than the maximum page, with timestamp ties.
insert into private.notification_announcements(id,publication_key,category,title,body,requires_action,published_at,content_hash,published_by,publication_context)
select pg_temp.a(n),'8g2.page.'||n,'announcement','Page fixture','Plain text',false,now()-interval '1 day',repeat('b',64),'synthetic','{}'
from generate_series(10,70) n;
select is(jsonb_array_length(public.get_notification_center()->'items'),20,'Default 20');
select is(jsonb_array_length(public.get_notification_center(null,null)->'items'),20,'NULL limit uses default');
select is(jsonb_array_length(public.get_notification_center(50,null)->'items'),50,'Maximum 50');
select is(public.get_notification_unread_count()->>'unread_count','65','Count not limited to 20 or 50');
select is(public.get_notification_center(1,'{"updated_at":"2000-01-01T00:00:00Z","notification_key":"announcement:f3600000-0000-0000-0000-000000000001"}')->>'unread_count','65','Empty cursor tail retains global count');
select throws_ok('select public.get_notification_center(0,null)','22023','notification_input_invalid','Zero limit');
select throws_ok('select public.get_notification_center(51,null)','22023','notification_input_invalid','Oversized limit');
select throws_ok('select public.get_notification_center(20,''null''::jsonb)','22023','notification_input_invalid','JSON null cursor invalid');
select throws_ok('select public.get_notification_center(20,''[]''::jsonb)','22023','notification_input_invalid','Array cursor invalid');
select throws_ok('select public.get_notification_center(20,''{}''::jsonb)','22023','notification_input_invalid','Missing cursor fields');
select throws_ok('select public.get_notification_center(20,''{"updated_at":"2026-02-30T00:00:00Z","notification_key":"announcement:f3600000-0000-0000-0000-000000000001"}''::jsonb)','22023','notification_input_invalid','Invalid calendar date');
select throws_ok('select public.get_notification_center(20,''{"updated_at":"2026-01-01T00:00:00Z","notification_key":"javascript:alert(1)"}''::jsonb)','22023','notification_input_invalid','Invalid key');
select throws_ok('select public.get_notification_center(20,''{"updated_at":"2026-01-01T00:00:00Z","notification_key":"announcement:f3600000-0000-0000-0000-000000000001","extra":1}''::jsonb)','22023','notification_input_invalid','Extra cursor property');

-- ACL/RLS/security facts, all five public signatures and private helpers.
select ok(bool_and(p.prosecdef and p.proconfig=array['search_path=""']::text[]), 'All five RPCs definer with closed search_path')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('get_notification_center','get_notification_unread_count','get_notification_content','mark_notification_read','process_announcement_notification');
select is(count(*)::int,5,'Exactly five signatures') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('get_notification_center','get_notification_unread_count','get_notification_content','mark_notification_read','process_announcement_notification');
select ok(bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('service_role',p.oid,'EXECUTE')), 'Only authenticated API execution')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('get_notification_center','get_notification_unread_count','get_notification_content','mark_notification_read','process_announcement_notification');
select ok(bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE') and not p.prosecdef),'Private helpers closed INVOKER')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
  and p.proname in ('notification_caller','read_notification_announcements','read_active_notifications');
select ok(bool_and(c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'Private storage RLS/no browser DML')
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
  and c.relname in ('notification_announcements','notification_announcement_states','collection_notification_reads');
select pg_temp.caller(1,'aal1');
select throws_ok('select public.get_notification_center()','42501','notification_unavailable','AAL1 centre denied');
select throws_ok('select public.get_notification_unread_count()','42501','notification_unavailable','AAL1 count denied');
select throws_ok('select public.get_notification_content(pg_temp.a(2))','42501','notification_unavailable','AAL1 content denied');
select pg_temp.caller(4);
select throws_ok('select public.get_notification_center()','42501','notification_unavailable','Absent profile denied');
select set_config('request.jwt.claims','{}',true);
select throws_ok('select public.get_notification_unread_count()','42501','notification_unavailable','Anonymous denied');
select * from finish();
rollback;
