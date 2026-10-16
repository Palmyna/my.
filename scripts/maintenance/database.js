import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { assertLocalUrl, localConnection } from '../catalog/database.ts'

export class MaintenanceError extends Error {}
export const barrier = '771403'
const deniedRoles = ['anon', 'authenticated', 'service_role', 'supabase_auth_admin', 'authenticator', 'my_notification_publisher']
const controlNames = ['set_business_write_freeze', 'get_business_write_freeze', 'require_business_writes_open',
  'guard_business_write_freeze', 'set_app_role', 'is_super_admin']
const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url)
const normalize = value => value.replaceAll('\r\n', '\n').trim()

export function connectionConfig(connection, timeout = 15_000) {
  try {
    assertLocalUrl(connection)
    const url = new URL(connection)
    if (!['postgres', 'supabase_admin'].includes(decodeURIComponent(url.username)) || url.hash) throw new Error()
  } catch { throw new MaintenanceError('target_or_operator_invalid') }
  return { connectionString: connection, ssl: false, application_name: 'my-maintenance-local',
    connectionTimeoutMillis: 5_000, statement_timeout: timeout, query_timeout: timeout + 2_000 }
}

export function operatorConnection() {
  return process.env.MY_MAINTENANCE_DATABASE_URL ?? localConnection()
}

export async function connectOperator(connection, timeout) {
  const client = new pg.Client(connectionConfig(connection, timeout))
  client.on('error', () => undefined)
  try {
    await client.connect()
    return { client, identity: await operatorIdentity(client) }
  } catch (error) { await client.end().catch(() => undefined); throw error }
}

export async function operatorIdentity(client) {
  const { rows: [identity] } = await client.query(`select session_user::text, current_user::text,
      current_database() as database, inet_server_port() as port,
      (pg_control_system()).system_identifier::text as system_id,
      current_setting('server_version') as postgres_version,
      current_setting('session_replication_role') as replication_role,
      (r.rolsuper or pg_has_role(current_user, 'pg_read_all_stats', 'USAGE')) as full_visibility
      from pg_roles r where r.rolname = current_user`)
  if (!identity || !['postgres', 'supabase_admin'].includes(identity.session_user)
    || identity.current_user !== identity.session_user || identity.database !== 'postgres' || identity.port !== 5432
    || identity.replication_role !== 'origin' || identity.full_visibility !== true) {
    throw new MaintenanceError('identity_or_visibility_invalid')
  }
  return identity
}

export async function readFreeze(client) {
  // Never decode the JSON BIGINT as a JavaScript number.
  const { rows: [state] } = await client.query(`select (s->>'frozen')::boolean frozen, s->>'revision' revision,
    s->>'changed_at' changed_at, s->>'changed_by' changed_by from (select private.get_business_write_freeze() s) q`)
  if (!state || typeof state.frozen !== 'boolean' || !/^(0|[1-9]\d*)$/.test(state.revision)
    || !['postgres', 'supabase_admin'].includes(state.changed_by) || !Number.isFinite(Date.parse(state.changed_at))) {
    throw new MaintenanceError('freeze_state_unknown')
  }
  return state
}

function expectedBodies() {
  const bodies = new Map()
  for (const filename of ['20261013133423_prod2_business_write_freeze.sql', '20261013135415_prod2_freeze_admission_barrier.sql',
    '20261015103447_prod7b21_app_roles.sql', '20261015123024_prod7b22_superadmin_freeze.sql']) {
    const source = readFileSync(new URL(filename, migrationDirectory), 'utf8')
    for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+((?:private|public)\.\w+)\(([^]*?)\)\s*returns\s+(\w+)([^]*?)\bas\s+(\$\w*\$)([^]*?)\5/gi)) {
      const argumentsList = match[2].trim() ? match[2].split(',').map(a => a.trim().split(/\s+default\s+/i)[0].split(/\s+/)) : []
      const result = match[3].toLowerCase() === 'table'
        ? `TABLE(${match[4].match(/^\s*\(([^]*?)\)/)[1].split(',').map(a => a.trim().replace(/\s+/g, ' ')).join(', ')})`
        : match[3].toLowerCase()
      bodies.set(match[1], { body: normalize(match[6]), names: argumentsList.map(a => a[0]),
        types: argumentsList.map(a => a.slice(1).join(' ')).join(', '), result })
    }
  }
  if (bodies.size !== 17) throw new MaintenanceError('repository_contract_invalid')
  return bodies
}

