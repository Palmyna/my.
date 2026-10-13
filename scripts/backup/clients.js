import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { requireBackup, BackupError } from './contract.js'
import { encryptFile, decryptFile, discard } from './secure-files.js'

// Password travels only over stdin into an ephemeral container's environment.
// It never enters docker argv, inspect Config.Env, a URL, a file or diagnostic output.
const bootstrap = `set -euo pipefail
IFS= read -r PGHOST
IFS= read -r PGPORT
IFS= read -r PGUSER
IFS= read -r PGDATABASE
IFS= read -r PGPASSWORD
IFS= read -r PGSSLMODE
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD PGSSLMODE
export PGSSLROOTCERT=/certs/root.crt PGCONNECT_TIMEOUT=10 PGAPPNAME=my-backup
exec "$@"`
export function dockerArgs(target, tool, args, connected = false) {
  const result = ['run', '--rm', '-i', '--pull=never', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--network', connected ? (target.environment === 'isolated' ? `container:${target.isolated_container}` : 'bridge') : 'none']
  if (connected && target.ca_file) result.push('--mount', `type=bind,source=${target.ca_file},target=/certs/root.crt,readonly`)
  result.push('--entrypoint', 'bash', target.client_image, '-c', connected ? bootstrap : 'exec "$@"', 'my-backup', tool, ...args)
  return result
}
function start(args) {
  // Do not inherit incidental PG*, Docker TLS bypass, credentials or connection URLs.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMDATA)$/i.test(k)))
  const child = spawn('docker', args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = 0
  child.stderr.on('data', b => { stderr += b.length }) // Never forward arbitrary server/Docker output.
  child.stdin.on('error', () => undefined)
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new BackupError('postgresql_tool_unavailable')))
    child.once('close', code => code === 0 && stderr === 0 ? resolve() : reject(new BackupError('postgresql_tool_failed_or_warned')))
  })
  // A later pipeline failure may abandon this promise; suppress unhandled rejection.
  done.catch(() => undefined)
  return { child, done }
}
export async function toolText(target, tool, args) {
  const { child, done } = start(dockerArgs(target, tool, args))
  const chunks = []
  let length = 0
  child.stdout.on('data', b => {
    length += b.length
    if (length > 16 * 1024 * 1024) child.kill()
    else chunks.push(b)
  })
  child.stdin.end()
  await done
  return Buffer.concat(chunks).toString('utf8')
}
export async function versions(target) {
  const versions = {}
  for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
    const value = (await toolText(target, tool, ['--version'])).trim()
    requireBackup(new RegExp(`^${tool} \\(PostgreSQL\\) ${target.postgres_major}\\.[0-9]+(?: \\([^\\r\\n]+\\))?$`).test(value), 'client_version_incompatible')
    versions[tool] = value
  }
  return versions
}
export function dumpArgs(snapshot) {
  requireBackup(/^[a-fA-F0-9-]+$/.test(snapshot), 'snapshot_invalid')
  return ['--format=custom', '--quote-all-identifiers', '--no-password', `--snapshot=${snapshot}`, '--lock-wait-timeout=10s']
}
export async function dump(target, snapshot, password, filename, key) {
  requireBackup(typeof password === 'string' && password.length > 0 && !/[\r\n\0]/.test(password), 'database_password_required')
  const { child, done } = start(dockerArgs(target, 'pg_dump', dumpArgs(snapshot), true))
  child.stdin.end([target.environment === 'isolated' ? '127.0.0.1' : target.host,
    target.environment === 'isolated' ? '5432' : String(target.port), target.user, target.database,
    password, target.environment === 'cloud' ? 'verify-full' : 'disable', ''].join('\n'))
  try { await encryptFile(child.stdout, filename, key); await done }
  catch (error) { child.kill(); throw error }
}
export async function inspectArchive(target, filename, key, list = false) {
  const { child, done } = start(dockerArgs(target, 'pg_restore', list ? ['--list'] : ['--exit-on-error', '--file=/dev/null']))
  const chunks = []
  let length = 0
  child.stdout.on('data', b => {
    if (!list) return
    length += b.length
    if (length > 16 * 1024 * 1024) child.kill()
    else chunks.push(b)
  })
  try { await decryptFile(filename, key, child.stdin); await done }
  catch (error) { child.kill(); throw error }
  return Buffer.concat(chunks).toString('utf8')
}
// Used only by isolated tests to initialize synthetic data; never exported to the CLI.
export async function fixtureSql(container, sql) {
  requireBackup(/^my-prod4-test-[a-f0-9]{12}$/.test(container), 'isolated_target_required')
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdout.pipe(discard()); child.stderr.pipe(discard())
  child.stdin.end(sql)
  const [code] = await once(child, 'close')
  requireBackup(code === 0, 'synthetic_fixture_initialization_failed')
}
