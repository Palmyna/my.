import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { cloudPublisherConfig, decodeCloudTarget, readCloudTarget } from './database.ts'
import { parseCommand, safeError, verifyPublicationSelection } from './publish.ts'
import { publicationSchema, publicationHash } from './contract.ts'

const directory = mkdtempSync(join(tmpdir(), 'my-notification-config-'))
const caFile = join(directory, 'root.crt')
writeFileSync(caFile, 'synthetic CA bytes; actual TLS exercised separately')
const project = 'aaaaaaaaaaaaaaaaaaaa'
const target = { format: 'my-notification-target-v1', environment: 'cloud', project, connection: 'direct',
  host: `db.${project}.supabase.co`, port: 5432, database: 'postgres', user: 'my_notification_publisher',
  system_id: '9007199254740993', server_port: 5432, ca_file: caFile,
  ca_sha256: createHash('sha256').update(readFileSync(caFile)).digest('hex') }
const selection = ['--environment', 'cloud', '--project', project, '--target', 'target.json', '--authorize-cloud-connect']
const file = ['--file', 'changelog.json', '--expect-version', '0.8.29']
const hash = 'a'.repeat(64)
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('Cloud selection and operator consent', () => {
  test('explicit check, publish and withdrawal; validation stays offline', () => {
    expect(parseCommand([...file, '--check', ...selection])).toMatchObject({ mode: 'check', cloud: { project, expectedVersion: '0.8.29' } })
    expect(parseCommand([...file, '--apply', ...selection, '--authorize-publish', '--expect-hash', hash])).toMatchObject({ mode: 'apply', cloud: { expectedHash: hash } })
    expect(parseCommand(['--withdraw', 'release.0.8.29', ...selection, '--authorize-withdraw'])).toMatchObject({ mode: 'withdraw', key: 'release.0.8.29' })
  })
  test.each([
    ['--file', 'a', '--apply', '--environment', 'production'],
    ['--file', 'a', '--check', '--environment', 'local'],
    ['--file', 'a', '--validate', '--project', project],
    [...file, '--check', ...selection.filter(a => a !== '--authorize-cloud-connect')],
    [...file, '--apply', ...selection],
    [...file, '--apply', ...selection, '--authorize-publish'],
    [...file, '--apply', ...selection, '--expect-hash', hash],
    [...file, '--check', ...selection, '--authorize-publish'],
    [...file, '--check', ...selection, '--expect-hash', hash],
    [...file, '--check', ...selection, '--authorize-withdraw'],
    [...file, '--check', ...selection, '--project', project],
    [...file, '--check', ...selection, '--target=other.json'],
    ['--withdraw', 'release', ...selection],
    ['--withdraw', 'release', ...selection, '--authorize-withdraw', '--expect-version', '0.8.29'],
    ['--file', 'a', '--check', ...selection],
    [...file, '--apply', ...selection, '--authorize-publish', '--expect-hash', 'invalid'],
    [...file, '--check', ...selection.slice(0, 2)],
  ].map(args => [args]))('refuse incomplete, implicit or incoherent selection %j', args => expect(() => parseCommand(args)).toThrow())

  test('mismatched version/hash rejected before any connection', () => {
    const p = publicationSchema.parse(JSON.parse(readFileSync('scripts/notifications/examples/changelog.json', 'utf8')))
    expect(() => verifyPublicationSelection(p, { project, targetFile: 'x', expectedVersion: '0.8.29' })).toThrow('Version')
    expect(() => verifyPublicationSelection(p, { project, targetFile: 'x', expectedVersion: p.app_version!, expectedHash: hash })).toThrow('Empreinte')
    expect(() => verifyPublicationSelection(p, { project, targetFile: 'x', expectedVersion: p.app_version!, expectedHash: publicationHash(p) })).not.toThrow()
    const ordinary = publicationSchema.parse(JSON.parse(readFileSync('scripts/notifications/examples/announcement.json', 'utf8')))
    expect(() => verifyPublicationSelection(ordinary, { project, targetFile: 'x', expectedVersion: '0.8.29' })).not.toThrow()
  })
})

