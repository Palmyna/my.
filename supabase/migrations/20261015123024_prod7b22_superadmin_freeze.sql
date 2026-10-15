begin;

-- Keep every caller in the existing admission order, including super_admin.
-- The application exception changes only the closed-state decision. It never
-- grants SQL privileges or turns Auth/service sessions into application users.
create or replace function private.require_business_writes_open()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare closed boolean;
begin
  if session_user in ('postgres', 'supabase_admin') then return; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(771403);
  -- Preserve stale-snapshot rejection and hold both locks through COMMIT.
  select frozen into closed from private.business_write_freeze where singleton for share;
  if not found then
    raise exception using errcode = 'PT503', message = 'business_write_freeze_unavailable';
  end if;
  if closed and not (
    session_user = 'authenticator'
    and coalesce(auth.jwt()->>'role' = 'authenticated', false)
    and private.is_super_admin()
  ) then
    raise exception using errcode = 'PT503', message = 'business_writes_frozen';
  end if;
end;
$$;

-- CREATE OR REPLACE preserves owner and ACLs. No new API entry point/grant.
comment on function private.require_business_writes_open() is
  'PROD.7B.2.2: direct SQL operator exception preserved. Shared transaction admission 771403 then FOR SHARE singleton before any application exception. Missing state fails closed; stale snapshots fail 40001. Closed writes require authenticator, platform-verified authenticated JWT and private.is_super_admin() (live role/profile, AAL2). No extra data/SQL permissions; Auth/service_role remain frozen. PT503 maps to HTTP 503.';
comment on table private.app_role_assignments is
  'Private Auth UUID application roles. No row = user. No SQL role, RLS bypass or Premium. PROD.7B.2.2 admits eligible AAL2 super_admin business writes during freeze, without changing ACLs or operator-only controls. Auth hard delete cascades.';

commit;
