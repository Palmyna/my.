import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import pg from 'pg'
import { z } from 'zod'
import { assertLocalUrl } from '../catalog/database.ts'
import { verifiedTlsConfig, verifyPostgresTls } from '../postgres-tls.ts'

export class NotificationCliError extends Error {}
const role = 'my_notification_publisher'
const decimal = z.string().regex(/^[1-9][0-9]*$/)
export const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
export const projectReference = z.string().regex(/^[a-z]{20}$/)
export const cloudTargetSchema = z.strictObject({
  format: z.literal('my-notification-target-v1'), environment: z.literal('cloud'),
  project: projectReference, connection: z.enum(['direct', 'session']), host: z.string(),
  port: z.literal(5432), database: z.literal('postgres'), user: z.string(),
  system_id: decimal, server_port: z.literal(5432),
  ca_file: z.string().refine(isAbsolute), ca_sha256: fingerprint,
})
export type CloudTarget = z.output<typeof cloudTargetSchema>

export function decodeCloudTarget(value: unknown, project: string): CloudTarget {
  const result = cloudTargetSchema.safeParse(value)
  if (!result.success || result.data.project !== project) throw new NotificationCliError('Cible Cloud invalide ou projet incohérent.')
  const t = result.data
  if (!(t.connection === 'direct' ? t.host === `db.${project}.supabase.co` && t.user === role
    : /^(aws|gcp)-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(t.host) && t.user === `${role}.${project}`)) {
    throw new NotificationCliError('Cible Cloud exige connexion directe ou Supavisor session, hostname et identité dédiés. Transaction/dedicated poolers refusés.')
  }
  return t
}