export async function verifyFreezeContract(client) {
  const expected = expectedBodies()
  const { rows: functions } = await client.query(`select n.nspname || '.' || p.proname name, p.prosrc,
    p.proowner::regrole::text owner, p.prosecdef, p.proconfig,
    p.proargnames[1:p.pronargs] input_names, oidvectortypes(p.proargtypes) argument_types, pg_get_function_result(p.oid) result_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname || '.' || p.proname = any($1::text[])`, [[...expected.keys()]])
  if (functions.length !== expected.size || functions.some(f => normalize(f.prosrc) !== expected.get(f.name).body
    || f.argument_types !== expected.get(f.name).types || f.result_type !== expected.get(f.name).result
    || JSON.stringify(f.input_names ?? []) !== JSON.stringify(expected.get(f.name).names)
    || f.owner !== 'postgres' || f.proconfig?.length !== 1 || f.proconfig[0] !== 'search_path=""'
    || f.prosecdef !== !['private.set_business_write_freeze', 'private.get_business_write_freeze', 'private.set_app_role'].includes(f.name))) {
    throw new MaintenanceError('function_contract_incomplete')
  }
  const { rows: guards } = await client.query(`select format('%I.%I',n.nspname,c.relname) relation,
    t.tgtype, t.tgenabled, t.tgfoid='private.guard_business_write_freeze()'::regprocedure as correct_function
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_trigger t on t.tgrelid=c.oid and t.tgname='business_write_freeze' and not t.tgisinternal
    where (n.nspname in ('public','private') and c.relkind in ('r','p')
      and c.oid<>'private.business_write_freeze'::regclass) or c.oid='auth.users'::regclass order by 1`)
  if (guards.length !== 24 || guards.some(g => g.tgtype !== (g.relation === 'auth.users' ? 14 : 62)
    || g.tgenabled !== 'O' || !g.correct_function)) throw new MaintenanceError('table_guards_incomplete')
  const { rows: [security] } = await client.query(`select
    (select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='private.business_write_freeze'::regclass)
      and not exists(select 1 from pg_policy where polrelid='private.business_write_freeze'::regclass)
      and (select count(*)=1 from private.business_write_freeze) as state_closed_acl,
    (select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='private.app_role_assignments'::regclass)
      and not exists(select 1 from pg_policy where polrelid='private.app_role_assignments'::regclass)
      and not exists(select 1 from unnest($1::text[]) r where has_table_privilege(r,'private.app_role_assignments',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as role_closed_acl,
    not exists(select 1 from unnest($1::text[]) r, pg_proc p
      where p.pronamespace='private'::regnamespace and p.proname=any($2::text[])
      and has_function_privilege(r,p.oid,'EXECUTE'))
      and not exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.pronamespace='private'::regnamespace and p.proname=any($2::text[]) and a.grantee=0) as control_acl,
    not exists(select 1 from unnest($1::text[]) r where has_table_privilege(r,'private.business_write_freeze',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as state_no_api_access,
    not exists(select 1 from pg_roles r where r.rolname='my_notification_publisher'
      and (r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls or r.rolinherit))
      and exists(select 1 from pg_roles where rolname='my_notification_publisher' and rolcanlogin)
      and not exists(select 1 from pg_auth_members where member='my_notification_publisher'::regrole) as publisher_identity,
    (select count(*)=2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and has_function_privilege('my_notification_publisher',p.oid,'EXECUTE'))
      and has_function_privilege('my_notification_publisher','private.publish_notification_announcement(jsonb)','EXECUTE')
      and has_function_privilege('my_notification_publisher','private.withdraw_notification_announcement(text)','EXECUTE')
      and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private','auth') and c.relkind in ('r','p','v')
        and has_table_privilege('my_notification_publisher',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as publisher_permissions`,
  [deniedRoles, controlNames])
  if (!security || Object.values(security).some(v => v !== true)) throw new MaintenanceError('permissions_incomplete')
  return { tables: guards.length, functions: functions.length, permissions: 'verified' }
}

