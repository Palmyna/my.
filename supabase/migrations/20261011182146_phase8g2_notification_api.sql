begin;

-- Closed backend helpers. The public DEFINER boundary is needed for private
-- storage and the caller's Auth registration date; no recipient parameter.
create function private.notification_caller() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.profiles where id = caller_id)
    or not exists (select 1 from auth.users where id = caller_id) then
    raise exception using errcode = '42501', message = 'notification_unavailable';
  end if;
  return caller_id;
end;
$$;

-- Shared activity/audience predicate, including processed state so a process
-- retry can preserve its original dates. No body or unvalidated action loaded.
-- Readers pass their statement clock; writers pass a fresh clock after waits.
create function private.read_notification_announcements(p_caller_id uuid, p_at timestamptz)
returns table (announcement_id uuid, category text, title text, app_version text,
  requires_action boolean, content_hash text, published_at timestamptz,
  read_at timestamptz, processed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.category, a.title, a.app_version, a.requires_action,
    a.content_hash, a.published_at, s.read_at, s.processed_at
  from private.notification_announcements a
  join auth.users u on u.id = p_caller_id
  left join private.notification_announcement_states s
    on s.user_id = p_caller_id and s.announcement_id = a.id
  where a.published_at <= p_at and a.withdrawn_at is null
    and (a.expires_at is null or a.expires_at > p_at)
    and (u.created_at <= a.published_at or a.include_new_users);
$$;

-- One common active projection for centre/count. Collections reuse 8G.1
-- verbatim. Announcement identity is announcement:<UUID>, including changelogs.
create function private.read_active_notifications(p_caller_id uuid, p_at timestamptz)
returns table (notification_key text, kind text, revision text, is_read boolean,
  title text, updated_at timestamptz, collection_id uuid, applied_target_version text,
  target_version text, announcement_id uuid, app_version text, requires_action boolean)
language sql stable security invoker set search_path = '' as $$
  select c.notification_key, 'collection_update', c.target_version::text, c.is_read,
    c.collection_name, c.updated_at, c.collection_id, c.applied_target_version::text,
    c.target_version::text, null::uuid, null::text, null::boolean
  from private.read_collection_update_notifications(p_caller_id) c
  union all
  select 'announcement:' || a.announcement_id::text, a.category, a.content_hash,
    a.read_at is not null, a.title, a.published_at, null::uuid, null::text, null::text,
    a.announcement_id, a.app_version, a.requires_action
  from private.read_notification_announcements(p_caller_id, p_at) a
  where a.processed_at is null;
$$;

create function public.get_notification_center(p_limit integer default 20, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id uuid := private.notification_caller();
  page_limit integer := coalesce(p_limit, 20);
  cursor_date timestamptz;
  cursor_key text;
  result jsonb;
begin
  if page_limit < 1 or page_limit > 50 then
    raise exception using errcode = '22023', message = 'notification_input_invalid';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    if (select count(*) from jsonb_object_keys(p_cursor)) <> 2
      or not (p_cursor ?& array['updated_at','notification_key'])
      or jsonb_typeof(p_cursor->'updated_at') <> 'string'
      or jsonb_typeof(p_cursor->'notification_key') <> 'string'
      or (p_cursor->>'updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
      or (p_cursor->>'notification_key') !~ '^(collection|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    begin
      cursor_date := (p_cursor->>'updated_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end;
    cursor_key := p_cursor->>'notification_key';
  end if;

  -- Materialize once: the total and page observe exactly the same predicate
  -- and snapshot. Keyset pagination reads one extra row, never OFFSET.
  with active as materialized (
    select * from private.read_active_notifications(caller_id, statement_timestamp())
  ), page as materialized (
    select a.* from active a
    where cursor_date is null or a.updated_at < cursor_date
      or (a.updated_at = cursor_date and a.notification_key collate "C" > cursor_key collate "C")
    order by a.updated_at desc, a.notification_key collate "C" limit page_limit + 1
  ), visible as materialized (
    select * from page order by updated_at desc, notification_key collate "C" limit page_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(
      jsonb_build_object('notification_key', v.notification_key, 'kind', v.kind,
        'revision', v.revision, 'state', case when v.is_read then 'read' else 'unread' end,
        'title', v.title, 'updated_at', v.updated_at)
      || case when v.kind = 'collection_update' then
        jsonb_build_object('collection_id', v.collection_id, 'applied_target_version', v.applied_target_version,
          'target_version', v.target_version, 'action', jsonb_build_object('kind','collection_preview','collection_id',v.collection_id))
      else jsonb_build_object('announcement_id', v.announcement_id, 'app_version', v.app_version,
        'requires_action', v.requires_action, 'action', jsonb_build_object('kind','notification_content','announcement_id',v.announcement_id)) end
      order by v.updated_at desc, v.notification_key collate "C") from visible v), '[]'::jsonb),
    'unread_count', (select count(*)::text from active where not is_read),
    'next_cursor', case when (select count(*) from page) > page_limit then
      (select jsonb_build_object('updated_at', v.updated_at, 'notification_key', v.notification_key)
        from visible v order by v.updated_at asc, v.notification_key collate "C" desc limit 1)
      else null end) into result;
  return result;
end;
$$;

create function public.get_notification_unread_count() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := private.notification_caller(); result jsonb;
begin
  select jsonb_build_object('unread_count', count(*)::text) into result
    from private.read_active_notifications(caller_id, statement_timestamp()) where not is_read;
  return result;
end;
$$;

-- Unavailable content is JSON null for every unknown/inactive/ineligible/
-- processed identity. The body is plain text, never stored action/provenance.
create function public.get_notification_content(p_announcement_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := private.notification_caller(); result jsonb;
begin
  select jsonb_build_object('notification_key','announcement:' || a.announcement_id::text,
    'kind',a.category,'revision',a.content_hash,'state',case when a.read_at is null then 'unread' else 'read' end,
    'title',a.title,'updated_at',a.published_at,'announcement_id',a.announcement_id,
    'app_version',a.app_version,'requires_action',a.requires_action,'body',content.body,
    'action',jsonb_build_object('kind','notification_content','announcement_id',a.announcement_id)) into result
  from private.read_notification_announcements(caller_id,statement_timestamp()) a
  join private.notification_announcements content on content.id = a.announcement_id
  where a.announcement_id = p_announcement_id and a.processed_at is null;
  return result;
end;
$$;

create function public.mark_notification_read(p_notification_key text, p_observed_revision text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  caller_id uuid := private.notification_caller();
  subject_id uuid;
  observed_version bigint;
  current_version bigint;
  announcement record;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'notification_isolation_invalid';
  end if;
  if p_notification_key is null or p_observed_revision is null
    or p_notification_key !~ '^(collection|announcement):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'notification_input_invalid';
  end if;
  subject_id := split_part(p_notification_key,':',2)::uuid;
  if p_notification_key like 'collection:%' then
    if p_observed_revision !~ '^[1-9][0-9]{0,18}$'
      or (length(p_observed_revision) = 19 and p_observed_revision collate "C" > '9223372036854775807' collate "C") then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    observed_version := p_observed_revision::bigint;
    -- Catalogue BEFORE parent; sync/apply/delete cannot invalidate our write.
    perform pg_catalog.pg_advisory_xact_lock_shared(771402);
    perform 1 from public.collections where id = subject_id and owner_id = caller_id for update;
    if not found then return jsonb_build_object('outcome','obsolete'); end if;
    perform private.notification_caller();
    select c.target_version into current_version from private.read_collection_update_notifications(caller_id) c
      where c.collection_id = subject_id;
    if current_version is null or observed_version > current_version then
      return jsonb_build_object('outcome','obsolete');
    end if;
    insert into private.collection_notification_reads as r (collection_id,read_target_version,read_at)
      values (subject_id,observed_version,clock_timestamp())
      on conflict (collection_id) do update set read_target_version = excluded.read_target_version,
        read_at = excluded.read_at where r.read_target_version < excluded.read_target_version;
  else
    if p_observed_revision !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'notification_input_invalid';
    end if;
    -- Serialize this caller/event even before the first sparse state exists.
    -- Hash collisions only serialize unrelated pairs. Then SHARE publication
    -- allows other users, conflicts with withdrawal/delete. Recheck after waits,
    -- including expiration; no processed date cleared.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'my.notification.state:' || caller_id::text || ':' || subject_id::text,0));
    perform 1 from private.notification_announcements where id = subject_id for share;
    if not found then return jsonb_build_object('outcome','obsolete'); end if;
    perform private.notification_caller();
    select * into announcement from private.read_notification_announcements(caller_id,clock_timestamp()) a
      where a.announcement_id = subject_id and a.processed_at is null;
    if not found or announcement.content_hash is distinct from p_observed_revision then
      return jsonb_build_object('outcome','obsolete');
    end if;
    insert into private.notification_announcement_states as s (user_id,announcement_id,read_at)
      values (caller_id,subject_id,clock_timestamp())
      on conflict (user_id,announcement_id) do update set read_at = excluded.read_at
        where s.read_at is null and s.processed_at is null;
  end if;
  return jsonb_build_object('outcome','recorded');
end;
$$;

create function public.process_announcement_notification(p_announcement_id uuid,p_observed_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare caller_id uuid := private.notification_caller(); announcement record; recorded_at timestamptz;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25000', message = 'notification_isolation_invalid';
  end if;
  if p_announcement_id is null or p_observed_hash is null or p_observed_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'notification_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'my.notification.state:' || caller_id::text || ':' || p_announcement_id::text,0));
  perform 1 from private.notification_announcements where id = p_announcement_id for share;
  if not found then return jsonb_build_object('outcome','obsolete'); end if;
  perform private.notification_caller();
  select * into announcement from private.read_notification_announcements(caller_id,clock_timestamp()) a
    where a.announcement_id = p_announcement_id;
  if not found or announcement.content_hash is distinct from p_observed_hash then
    return jsonb_build_object('outcome','obsolete');
  end if;
  -- No supported server resolution exists in 8G.2. A click/hash is never proof.
  if announcement.requires_action then
    raise exception using errcode = '42501', message = 'notification_action_unresolved';
  end if;
  recorded_at := clock_timestamp();
  insert into private.notification_announcement_states as s (user_id,announcement_id,read_at,processed_at)
    values (caller_id,p_announcement_id,recorded_at,recorded_at)
    on conflict (user_id,announcement_id) do update set
      read_at = coalesce(s.read_at,excluded.read_at),
      processed_at = coalesce(s.processed_at,greatest(s.read_at,excluded.processed_at))
      where s.processed_at is null;
  return jsonb_build_object('outcome','recorded');
end;
$$;

revoke all on function private.notification_caller(),
  private.read_notification_announcements(uuid,timestamptz),private.read_active_notifications(uuid,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.get_notification_center(integer,jsonb),public.get_notification_unread_count(),
  public.get_notification_content(uuid),public.mark_notification_read(text,text),
  public.process_announcement_notification(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_notification_center(integer,jsonb),public.get_notification_unread_count(),
  public.get_notification_content(uuid),public.mark_notification_read(text,text),
  public.process_announcement_notification(uuid,text) to authenticated;

comment on function public.get_notification_center(integer,jsonb) is
  '8G.2 pure active centre, one snapshot and global exact decimal unread_count. Default 20/max 50; strict {updated_at,notification_key} keyset cursor. Internal actions constructed by server, never publication JSON.';
comment on function public.get_notification_content(uuid) is
  '8G.2 pure eligible unprocessed announcement/changelog content as plain text; revision is immutable content_hash. Safe NULL for unavailable identity, no automatic read/process.';
comment on function public.mark_notification_read(text,text) is
  '8G.2 explicit monotone read only. Collection observed version never advances to unseen current target; timestamps change only on progression. Active eligibility rechecked after locks.';
comment on function public.process_announcement_notification(uuid,text) is
  '8G.2 atomic idempotent ordinary announcement read/process; unresolved action-required announcements refused. Cannot process collection updates; only 8F applied version resolves those.';

commit;