describe('Closed Cloud config and secret hygiene', () => {
  test('direct and session routing retain real dedicated role; exact BIGINT', () => {
    expect(decodeCloudTarget(target, project).system_id).toBe('9007199254740993')
    expect(decodeCloudTarget({ ...target, connection: 'session', host: 'aws-0-eu-west-1.pooler.supabase.com', user: `my_notification_publisher.${project}` }, project).connection).toBe('session')
  })
  test.each([
    { project: 'bbbbbbbbbbbbbbbbbbbb' }, { environment: 'local' }, { connection: 'transaction' }, { port: 6543 },
    { host: 'evil.invalid' }, { host: `${target.host}.evil.invalid` }, { host: `${target.host}?sslmode=no-verify` },
    { host: `postgresql://operator:DO_NOT_PRINT@${target.host}` }, { user: 'postgres' }, { user: 'supabase_admin' },
    { user: 'service_role' }, { user: 'anon' }, { user: 'authenticated' }, { database: 'other' }, { system_id: 9007199254740992 },
    { system_id: '01' }, { server_port: 6543 }, { ca_file: 'relative.crt' }, { sslmode: 'no-verify' },
    { ssl: { rejectUnauthorized: false } }, { connectionString: 'postgres://DO_NOT_PRINT' },
    { password: 'DO_NOT_PRINT' }, { ca_sha256: 'invalid' },
    { connection: 'session', host: 'aws-0-eu-west-1.pooler.supabase.com', user: 'my_notification_publisher.bbbbbbbbbbbbbbbbbbbb' },
  ])('reject target mismatch or URL override %j', delta => {
    expect(() => decodeCloudTarget({ ...target, ...delta }, project)).toThrow()
    try { decodeCloudTarget({ ...target, ...delta }, project) } catch (error) { expect(safeError(error)).not.toContain('DO_NOT_PRINT') }
  })
  test('CA pin checked and no incidental PG/URL configuration inherited', () => {
    vi.stubEnv('MY_NOTIFICATION_DATABASE_URL', '')
    vi.stubEnv('PGSSLMODE', 'disable')
    vi.stubEnv('PGUSER', 'postgres')
    expect(() => cloudPublisherConfig(decodeCloudTarget(target, project), 'DO_NOT_PRINT')).toThrow('PG*')
    vi.stubEnv('PGSSLMODE', '')
    vi.stubEnv('PGUSER', '')
    const config = cloudPublisherConfig(decodeCloudTarget(target, project), 'DO_NOT_PRINT')
    expect(config.connectionString).toBeUndefined()
    expect(config.user).toBe('my_notification_publisher')
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: target.host })
    expect(() => cloudPublisherConfig(decodeCloudTarget({ ...target, ca_sha256: hash }, project), 'DO_NOT_PRINT')).toThrow('Autorité')
    expect(() => cloudPublisherConfig(decodeCloudTarget({ ...target, ca_file: join(directory, 'missing') }, project), 'DO_NOT_PRINT')).toThrow('Autorité')
    expect(() => cloudPublisherConfig(decodeCloudTarget(target, project), undefined)).toThrow('Secret')
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0')
    expect(() => cloudPublisherConfig(decodeCloudTarget(target, project), 'DO_NOT_PRINT')).toThrow('désactivation TLS')
  })
  test.each(['sslmode=disable', 'sslmode=no-verify', 'sslmode=require', 'sslcert=x', 'sslkey=x', 'sslrootcert=x', 'options=-c%20role=postgres'])('no Cloud URL path accepting %s', parameters => {
    vi.stubEnv('MY_NOTIFICATION_DATABASE_URL', `postgresql://my_notification_publisher:DO_NOT_PRINT@${target.host}:5432/postgres?${parameters}`)
    expect(() => cloudPublisherConfig(decodeCloudTarget(target, project), 'DO_NOT_PRINT')).toThrow('connexion URL')
  })
  test('actual CLI incomplete authorization, malformed target and version errors sanitized', () => {
    const targetFile = join(directory, 'target.json')
    writeFileSync(targetFile, JSON.stringify({ ...target, password: 'DO_NOT_PRINT' }))
    expect(() => readCloudTarget(targetFile, project)).toThrow()
    for (const args of [
      ['--file', 'scripts/notifications/examples/changelog.json', '--apply', ...selection],
      ['--file', 'scripts/notifications/examples/changelog.json', '--check', ...selection, '--expect-version', '0.8.29'],
      ['--file', 'scripts/notifications/examples/changelog.json', '--check', ...selection.map(a => a === 'target.json' ? targetFile : a), '--expect-version', '0.8.16'],
    ]) {
      const result = spawnSync(process.execPath, ['scripts/notifications/publish.ts', ...args], { encoding: 'utf8', windowsHide: true,
        env: { ...process.env, MY_NOTIFICATION_DATABASE_PASSWORD: 'DO_NOT_PRINT' } })
      expect(result.status).toBe(1)
      expect(result.stdout + result.stderr).not.toContain('DO_NOT_PRINT')
    }
  })
})
