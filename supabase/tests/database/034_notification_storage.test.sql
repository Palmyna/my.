begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id) values
  ('a3500000-0000-0000-0000-000000000001'),('a3500000-0000-0000-0000-000000000002');
insert into public.collections(id,owner_id,name,collection_type) values
  ('c3500000-0000-0000-0000-000000000001','a3500000-0000-0000-0000-000000000001','Storage fixture','free');

create function pg_temp.announcement(changes jsonb) returns void language sql as $$
  insert into private.notification_announcements select * from jsonb_populate_record(null::private.notification_announcements,
    '{"id":"b3500000-0000-0000-0000-000000000001","publication_key":"fixture:8g1",
      "category":"announcement","title":"Titre","body":"Corps texte","app_version":null,"action":null,
      "requires_action":false,"include_new_users":false,"published_at":"2026-10-11T12:00:00Z",
      "expires_at":null,"withdrawn_at":null,"published_by":"fixture","publication_context":{}}'::jsonb
      || jsonb_build_object('content_hash',repeat('a',64)) || changes);
$$;

select columns_are('private','collection_notification_reads',array['collection_id','read_target_version','read_at'],
  'Collection read storage has only three fields; no redundant owner');
select col_type_is('private','collection_notification_reads','read_target_version','bigint','Column type');
select col_type_is('private','collection_notification_reads','read_at','timestamp with time zone','Column type');
select col_is_pk('private','collection_notification_reads','collection_id','pk collection_notification_reads.collection_id');
select col_is_fk('private','collection_notification_reads','collection_id','fk collection_notification_reads.collection_id');
select columns_are('private','notification_announcements',array['id','publication_key','category','title','body','app_version',
  'action','requires_action','include_new_users','published_at','expires_at','withdrawn_at','content_hash','published_by','publication_context']);
select col_is_pk('private','notification_announcements','id','pk notification_announcements.id');
select col_is_unique('private','notification_announcements','publication_key','unique notification_announcements.publication_key');
select col_type_is('private','notification_announcements','action','jsonb','Column type');
select col_type_is('private','notification_announcements','publication_context','jsonb','Column type');
select col_type_is('private','notification_announcements','requires_action','boolean','Column type');
select col_type_is('private','notification_announcements','published_at','timestamp with time zone','Column type');
select columns_are('private','notification_announcement_states',array['user_id','announcement_id','read_at','processed_at']);
select col_is_pk('private','notification_announcement_states',array['user_id','announcement_id']);
select col_is_fk('private','notification_announcement_states','user_id','fk notification_announcement_states.user_id');
select col_is_fk('private','notification_announcement_states','announcement_id','fk notification_announcement_states.announcement_id');

select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',0,now())$q$,'23514',null,'Read version must be positive');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',-1,now())$q$,'23514',null,'Negative read version rejected');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',null,now())$q$,'23502',null,'Read version required');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',1,null)$q$,'23502',null,'Read timestamp required');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',1,'infinity')$q$,'23514',null,'Infinite read date rejected');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000099',1,now())$q$,'23503',null,'Read parent FK');
select throws_ok($q$insert into private.collection_notification_reads values('bad-uuid',1,now())$q$,'22P02',null,'Invalid UUID rejected');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',9223372036854775808,now())$q$,'22003',null,'BIGINT overflow rejected');
insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',9007199254740997,now());
select is((select read_target_version::text from private.collection_notification_reads where collection_id='c3500000-0000-0000-0000-000000000001'),'9007199254740997','Exact BIGINT read storage');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',1,now())$q$,'23505',null,'One read state per collection');

