import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import pg from 'pg'
import { z } from 'zod'
import { verifiedTlsConfig, verifyPostgresTls } from '../postgres-tls.ts'
import { MaintenanceError, operatorIdentity } from './database.js'

export const cloudProject = 'xvtiwhxvtfxvvokquttu'
const schema = z.strictObject({
  format: z.literal('my-maintenance-target-v1'), environment: z.literal('cloud'), project: z.literal(cloudProject),
  connection: z.enum(['direct', 'session']), host: z.string(), port: z.literal(5432),
  database: z.literal('postgres'), user: z.string(), system_id: z.string().regex(/^[1-9]\d*$/),
  server_port: z.literal(5432), ca_file: z.string().refine(isAbsolute), ca_sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export function decodeCloudTarget(value) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new MaintenanceError('cloud_target_invalid')
  const t = parsed.data
  if (!(t.connection === 'direct' ? t.host === `db.${cloudProject}.supabase.co` && t.user === 'postgres'
    : /^(aws|gcp)-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(t.host) && t.user === `postgres.${cloudProject}`)) {
    throw new MaintenanceError('cloud_endpoint_or_operator_invalid')
  }
  return t
}

export function readCloudTarget(file) {
  let value
  try {
    if (!statSync(file).isFile() || statSync(file).size > 16_384) throw new Error()
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch { throw new MaintenanceError('cloud_target_unreadable') }
  return decodeCloudTarget(value)
}

export function cloudConnectionConfig(target, password, timeout = 15_000) {
  const t = decodeCloudTarget(target)
  if (typeof password !== 'string' || !password || password.length > 1024 || /[\r\n\0]/.test(password)) {
    throw new MaintenanceError('cloud_password_missing_or_invalid')
  }
  if (process.env.MY_MAINTENANCE_DATABASE_URL || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    || Object.keys(process.env).some(key => /^PG/i.test(key) && process.env[key])) {
    throw new MaintenanceError('cloud_inherited_connection_or_tls_options_refused')
  }
  let ssl
  try { ssl = verifiedTlsConfig(t) } catch { throw new MaintenanceError('cloud_tls_ca_invalid') }
  return { host: t.host, port: t.port, database: t.database, user: t.user, password, ssl,
    application_name: 'my-maintenance-cloud', connectionTimeoutMillis: 5_000,
    statement_timeout: timeout, query_timeout: timeout + 2_000,
    options: '-c search_path=pg_catalog', sslnegotiation: 'postgres', client_encoding: 'UTF8', replication: 'false' }
}

export async function connectCloudOperator(target, config) {
  const client = new pg.Client(config)
  client.on('error', () => undefined)
  try {
    await client.connect()
    try { verifyPostgresTls(client, target) } catch { throw new MaintenanceError('cloud_tls_transport_unverified') }
    const identity = await operatorIdentity(client)
    if (identity.session_user !== 'postgres' || identity.system_id !== target.system_id) {
      throw new MaintenanceError('unexpected_cloud_postgresql_system_or_operator')
    }
    return { client, identity: { ...identity, transport: 'verified_TLS_CA_and_hostname', connection: target.connection } }
  } catch (error) {
    await client.end().catch(() => undefined)
    if (error?.code === 'ECONNREFUSED') throw new MaintenanceError('cloud_service_unavailable')
    throw error
  }
}

export function cloudOperator(command) {
  // Consume before spawning Git or opening any socket. Retain only for this
  // command's required independent connection; no child inherits the password.
  const password = process.env.MY_MAINTENANCE_DATABASE_PASSWORD
  delete process.env.MY_MAINTENANCE_DATABASE_PASSWORD
  const target = readCloudTarget(command.target)
  if (command.systemId !== undefined && command.systemId !== target.system_id) throw new MaintenanceError('unexpected_postgresql_system')
  const config = cloudConnectionConfig(target, password, command.timeout)
  return () => connectCloudOperator(target, config)
}
