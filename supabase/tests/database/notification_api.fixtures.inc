-- All identities synthetic/reserved; pgTAP rollback or explicit script cleanup.
\ir relative_order_writer.fixtures.inc
\ir manual_collection_items_v2.fixtures.inc
\ir collection_hidden.fixtures.inc
\ir collection_update.fixtures.inc
-- The older masking fixture has a deliberately stale secondary parent.
-- This API fixture keeps exactly one automatic notification candidate.
delete from public.collections where id='c2500000-0000-0000-0000-000000000007';
update auth.users set created_at='2026-01-01T00:00:00Z' where id in
  ('a2500000-0000-0000-0000-000000000001','a2500000-0000-0000-0000-000000000003');
update auth.users set created_at=now()+interval '1 day' where id='a2500000-0000-0000-0000-000000000002';
update public.profiles set created_at=now() where id='a2500000-0000-0000-0000-000000000001';

insert into private.notification_announcements(id,publication_key,category,title,body,app_version,
  requires_action,include_new_users,published_at,expires_at,withdrawn_at,content_hash,published_by,publication_context,action)
select ('f3600000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'8g2.fixture.'||n,
  case when n=2 then 'changelog' else 'announcement' end,'Synthetic notification '||n,
  'Plain text <script>alert(1)</script> javascript:example',case when n=2 then '0.8.15' else null end,
  n=3,n=4,case when n=7 then now()+interval '1 day' else now()-interval '1 day' end,
  case when n=5 then now()-interval '1 second' else null end,
  case when n=6 then now()-interval '1 hour' else null end,
  repeat('a',64),'synthetic-test','{}'::jsonb,'{"url":"javascript:forbidden","command":"forbidden"}'::jsonb
from generate_series(1,7) n;