-- Every failure is a statement subtransaction; no fixture publication persists.
select throws_ok(format('select pg_temp.announcement(%L::jsonb)',bad),'23514',null,label) from (values
  ('{"publication_key":""}'::jsonb,'Empty publication key'),
  ('{"publication_key":"Bad key"}'::jsonb,'ASCII publication key format'),
  (jsonb_build_object('publication_key',repeat('a',121)),'Publication key length'),
  ('{"category":"other"}'::jsonb,'Closed categories'),
  ('{"title":"   "}'::jsonb,'Nonempty title'),
  (jsonb_build_object('title',E'\t\n\r'),'Whitespace-only title rejected'),
  (jsonb_build_object('title',repeat('a',201)),'Title length'),
  ('{"body":" "}'::jsonb,'Nonempty body'),
  (jsonb_build_object('body',E'\t\n\r'),'Whitespace-only body rejected'),
  (jsonb_build_object('body',repeat('a',20001)),'Body length'),
  ('{"category":"changelog"}'::jsonb,'Changelog version required'),
  ('{"app_version":"01.2.3"}'::jsonb,'SemVer leading zero rejected'),
  ('{"app_version":"1.2"}'::jsonb,'Incomplete SemVer rejected'),
  ('{"app_version":"1.2.3-01"}'::jsonb,'SemVer prerelease leading zero rejected'),
  (jsonb_build_object('app_version','1.2.3+'||repeat('a',59)),'Version length'),
  ('{"action":[]}'::jsonb,'Action must be object or SQL NULL'),
  ('{"action":"javascript:bad"}'::jsonb,'Action string rejected'),
  ('{"publication_context":[]}'::jsonb,'Provenance must be object'),
  ('{"content_hash":"bad"}'::jsonb,'SHA256 format'),
  (jsonb_build_object('content_hash',repeat('A',64)),'Lowercase SHA256 required'),
  ('{"published_by":" "}'::jsonb,'Nonempty publisher'),
  (jsonb_build_object('published_by',E'\t\n'),'Whitespace-only publisher rejected'),
  ('{"published_at":"infinity"}'::jsonb,'Finite publication date'),
  ('{"expires_at":"2026-10-11T12:00:00Z"}'::jsonb,'Expiry strictly after publication'),
  ('{"expires_at":"infinity"}'::jsonb,'Finite expiry'),
  ('{"withdrawn_at":"2026-10-11T11:59:59Z"}'::jsonb,'Withdrawal cannot precede publication'),
  ('{"withdrawn_at":"infinity"}'::jsonb,'Finite withdrawal')
) invalid(bad,label);
select throws_ok(format('select pg_temp.announcement(%L::jsonb)',jsonb_build_object(field,null)),
  '23502',null,field||' required') from unnest(array['id','publication_key','category','title','body','requires_action',
    'include_new_users','published_at','content_hash','published_by','publication_context']) field;
select throws_ok($q$select pg_temp.announcement('{"requires_action":"bad"}')$q$,'22P02',null,'Invalid boolean type');
select lives_ok($q$select pg_temp.announcement('{"category":"changelog","app_version":"0.8.14-rc.1+local"}')$q$,'Valid SemVer changelog');
select throws_ok($q$select pg_temp.announcement('{}')$q$,'23505',null,'Publication PK unique');
select throws_ok($q$select pg_temp.announcement('{"id":"b3500000-0000-0000-0000-000000000002"}')$q$,'23505',null,'Publication key unique');
insert into private.notification_announcements(id,publication_key,category,title,body,requires_action,published_at,content_hash,published_by,publication_context)
  values('b3500000-0000-0000-0000-000000000002','fixture:default','announcement','Titre','Corps',false,now(),repeat('b',64),'fixture','{}');
select is((select include_new_users from private.notification_announcements where publication_key='fixture:default'),false,'New users excluded by default');
select ok(exists(select 1 from pg_indexes where schemaname='private' and indexname='notification_announcements_publication_idx'
  and indexdef like '%(published_at DESC, id)%'),'Publication pagination index');
select ok(exists(select 1 from pg_indexes where schemaname='private' and indexname='notification_announcement_states_announcement_idx'),
  'Announcement FK cascade index');

