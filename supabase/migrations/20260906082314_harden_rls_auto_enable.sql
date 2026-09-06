-- Present in cloud projects using Automatic RLS, potentially absent locally.
-- Revoking direct invocation does not disable the registered event trigger.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end;
$$;
