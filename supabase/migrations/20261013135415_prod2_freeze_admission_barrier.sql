begin;

-- Row SHARE locks alone permit another compatible locker to join while an
-- UPDATE waits. The advisory admission barrier queues new writers behind a
-- closing operator. Both locks are transaction-scoped, never session-scoped.
-- Fixed key 771403 is distinct from catalogue 771402 and fixture locks.
create or replace function private.require_business_writes_open()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare closed boolean;
begin
  if session_user in ('postgres', 'supabase_admin') then return; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(771403);
  -- The locking read is essential: a plain SELECT under an old RR snapshot
  -- could read false after a successful closure. FOR SHARE then fails 40001.
  select frozen into closed from private.business_write_freeze where singleton for share;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  if closed then
    raise exception using errcode = 'PT503', message = 'business_writes_frozen';
  end if;
end;
$$;

create or replace function private.set_business_write_freeze(p_frozen boolean)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare state private.business_write_freeze;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'business_write_freeze_operator_required';
  end if;
  if p_frozen is null then
    raise exception using errcode = '22023', message = 'business_write_freeze_input_invalid';
  end if;
  -- Entry ordering: freeze BEFORE catalogue BEFORE parent. Ordinary RPCs
  -- already take the shared guard before business locks and all replay paths.
  perform pg_catalog.pg_advisory_xact_lock(771403);
  update private.business_write_freeze set frozen = p_frozen, revision = revision + 1,
    changed_at = clock_timestamp(), changed_by = session_user
    where singleton returning * into state;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  return to_jsonb(state) - 'singleton';
end;
$$;

revoke all on function private.require_business_writes_open(), private.set_business_write_freeze(boolean)
  from public, anon, authenticated, service_role, supabase_auth_admin, my_notification_publisher;
grant execute on function private.set_business_write_freeze(boolean) to postgres, supabase_admin;
comment on function private.require_business_writes_open() is
  'PROD.2 session_user boundary. Shared transaction admission lock 771403 then FOR SHARE singleton through COMMIT. Missing state fails closed; old snapshots fail 40001. PT503 maps to HTTP 503. No user EXECUTE.';
comment on function private.set_business_write_freeze(boolean) is
  'PROD.2 direct PostgreSQL operator only. Exclusive transaction admission lock 771403 drains admitted ordinary writers; UPDATE records persistent state. Effective only after COMMIT; fresh connection verification required. Never changes application ACLs.';

commit;