-- Any published field, including audience/provenance, is immutable.
select throws_ok(format('update private.notification_announcements set %I=%L where publication_key=%L',field,value,'fixture:8g1'),
  '23514','notification_publication_immutable','Immutable '||field) from (values
  ('id','b3500000-0000-0000-0000-000000000099'),('publication_key','fixture:replacement'),('category','announcement'),
  ('title','Correction'),('body','Correction'),('app_version','0.8.15'),('action','{}'),('requires_action','true'),
  ('include_new_users','true'),('published_at','2026-10-12T00:00:00Z'),('expires_at','2026-10-13T00:00:00Z'),
  ('content_hash',repeat('c',64)),('published_by','other'),('publication_context','{"reason":"other"}')
) edits(field,value);
select lives_ok($q$update private.notification_announcements set title=title where publication_key='fixture:8g1'$q$,'Identical content is harmless');
select throws_ok($q$update private.notification_announcements set withdrawn_at='2026-10-10T00:00:00Z' where publication_key='fixture:8g1'$q$,'23514',null,'Withdrawal date checked');
select lives_ok($q$update private.notification_announcements set withdrawn_at='2026-10-11T13:00:00Z' where publication_key='fixture:8g1'$q$,'First withdrawal allowed');
select lives_ok($q$update private.notification_announcements set withdrawn_at='2026-10-11T13:00:00Z' where publication_key='fixture:8g1'$q$,'Repeated withdrawal unchanged');
select throws_ok($q$update private.notification_announcements set withdrawn_at=null where publication_key='fixture:8g1'$q$,'23514','notification_publication_immutable','Cannot restore withdrawn content');
select throws_ok($q$update private.notification_announcements set withdrawn_at='2026-10-11T14:00:00Z' where publication_key='fixture:8g1'$q$,'23514','notification_publication_immutable','Withdrawal timestamp immutable');

select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001',null,now())$q$,'23514',null,'Processed implies read');
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001','2026-10-11T14:00:00Z','2026-10-11T13:00:00Z')$q$,'23514',null,'Processing follows read');
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001','infinity',null)$q$,'23514',null,'Finite announcement read');
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001',now(),'infinity')$q$,'23514',null,'Finite processing date');
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000099','b3500000-0000-0000-0000-000000000001',null,null)$q$,'23503',null,'Profile FK');
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000099',null,null)$q$,'23503',null,'Announcement FK');
insert into private.notification_announcement_states values
  ('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001',null,null),
  ('a3500000-0000-0000-0000-000000000002','b3500000-0000-0000-0000-000000000001',now(),now());
select throws_ok($q$insert into private.notification_announcement_states values('a3500000-0000-0000-0000-000000000001','b3500000-0000-0000-0000-000000000001',now(),null)$q$,'23505',null,'Unique user/publication state');
select is((select count(*)::int from private.notification_announcements where publication_key='fixture:8g1'),1,'Two recipients share one publication');

select ok(c.relrowsecurity,'RLS enabled on '||c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in('collection_notification_reads','notification_announcements','notification_announcement_states');
select is((select count(*)::int from pg_policies where schemaname='private' and tablename in
  ('collection_notification_reads','notification_announcements','notification_announcement_states')),0,'No user policy');
select ok(not has_table_privilege(role,'private.'||tab,privilege),role||' lacks '||privilege||' on '||tab)
  from unnest(array['anon','authenticated','service_role']) role,
    unnest(array['collection_notification_reads','notification_announcements','notification_announcement_states']) tab,
    unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege;
select ok(not has_function_privilege(role,'private.guard_notification_announcement_publication()','EXECUTE'),role||' cannot execute publication guard')
  from unnest(array['anon','authenticated','service_role']) role;
set local role authenticated;
select throws_ok($q$select * from private.notification_announcements$q$,'42501',null,'Browser cannot read private publications');
select throws_ok($q$insert into private.collection_notification_reads values('c3500000-0000-0000-0000-000000000001',1,now())$q$,'42501',null,'Browser cannot acknowledge directly');
select throws_ok($q$delete from private.notification_announcement_states$q$,'42501',null,'Browser cannot delete states');
reset role;
select ok(not exists(select 1 from pg_roles where rolname='my_notification_publisher'),'No operator role in 8G.1');
select ok(to_regprocedure('private.publish_notification_announcement(jsonb)') is null,'No publication function in 8G.1');

delete from public.collections where id='c3500000-0000-0000-0000-000000000001';
select is((select count(*)::int from private.collection_notification_reads where collection_id='c3500000-0000-0000-0000-000000000001'),0,'Fixture collection cascades read state');
delete from public.profiles where id='a3500000-0000-0000-0000-000000000002';
select is((select count(*)::int from private.notification_announcement_states where user_id='a3500000-0000-0000-0000-000000000002'),0,'Fixture profile cascades state');
delete from private.notification_announcements where id='b3500000-0000-0000-0000-000000000001';
select is((select count(*)::int from private.notification_announcement_states where announcement_id='b3500000-0000-0000-0000-000000000001'),0,'Fixture announcement cascades state');
select * from finish();
rollback;