export async function verifyContract(client) {
  const contract = await verifyFreezeContract(client)
  const versions = (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version)
  const files = readdirSync(migrationDirectory).filter(f => /^\d{14}_.+\.sql$/.test(f)).map(f => f.slice(0, 14)).sort()
  if (JSON.stringify(versions) !== JSON.stringify(files)) throw new MaintenanceError('migration_history_mismatch')
  return { ...contract, migrations: versions.length, last_migration: versions.at(-1) }
}

export async function observe(client, excludedPids = []) {
  // Intentionally omit query, application_name, client address and arbitrary role names.
  const { rows: transactions } = await client.query(`select pid,
    case when usename in ('authenticator','postgres','supabase_admin','my_notification_publisher','supabase_auth_admin')
      then usename else 'unclassified' end sql_identity,
    case when usename='authenticator' then 'ordinary' when usename in ('postgres','supabase_admin','my_notification_publisher')
      then 'privileged' when usename='supabase_auth_admin' then 'auth_internal' else 'unclassified' end category,
    state, xact_start::text, wait_event_type, wait_event, pg_blocking_pids(pid) blockers
    from pg_stat_activity where datname=current_database() and backend_type='client backend'
      and xact_start is not null and pid<>pg_backend_pid() and not (pid=any($1::int[])) order by pid`, [excludedPids])
  const { rows: locks } = await client.query(`select pid, mode, granted, pg_blocking_pids(pid) blockers from pg_locks
    where locktype='advisory' and database=(select oid from pg_database where datname=current_database())
      and classid=0 and objid=771403 and objsubid=1 and (pid is null or (pid<>pg_backend_pid() and not(pid=any($1::int[]))))
    order by pid,mode`, [excludedPids])
  const { rows: [prepared] } = await client.query(`select count(*)::text count, min(prepared)::text oldest
    from pg_prepared_xacts where database=current_database()`)
  return { transactions, admission_locks: locks, prepared_transactions: prepared,
    visibility: 'all_database_sessions_at_sample', privileged_and_auth_drained: false }
}

export async function probeOrdinary(connection, frozen, timeout = 15_000) {
  const url = new URL(connection)
  url.username = 'authenticator'
  const client = new pg.Client({ ...connectionConfig(connection, timeout), connectionString: url.href })
  client.on('error', () => undefined)
  try {
    await client.connect()
    if ((await client.query('select session_user::text as identity')).rows[0].identity !== 'authenticator') throw new MaintenanceError('probe_identity_invalid')
    for (const role of ['authenticated', 'service_role']) {
      await client.query('begin')
      try {
        await client.query(`set local role ${role}`) // closed internal allowlist
        // Zero rows: no fake JWT/MFA, personal data, fixture, sequence or successful business mutation.
        await client.query('select id from public.pokemon where false')
        let refused = false
        try { await client.query('update public.user_preferences set binder_default_format=binder_default_format where false') }
        catch (error) {
          if (error.code !== 'PT503' || error.message !== 'business_writes_frozen' || !frozen) throw new MaintenanceError('ordinary_probe_inconclusive')
          refused = true
        }
        if (refused !== frozen) throw new MaintenanceError('ordinary_freeze_not_effective')
      } finally { await client.query('rollback') }
    }
    return { identity: 'authenticator', roles: ['authenticated', 'service_role'], reads: 'allowed',
      statement_writes: frozen ? 'PT503_refused' : 'allowed_zero_rows', scope: 'SQL_statement_guard_no_MFA_or_HTTP_claim' }
  } finally { await client.end().catch(() => undefined) }
}
