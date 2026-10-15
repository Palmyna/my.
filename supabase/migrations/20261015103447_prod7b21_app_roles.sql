begin;

-- Ordinary users have no row. Never derive authorization from Auth metadata.
create table private.app_role_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'super_admin'),
  granted_at timestamptz not null default clock_timestamp(),
  granted_by name not null default session_user
);
alter table private.app_role_assignments owner to postgres;
alter table private.app_role_assignments enable row level security;
revoke all on table private.app_role_assignments from public, anon, authenticated,
  service_role, authenticator, supabase_auth_admin, my_notification_publisher;
grant select, insert, delete on table private.app_role_assignments to postgres, supabase_admin;

-- Join the existing barrier; application roles grant no PROD.2 exception.
create trigger business_write_freeze before insert or update or delete or truncate
  on private.app_role_assignments for each statement
  execute function private.guard_business_write_freeze();

-- Private SQL operator entry point, never a Data API RPC. INVOKER preserves
-- ACLs; session_user also rejects calls through an owner-rights wrapper.
create function private.set_app_role(p_user_id uuid, p_role text)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'app_role_operator_required';
  end if;
  if p_user_id is null or p_role is null or p_role not in ('user', 'super_admin') then
    raise exception using errcode = '22023', message = 'app_role_input_invalid';
  end if;
  if p_role = 'user' then
    delete from private.app_role_assignments where user_id = p_user_id;
  else
    -- Lock the actual Auth identity, coordinating grant with account deletion.
    -- MFA is checked at use time, never replaced by an application role.
    perform 1 from auth.users u join public.profiles p on p.id = u.id
      where u.id = p_user_id and u.email_confirmed_at is not null
        and not coalesce(u.is_anonymous, false) for update of u;
    if not found then
      raise exception using errcode = '22023', message = 'app_role_verified_account_required';
    end if;
    insert into private.app_role_assignments(user_id, role) values (p_user_id, 'super_admin')
      on conflict (user_id) do nothing;
  end if;
end;
$$;
alter function private.set_app_role(uuid, text) owner to postgres;

-- Internal, caller-only predicate. No UUID parameter and no JWT role claim.
-- False covers ordinary, missing, deleted and insufficient-assurance callers.
create function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2', false)
    and exists (
      select 1 from private.app_role_assignments r
        join public.profiles p on p.id = r.user_id
        where r.user_id = (select auth.uid()) and r.role = 'super_admin'
    );
$$;
alter function private.is_super_admin() owner to postgres;
revoke all on function private.set_app_role(uuid, text), private.is_super_admin()
  from public, anon, authenticated, service_role, authenticator,
    supabase_auth_admin, my_notification_publisher;
grant execute on function private.set_app_role(uuid, text), private.is_super_admin()
  to postgres, supabase_admin;

comment on table private.app_role_assignments is
  'PROD.7B.2.1 private Auth UUID application roles. No row = user. No SQL role, RLS bypass, Premium or freeze exception. Auth hard delete cascades.';
comment on function private.set_app_role(uuid, text) is
  'Direct PostgreSQL postgres/supabase_admin sessions only. Verified Auth account plus MY. profile required for super_admin; user revokes. Commit then independently reread. No public RPC.';
comment on function private.is_super_admin() is
  'Internal caller-only database lookup with AAL2 and live MY. profile. No API EXECUTE. Trust auth.uid/aal only after platform authentication; never consume application role claims or user metadata.';

commit;