export function readCloudTarget(file: string, project: string): CloudTarget {
  let value: unknown
  try {
    if (!statSync(file).isFile() || statSync(file).size > 16_384) throw new Error()
    value = JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch { throw new NotificationCliError('Fichier de cible Cloud illisible ou trop volumineux.') }
  return decodeCloudTarget(value, project)
}

export function publisherConfig(connection: string | undefined): pg.ClientConfig {
  try {
    if (!connection) throw new Error()
    assertLocalUrl(connection)
    const url = new URL(connection)
    if (decodeURIComponent(url.username) !== role || !url.password || url.hash) throw new Error()
  } catch { throw new NotificationCliError('MY_NOTIFICATION_DATABASE_URL doit cibler le rôle my_notification_publisher sur Supabase Local, port 55322, base postgres, sans paramètres URL ni fragment.') }
  // Local retains its original loopback-only transport. Cloud never parses a
  // connectionString: URL ssl options cannot replace the verified TLS object.
  return { connectionString: connection, ssl: false, connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000, application_name: 'my-notification-publisher' }
}

export function cloudPublisherConfig(target: CloudTarget, password: string | undefined): pg.ClientConfig {
  const t = decodeCloudTarget(target, target.project)
  if (!password || password.length > 1024 || /[\r\n\0]/.test(password)) throw new NotificationCliError('Secret PostgreSQL Cloud absent ou invalide. Utiliser la saisie protégée hors Git et arguments.')
  if (process.env.MY_NOTIFICATION_DATABASE_URL || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new NotificationCliError('Retirer la connexion URL Local et toute désactivation TLS avant sélection Cloud.')
  }
  // pg also reads PGOPTIONS/PGREPLICATION/PGSSLNEGOTIATION and other defaults.
  // Refuse incidental libpq environment rather than inheriting startup options.
  if (Object.keys(process.env).some(key => /^PG/i.test(key) && process.env[key])) {
    throw new NotificationCliError('Retirer les variables PG* héritées avant connexion Cloud. Seule la cible examinée configure le publisher.')
  }
  let ssl: pg.ClientConfig['ssl']
  try {
    ssl = verifiedTlsConfig(t)
  } catch { throw new NotificationCliError('Autorité TLS absente, illisible ou empreinte différente. Aucun repli autorisé.') }
  return { host: t.host, port: t.port, database: t.database, user: t.user, password,
    ssl,
    connectionTimeoutMillis: 10_000, statement_timeout: 15_000, query_timeout: 17_000,
    application_name: 'my-notification-publisher' }
}

const expectedRole = z.strictObject({ session_user: z.literal(role), current_user: z.literal(role),
  rolsuper: z.literal(false), rolcreatedb: z.literal(false), rolcreaterole: z.literal(false), rolreplication: z.literal(false),
  rolbypassrls: z.literal(false), rolinherit: z.literal(false), rolcanlogin: z.literal(true), rolconnlimit: z.literal(4),
  member: z.literal(false), database: z.literal('postgres'), port: z.literal(5432),
  replication_role: z.literal('origin'), isolation: z.literal('read committed') })

// Read catalogs as the actual publisher, including effective PUBLIC/column
// grants. No direct business reads, SET ROLE, privilege escalation or freeze RPC.
export async function verifyPublisher(client: pg.Client, target?: CloudTarget): Promise<void> {
  const identity = await client.query(`select session_user::text,current_user::text,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
    r.rolreplication,r.rolbypassrls,r.rolinherit,r.rolcanlogin,r.rolconnlimit,
    exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid) member,
    current_database() database,inet_server_port() port,
    current_setting('session_replication_role') replication_role,current_setting('transaction_isolation') isolation
    from pg_catalog.pg_roles r where r.rolname=current_user`)
  if (identity.rows.length !== 1 || !expectedRole.safeParse(identity.rows[0]).success) {
    throw new NotificationCliError('Identité, serveur ou attributs du rôle PostgreSQL invalides.')
  }
  if (target) {
    // Already available on Local through standard PUBLIC rights. If hosted ACL
    // refuses this read, stop; never GRANT or substitute an administrative login.
    const server = await client.query<{ system_id: string }>('select (pg_catalog.pg_control_system()).system_identifier::text system_id')
    if (server.rows.length !== 1 || server.rows[0]?.system_id !== target.system_id) {
      throw new NotificationCliError('Identité réelle du cluster PostgreSQL différente de la cible examinée.')
    }
  }
  const permissions = await client.query(`select
    has_database_privilege(current_user,current_database(),'CONNECT')
      and not has_database_privilege(current_user,current_database(),'CREATE')
      and has_schema_privilege(current_user,'private','USAGE')
      and not has_schema_privilege(current_user,'auth','USAGE')
      and not exists(select 1 from pg_catalog.pg_namespace n where n.nspname not like 'pg_%'
        and n.nspname<>'information_schema' and has_schema_privilege(current_user,n.oid,'CREATE')) as schemas,
    not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','auth','storage','supabase_migrations') and
        ((c.relkind in ('r','p','v','m','f') and (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
        or (c.relkind='S' and has_sequence_privilege(current_user,c.oid,'SELECT,UPDATE,USAGE')))) as data,
    (select count(*)=2 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and has_function_privilege(current_user,p.oid,'EXECUTE'))
      and (select count(*)=2 from pg_catalog.pg_proc p where p.oid in
        (to_regprocedure('private.publish_notification_announcement(jsonb)'),to_regprocedure('private.withdraw_notification_announcement(text)'))
        and p.prorettype='jsonb'::regtype and p.prosecdef and p.provolatile='v' and p.proowner='postgres'::regrole
        and p.proconfig=array['search_path=""']::text[] and has_function_privilege(current_user,p.oid,'EXECUTE')
        and not has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION')
        and not exists(select 1 from unnest(array['anon','authenticated','service_role']) a
          where has_function_privilege(a,p.oid,'EXECUTE')))
      as functions,
    not exists(select 1 from pg_catalog.pg_class where relowner=current_user::regrole)
      and not exists(select 1 from pg_catalog.pg_proc where proowner=current_user::regrole)
      and not exists(select 1 from pg_catalog.pg_namespace where nspowner=current_user::regrole)
      and not exists(select 1 from pg_catalog.pg_database where datdba=current_user::regrole) as ownership`)
  const closed = z.strictObject({ schemas: z.literal(true), data: z.literal(true), functions: z.literal(true), ownership: z.literal(true) })
  if (permissions.rows.length !== 1 || !closed.safeParse(permissions.rows[0]).success) {
    throw new NotificationCliError('Permissions effectives supplémentaires, manquantes ou fonctions privées incohérentes. Aucune écriture autorisée.')
  }
}

// pg exposes the negotiated TLSSocket through its connection. Check this leg,
// not pg_stat_ssl: Supavisor's separate backend leg may use another transport.
export function verifyPublisherTls(client: pg.Client, target: CloudTarget): void {
  try { verifyPostgresTls(client, target) } catch {
    throw new NotificationCliError('TLS non vérifié, protocole ou hostname incohérent. Aucune écriture autorisée.')
  }
}

async function openPublisher(config: pg.ClientConfig, target?: CloudTarget): Promise<pg.Client> {
  const client = new pg.Client(config)
  client.on('error', () => undefined)
  try {
    await client.connect()
    if (target) verifyPublisherTls(client, target)
    await verifyPublisher(client, target)
    return client
  } catch (error) { await client.end().catch(() => undefined); throw error }
}

export async function connectPublisher(connection = process.env.MY_NOTIFICATION_DATABASE_URL): Promise<pg.Client> {
  return await openPublisher(publisherConfig(connection))
}
export async function connectCloudPublisher(target: CloudTarget): Promise<pg.Client> {
  const password = process.env.MY_NOTIFICATION_DATABASE_PASSWORD
  delete process.env.MY_NOTIFICATION_DATABASE_PASSWORD
  return await openPublisher(cloudPublisherConfig(target, password), target)
}
