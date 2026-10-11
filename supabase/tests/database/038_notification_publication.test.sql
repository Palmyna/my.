begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.publication() returns jsonb language sql immutable as $$
  select '{"publication_key":"8g3.pgtap.synthetic","category":"announcement","title":"Synthetic title","body":"Plain text", "app_version":null,"action":{"kind":"notification_content"},"requires_action":false,"include_new_users":false,"expires_at":null,"publication_context":{"reason":"Synthetic rollback test","include_new_users_justification":null}}'::jsonb;
$$;
select ok(exists(select 1 from pg_roles where rolname='my_notification_publisher' and rolcanlogin
  and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit),'Dedicated login with no elevated attributes');
select is((select count(*)::int from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='my_notification_publisher'),0,'No memberships');
select ok(has_database_privilege('my_notification_publisher',current_database(),'CONNECT'),'Publisher can connect');
select ok(has_schema_privilege('my_notification_publisher','private','USAGE'),'Private schema usage');
select ok(not has_schema_privilege('my_notification_publisher','private','CREATE'),'No schema creation');
select ok(not has_schema_privilege('my_notification_publisher','auth','USAGE'),'No Auth schema access');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth') and c.relkind in ('r','v')
    and has_table_privilege('my_notification_publisher',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),'No business or Auth table privileges');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and has_function_privilege('my_notification_publisher',p.oid,'EXECUTE')),2,'Exactly two executable business functions');
select ok(not has_function_privilege('my_notification_publisher','private.prepare_notification_publication(jsonb)','EXECUTE'),'No preparer access');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('publish_notification_announcement','withdraw_notification_announcement')
  and (not p.prosecdef or p.proconfig is distinct from array['search_path=""'])),'Definers have empty search_path');
select ok(not has_function_privilege(role,signature,'EXECUTE'),role||' cannot publish/withdraw')
from unnest(array['anon','authenticated','service_role','authenticator']) role
cross join unnest(array['private.publish_notification_announcement(jsonb)','private.withdraw_notification_announcement(text)']) signature;

