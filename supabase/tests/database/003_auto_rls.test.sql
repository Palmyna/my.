begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Re-execute the real migration, not a copied hardening statement. This local
-- regression covers an absent function as well as an active event trigger.
select ok(to_regprocedure('public.rls_auto_enable()') is null, 'Local environment has no dashboard Automatic RLS function');
\ir harden_rls_auto_enable.generated.inc
select ok(to_regprocedure('public.rls_auto_enable()') is null, 'Hardening tolerates absence without creating the function');

-- Synthetic analogue of the dashboard event function, rolled back after tests.
create function public.rls_auto_enable()
returns event_trigger language plpgsql security definer set search_path = '' as $$
declare
  command record;
begin
  for command in select * from pg_event_trigger_ddl_commands() loop
    if command.command_tag = 'CREATE TABLE' and command.schema_name = 'public' then
      execute format('alter table %s enable row level security', command.object_identity);
    end if;
  end loop;
end;
$$;
create event trigger phase1_test_auto_rls on ddl_command_end
  when tag in ('CREATE TABLE') execute function public.rls_auto_enable();
grant execute on function public.rls_auto_enable() to public, anon, authenticated, service_role;

\ir harden_rls_auto_enable.generated.inc
select ok(not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'), 'Automatic RLS not callable by anon or PUBLIC');
select ok(not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'), 'Automatic RLS not callable by authenticated');
select ok(not has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE'), 'Automatic RLS not callable by service_role');
select ok(has_function_privilege('postgres', 'public.rls_auto_enable()', 'EXECUTE'), 'Function owner retains execution');
select is((select evtenabled::text from pg_event_trigger where evtname = 'phase1_test_auto_rls'), 'O', 'Automatic RLS event trigger remains enabled');
create table public.phase1_auto_rls_probe(id integer);
select ok((select relrowsecurity from pg_class where oid = 'public.phase1_auto_rls_probe'::regclass), 'Event trigger still enables RLS after EXECUTE revocation');

\ir harden_rls_auto_enable.generated.inc
select ok(not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'), 'Hardening is repeatable');
select * from finish();
rollback;
