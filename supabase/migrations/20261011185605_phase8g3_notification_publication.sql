begin;

-- Login is unusable until an operator provisions a password outside Git.
-- No memberships, inherited administrative permissions or direct business ACL.
create role my_notification_publisher login noinherit nosuperuser nocreatedb
  nocreaterole noreplication nobypassrls connection limit 4;
do $$ begin
  execute format('grant connect on database %I to my_notification_publisher', current_database());
end $$;
grant usage on schema private to my_notification_publisher;

-- Closed preparer: JSON shape, normalized business content and deterministic
-- SHA-256. No timestamp/UUID/operator participates in the fingerprint.
create function private.prepare_notification_publication(p_publication jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  p jsonb := p_publication;
  context jsonb;
  field text;
  value text;
  expiry timestamptz;
  expiry_text text;
  canonical text;
  trim_chars text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  if (select count(*) from jsonb_object_keys(p)) <> 10
    or not (p ?& array['publication_key','category','title','body','app_version','action',
      'requires_action','include_new_users','expires_at','publication_context']) then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  foreach field in array array['publication_key','category','title','body'] loop
    if jsonb_typeof(p->field) <> 'string' then
      raise exception using errcode='22023', message='notification_publication_invalid';
    end if;
  end loop;
  if jsonb_typeof(p->'requires_action') <> 'boolean' or jsonb_typeof(p->'include_new_users') <> 'boolean'
    or jsonb_typeof(p->'app_version') not in ('string','null')
    or jsonb_typeof(p->'expires_at') not in ('string','null')
    or jsonb_typeof(p->'publication_context') <> 'object' then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  context := p->'publication_context';
  if (select count(*) from jsonb_object_keys(context)) <> 2
    or not (context ?& array['reason','include_new_users_justification'])
    or jsonb_typeof(context->'reason') <> 'string'
    or jsonb_typeof(context->'include_new_users_justification') not in ('string','null') then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  -- Use the same ECMAScript trim set, LF and NFC in SQL and terminal.
  foreach field in array array['title','body','reason','include_new_users_justification'] loop
    value := case when field in ('title','body') then p->>field else context->>field end;
    if value is not null then
      value := btrim(normalize(replace(replace(value,E'\r\n',E'\n'),E'\r',E'\n'),NFC),trim_chars);
      if char_length(value) < 1 or char_length(value) > (case field when 'title' then 200 when 'body' then 20000 else 1000 end)
        or value ~ '[<>]'
        or value ~* '([a-z][a-z0-9+.-]*://|www\.|https?:|javascript:|data:|vbscript:|file:|mailto:|//)'
        or value ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\202A-\202E\2066-\2069]'
        or (field='title' and value ~ E'[\n\t]') then
        raise exception using errcode='22023', message='notification_publication_invalid';
      end if;
      if field in ('title','body') then p := jsonb_set(p,array[field],to_jsonb(value));
      else context := jsonb_set(context,array[field],to_jsonb(value)); end if;
    end if;
  end loop;
  if (p->>'publication_key') collate "C" !~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
    or p->>'category' not in ('announcement','changelog')
    or (p->>'category'='changelog' and p->>'app_version' is null)
    or (p->>'app_version' is not null and (char_length(p->>'app_version') > 64 or (p->>'app_version') collate "C" !~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'))
    or ((p->>'include_new_users')::boolean and context->>'include_new_users_justification' is null)
    or (not (p->>'include_new_users')::boolean and context->>'include_new_users_justification' is not null) then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  -- No existing announcement resolution condition is supported. Never create
  -- a notification that the ordinary process RPC cannot safely resolve.
  if (p->>'requires_action')::boolean then
    raise exception using errcode='22023', message='notification_action_unsupported';
  end if;
  if p->'action' <> 'null'::jsonb and p->'action' <> '{"kind":"notification_content"}'::jsonb then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  if p->>'expires_at' is not null then
    if p->>'expires_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
      or p->>'expires_at' like '0000-%' then
      raise exception using errcode='22023', message='notification_publication_invalid';
    end if;
    begin expiry := (p->>'expires_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023', message='notification_publication_invalid';
    end;
    if not isfinite(expiry) then
      raise exception using errcode='22023', message='notification_publication_invalid';
    end if;
    expiry_text := to_char(expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    p := jsonb_set(p,'{expires_at}',to_jsonb(expiry_text));
  end if;
  p := jsonb_set(p,'{publication_context}',context);
  canonical := '[' || array_to_string(array[
    to_json('my.notification.publication.v1'::text)::text,
    to_json(p->>'publication_key')::text,to_json(p->>'category')::text,
    to_json(p->>'title')::text,to_json(p->>'body')::text,
    coalesce(to_json(p->>'app_version')::text,'null'),
    coalesce(to_json(p->'action'->>'kind')::text,'null'),
    p->>'requires_action',p->>'include_new_users',coalesce(to_json(expiry_text)::text,'null'),
    to_json(context->>'reason')::text,coalesce(to_json(context->>'include_new_users_justification')::text,'null')
  ],',') || ']';
  return jsonb_build_object('publication',p,'content_hash',encode(sha256(convert_to(canonical,'UTF8')),'hex'));
end;
$$;

create function private.publish_notification_announcement(p_publication jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare prepared jsonb; p jsonb; fingerprint text; stored private.notification_announcements%rowtype; at timestamptz;
begin
  if session_user not in ('my_notification_publisher','postgres') then
    raise exception using errcode='42501', message='notification_publication_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25000', message='notification_isolation_invalid';
  end if;
  prepared := private.prepare_notification_publication(p_publication);
  p := prepared->'publication'; fingerprint := prepared->>'content_hash';
  -- Key lock serializes first insert, retry, conflict and withdrawal, including
  -- when no row exists yet. Fresh snapshot/clock AFTER waits. Different keys independent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('my.notification.publication:' || (p->>'publication_key'),0));
  select * into stored from private.notification_announcements where publication_key=p->>'publication_key';
  if found then
    if stored.content_hash <> fingerprint then
      raise exception using errcode='23505', message='publication_key_conflict';
    end if;
  else
    at := clock_timestamp();
    if p->>'expires_at' is not null and (p->>'expires_at')::timestamptz <= at then
      raise exception using errcode='22023', message='notification_expiration_invalid';
    end if;
    insert into private.notification_announcements(publication_key,category,title,body,app_version,action,
      requires_action,include_new_users,published_at,expires_at,content_hash,published_by,publication_context)
    values(p->>'publication_key',p->>'category',p->>'title',p->>'body',p->>'app_version',nullif(p->'action','null'::jsonb),
      (p->>'requires_action')::boolean,(p->>'include_new_users')::boolean,at,(p->>'expires_at')::timestamptz,
      fingerprint,session_user,p->'publication_context') returning * into stored;
  end if;
  -- Historical result stays identical even after withdrawal or expiration.
  return jsonb_build_object('outcome','published','publication_key',stored.publication_key,'announcement_id',stored.id,
    'published_at',to_char(stored.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content_hash',stored.content_hash);
end;
$$;

create function private.withdraw_notification_announcement(p_publication_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare stored private.notification_announcements%rowtype;
begin
  if session_user not in ('my_notification_publisher','postgres') then
    raise exception using errcode='42501', message='notification_publication_unavailable';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25000', message='notification_isolation_invalid';
  end if;
  if p_publication_key is null or p_publication_key collate "C" !~ '^[a-z0-9][a-z0-9._:-]{0,119}$' then
    raise exception using errcode='22023', message='notification_publication_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('my.notification.publication:' || p_publication_key,0));
  select * into stored from private.notification_announcements where publication_key=p_publication_key for update;
  if not found then
    raise exception using errcode='P0002', message='notification_publication_not_found';
  end if;
  if stored.withdrawn_at is null then
    update private.notification_announcements set withdrawn_at=greatest(published_at,clock_timestamp())
      where id=stored.id returning * into stored;
  end if;
  return jsonb_build_object('outcome','withdrawn','publication_key',stored.publication_key,'announcement_id',stored.id,
    'withdrawn_at',to_char(stored.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end;
$$;

revoke all on function private.prepare_notification_publication(jsonb),
  private.publish_notification_announcement(jsonb),private.withdraw_notification_announcement(text)
  from public,anon,authenticated,service_role,my_notification_publisher;
grant execute on function private.publish_notification_announcement(jsonb),private.withdraw_notification_announcement(text)
  to my_notification_publisher;
comment on role my_notification_publisher is 'Terminal notification publisher only. Provision credentials outside Git; no memberships or direct business DML. Never use in frontend/Data API.';
comment on function private.publish_notification_announcement(jsonb) is '8G.3 strict normalized plain-text publication. SHA-256 v1 excludes generated identity/time/operator. Same key/content returns historical result; changed content conflicts. requires_action=true unsupported.';
comment on function private.withdraw_notification_announcement(text) is '8G.3 irreversible idempotent withdrawal by publication key; preserves complete historical content/provenance and acquired states.';

commit;