select is(private.prepare_notification_publication(pg_temp.publication())->'publication',pg_temp.publication(),'Strict ordinary publication normalizes without distortion');
select is(length(private.prepare_notification_publication(pg_temp.publication())->>'content_hash'),64,'SHA-256 hex');
select is(private.prepare_notification_publication(jsonb_set(pg_temp.publication(),'{title}',to_jsonb(U&' \00A0Cafe\0301 \3000'::text)))->'publication'->>'title',U&'Caf\00E9','NFC and Unicode trim');
select is(private.prepare_notification_publication(jsonb_set(pg_temp.publication(),'{body}',to_jsonb(E' \r\nOne\rTwo\r\nThree\t '::text)))->'publication'->>'body',E'One\nTwo\nThree','Body LF and trim, retained plain text');
select is(private.prepare_notification_publication(jsonb_set(pg_temp.publication(),'{expires_at}','"2030-01-01T01:02:03.123456+01:00"'))->'publication'->>'expires_at','2030-01-01T00:02:03.123456Z','UTC with exact microseconds');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',(pg_temp.publication()||delta)::text),'22023','notification_publication_invalid','Reject invalid business content: '||label)
from (values
  ('key','{"publication_key":"BAD"}'::jsonb),('category','{"category":"unknown"}'),('backdate','{"published_at":"2020-01-01"}'),
  ('title empty','{"title":"   "}'),('HTML','{"body":"<script>alert(1)</script>"}'),('URL','{"body":"https://evil.invalid"}'),
  ('protocol relative URL','{"body":"//evil.invalid"}'),('javascript','{"body":"javascript:alert(1)"}'),('data','{"body":"data:text/html,evil"}'),
  ('unknown action','{"action":{"kind":"unknown"}}'),('action fields','{"action":{"kind":"notification_content","url":"/evil"}}'),
  ('changelog version required','{"category":"changelog"}'),('SemVer','{"app_version":"01.0.0"}'),('numeric prerelease','{"app_version":"1.0.0-01"}'),
  ('new user justification required','{"include_new_users":true}'),('context extra','{"publication_context":{"reason":"Test","include_new_users_justification":null,"secret":"x"}}'),
  ('context required','{"publication_context":null}'),('reason required','{"publication_context":{"reason":" ","include_new_users_justification":null}}'),
  ('unneeded justification','{"publication_context":{"reason":"Test","include_new_users_justification":"No"}}'),
  ('infinite date','{"expires_at":"infinity"}'),('invalid calendar','{"expires_at":"2027-02-29T00:00:00Z"}'),('date precision','{"expires_at":"2030-01-01T00:00:00.1234567Z"}'),
  ('UTC year overflow','{"expires_at":"9999-12-31T23:59:59-01:00"}'),('UTC year underflow','{"expires_at":"0001-01-01T00:00:00+01:00"}')
) cases(label,delta);
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',(pg_temp.publication()-'body')::text),'22023','notification_publication_invalid','Missing field');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',jsonb_set(pg_temp.publication(),'{title}',to_jsonb(repeat('x',201)))::text),'22023','notification_publication_invalid','Title length');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',jsonb_set(pg_temp.publication(),'{body}',to_jsonb(repeat('x',20001)))::text),'22023','notification_publication_invalid','Body length');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',jsonb_set(pg_temp.publication(),'{requires_action}','true')::text),'22023','notification_action_unsupported','No unsupported resolution');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',jsonb_set(pg_temp.publication(),'{expires_at}','"2000-01-01T00:00:00Z"')::text),'22023','notification_expiration_invalid','New expired publication rejected');
create temp table first_result as select private.publish_notification_announcement(pg_temp.publication()) data;
select is(private.publish_notification_announcement(pg_temp.publication()),(select data from first_result),'Same-key retry returns historical UUID/date/result');
select is(private.publish_notification_announcement(jsonb_set(pg_temp.publication(),'{title}','"  Synthetic title  "')),(select data from first_result),'Normalization-equivalent retry');
select throws_ok(format('select private.publish_notification_announcement(%L::jsonb)',jsonb_set(pg_temp.publication(),'{body}','"Changed"')::text),'23505','publication_key_conflict','Different content cannot overwrite key');
select is((select published_by from private.notification_announcements where publication_key='8g3.pgtap.synthetic'),session_user::text,'Provenance is PostgreSQL session identity');
select is((select publication_context from private.notification_announcements where publication_key='8g3.pgtap.synthetic'),pg_temp.publication()->'publication_context','Only validated context persisted');
select ok((select published_at between statement_timestamp()-interval '1 minute' and clock_timestamp() from private.notification_announcements where publication_key='8g3.pgtap.synthetic'),'Publication uses fresh server time');
select is((select count(*)::int from private.notification_announcements where publication_key='8g3.pgtap.synthetic'),1,'No retry duplicate');
select throws_ok($$update private.notification_announcements set body='Changed' where publication_key='8g3.pgtap.synthetic'$$,'23514','notification_publication_immutable','Published body immutable');
select lives_ok(format('select private.publish_notification_announcement(%L::jsonb)',(pg_temp.publication()||'{"publication_key":"8g3.pgtap.changelog","category":"changelog","app_version":"0.8.16","action":null}'::jsonb)::text),'Valid changelog/null action');
select lives_ok(format('select private.publish_notification_announcement(%L::jsonb)',(pg_temp.publication()||'{"publication_key":"8g3.pgtap.newusers","include_new_users":true,"publication_context":{"reason":"Synthetic test","include_new_users_justification":"Still current"}}'::jsonb)::text),'Valid justified new-user audience');
create temp table historical as select to_jsonb(a)-'withdrawn_at' data from private.notification_announcements a where publication_key='8g3.pgtap.synthetic';
create temp table withdrawal as select private.withdraw_notification_announcement('8g3.pgtap.synthetic') data;
select is(private.withdraw_notification_announcement('8g3.pgtap.synthetic'),(select data from withdrawal),'Withdrawal idempotent date/UUID/result');
select is((select to_jsonb(a)-'withdrawn_at' from private.notification_announcements a where publication_key='8g3.pgtap.synthetic'),(select data from historical),'Withdrawal preserves every historical field');
select is(private.publish_notification_announcement(pg_temp.publication()),(select data from first_result),'Retry after withdrawal stays historical');
select ok((select withdrawn_at is not null from private.notification_announcements where publication_key='8g3.pgtap.synthetic'),'Retry never reactivates withdrawn publication');
select throws_ok($$update private.notification_announcements set withdrawn_at=null where publication_key='8g3.pgtap.synthetic'$$,'23514','notification_publication_immutable','Withdrawal cannot be erased');
select throws_ok($$select private.withdraw_notification_announcement('8g3.pgtap.missing')$$,'P0002','notification_publication_not_found','Unknown key cannot be silently withdrawn');
select * from finish();
rollback;
