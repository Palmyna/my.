import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, lstatSync, realpathSync, existsSync } from 'node:fs'
import { join, dirname, parse } from 'node:path'
import { createHash } from 'node:crypto'
import { BackupError, requireBackup, decodeTarget, isNative } from './contract.js'

const tools = ['pg_dump', 'pg_restore', 'psql']
const hash = data => createHash('sha256').update(data).digest('hex')
export function checkedNativePath(path, directory = false) {
  requireBackup(typeof path === 'string' && /^[A-Za-z]:\\/.test(path) && !/[<>:"|?*\r\n\0]/.test(path.slice(2)), 'native_local_absolute_path_required')
  requireBackup(realpathSync(path).toLowerCase() === path.toLowerCase(), 'native_canonical_path_required')
  for (let part = path; part !== parse(part).root; part = dirname(part)) {
    requireBackup(!lstatSync(part).isSymbolicLink(), 'native_reparse_path_refused')
  }
  const stat = lstatSync(path)
  requireBackup(directory ? stat.isDirectory() : stat.isFile(), 'native_path_type_invalid')
  return path
}
export function checkedCA(target) {
  requireBackup(target.ca_file && target.ca_sha256, 'TLS_CA_required')
  if (isNative(target)) checkedNativePath(target.ca_file)
  const ca = readFileSync(target.ca_file)
  requireBackup(hash(ca) === target.ca_sha256, 'TLS_certificate_changed')
  return ca
}
export function validateNativeClients(target) {
  requireBackup(process.platform === 'win32', 'native_windows_required')
  decodeTarget(target, target.environment, target.project)
  requireBackup(isNative(target), 'native_transport_required')
  const { directory, files } = target.native_clients
  try {
    checkedNativePath(directory, true)
    // Include every adjacent DLL: validating only EXEs would miss libpq/OpenSSL
    // replacement. Other executables in the distribution are never callable.
    const names = [...tools.map(t => `${t}.exe`), ...readdirSync(directory).filter(n => /\.dll$/i.test(n))].sort()
    requireBackup(JSON.stringify(names) === JSON.stringify(Object.keys(files).sort()), 'native_runtime_file_set_changed')
    requireBackup(names.includes('libpq.dll'), 'native_libpq_required')
    for (const name of names) {
      const path = checkedNativePath(join(directory, name))
      requireBackup(hash(readFileSync(path)) === files[name], 'native_runtime_hash_changed')
    }
    for (const name of ['.my-backup-no-cert', '.my-backup-no-key', '.my-backup-no-crl']) {
      requireBackup(!existsSync(join(directory, name)), 'native_reserved_path_present')
    }
    return directory
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new BackupError('native_runtime_unavailable')
  }
}
export function nativeEnvironment(target, password) {
  const directory = target.native_clients.directory
  // No inherited PG*, service files, profile, credentials, OpenSSL config,
  // PATH search directories or Node injection variables enter a native child.
  const systemRoot = process.env.SystemRoot
  requireBackup(systemRoot && /^[A-Za-z]:\\[^\r\n\0;]+$/.test(systemRoot), 'windows_system_root_required')
  const env = { SystemRoot:systemRoot, WINDIR:systemRoot, PATH:`${directory};${join(systemRoot, 'System32')}`,
    OPENSSL_CONF:'NUL', PGPASSFILE:'NUL', PGSERVICEFILE:'NUL' }
  if (password !== undefined) {
    requireBackup(typeof password === 'string' && password.length > 0 && !/[\r\n\0]/.test(password), 'database_password_required')
    checkedCA(target)
    Object.assign(env, { PGHOST:target.host, PGPORT:String(target.port), PGUSER:target.user, PGDATABASE:target.database,
      PGPASSWORD:password, PGSSLMODE:'verify-full', PGSSLROOTCERT:target.ca_file, PGSSLMINPROTOCOLVERSION:'TLSv1.2',
      PGGSSENCMODE:'disable', PGSSLCERTMODE:'disable', PGSSLCERT:join(directory,'.my-backup-no-cert'),
      PGSSLKEY:join(directory,'.my-backup-no-key'), PGSSLCRL:join(directory,'.my-backup-no-crl'),
      PGCONNECT_TIMEOUT:'10', PGAPPNAME:'my-backup', PGCLIENTENCODING:'UTF8', PGREQUIREAUTH:'scram-sha-256' })
  }
  return env
}
export function startNative(target, tool, args, { password, signal, timeoutMs = tool === 'pg_dump' ? 900_000 : 300_000 } = {}) {
  requireBackup(tools.includes(tool), 'native_tool_unknown')
  requireBackup(!signal?.aborted, 'postgresql_tool_interrupted')
  const directory = validateNativeClients(target)
  const env = nativeEnvironment(target,password)
  const child = spawn(join(directory, `${tool}.exe`), args, { cwd:directory, env,
    windowsHide:true, shell:false, stdio:['pipe','pipe','pipe'] })
  delete env.PGPASSWORD // The OS has copied its environment. JS strings are not zeroable.
  let stderr = 0, failure
  child.stderr.on('data', b => { stderr += b.length }) // Never echo arbitrary diagnostics.
  child.stdin.on('error', () => undefined)
  const stop = reason => { failure ??= reason; child.kill() }
  const abort = () => stop('postgresql_tool_interrupted')
  const timeout = setTimeout(() => stop('postgresql_tool_timeout'), timeoutMs)
  signal?.addEventListener('abort', abort, { once:true })
  process.once('SIGINT', abort); process.once('SIGTERM', abort)
  const done = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout); signal?.removeEventListener('abort',abort)
      process.removeListener('SIGINT',abort); process.removeListener('SIGTERM',abort)
    }
    child.once('error', () => { cleanup(); reject(new BackupError('postgresql_tool_unavailable')) })
    child.once('close', code => {
      cleanup()
      if (failure || code !== 0 || stderr !== 0) reject(new BackupError(failure ?? 'postgresql_tool_failed_or_warned'))
      else resolve()
    })
  })
  done.catch(() => undefined)
  return { child, done }
}
