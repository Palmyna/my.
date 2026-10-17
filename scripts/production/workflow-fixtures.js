// AUTO.5 only: no operator CLI imports this module. External PostgreSQL and
// pg_dump/pg_restore are simulated; orchestration, Git, encryption, manifests,
// verification, Vercel/GitHub adapters, PROD.6 and durable sessions stay real.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes, randomUUID } from 'node:crypto'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import pg from 'pg'
import * as database from '../backup/database.js'
import * as clients from '../backup/clients.js'
import * as maintenanceCLI from '../maintenance/cli.js'
import { encryptFile, decryptJson, bytes, fileHash, hashBytes, restrictDirectory } from '../backup/secure-files.js'
import { createVercelMaintenance } from '../maintenance/vercel.js'
import { githubReader, inspectRelease, inspectSourceRelease, readPinnedChangelog } from './release.js'
import { publish } from '../notifications/publish.ts'
import { publicationHash } from '../notifications/contract.ts'

let active
const spawn = childProcess.spawn
mock.method(globalThis, 'fetch', () => assert.fail('AUTO.5 forbids real HTTP'))
mock.method(pg.Client.prototype, 'connect', () => assert.fail('AUTO.5 forbids real PostgreSQL'))
mock.method(childProcess, 'spawn', (file, args, options) => {
  assert.equal(file, 'git'); assert.deepEqual(args, ['archive', '--format=tar', 'HEAD'])
  return spawn(file, args, { ...options, cwd: active.repo })
})
syncBuiltinESMExports()
mock.module('../maintenance/cli.js', { exports: { ...maintenanceCLI, repositoryIdentity: () => active.repository() } })
mock.module('../backup/database.js', { exports: { ...database,
  connect: async target => { assert.deepEqual(target, active.bundle.target); return active.sql },
  inventory: async () => structuredClone(active.inventory),
  freezeContract: async () => { active.events.push('SQL:contract-fixture'); return { synthetic: true } },
} })
const toc = ['1; 1 1 TABLE auth users postgres', '2; 1 1 TABLE DATA auth users postgres',
  '3; 1 1 SEQUENCE public id_seq postgres', '4; 1 1 SEQUENCE SET public id_seq postgres',
  '5; 1 1 TABLE DATA supabase_migrations schema_migrations postgres'].join('\n')
mock.module('../backup/clients.js', { exports: { ...clients,
  versions: async () => Object.fromEntries(['pg_dump', 'pg_restore', 'psql'].map(k => [k, `${k} (PostgreSQL) 17.11`])),
  dump: async (_target, snapshot, password, file, key) => {
    assert.equal(password, active.password); active.events.push('pg_dump:simulated')
    if (active.fault === 'capture-interrupted') { active.controller.abort(); throw new Error('AUTO5_SECRET_export_interrupted') }
    await encryptFile(bytes(JSON.stringify({ synthetic: true, snapshot, data: 'AUTO5_SYNTHETIC_AUTH' })), file, key)
  },
  inspectArchive: async (_target, file, key, list) => {
    const content = await decryptJson(file, key)
    assert.equal(content.synthetic, true); assert.equal(content.snapshot, '00000001-00000002-1')
    return list ? toc : ''
  },
} })

// Import after installing the test-only provider boundaries.
const { capture, verify } = await import('../backup/cli.js')
const { runBackup } = await import('./backup.js')
const { runOpen } = await import('./open.js')
const { archiveFingerprint } = await import('./archive.js')
const { readDrainage } = await import('./cli.js')
const { operatorIO } = await import('./open-cli.js')
const { loadSession } = await import('./session.js')

export async function workflowFixture(t, { maintenance = false, frozen = false, changelog = 'valid' } = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'my-auto5-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/') + 'my-auto5-'))
    active = undefined
    await fs.rm(root, { recursive: true, force: true })
  })
  const f = { root, repo: join(root, 'repo'), events: [], messages: [], rows: [], captures: 0, dispatches: 0,
    freezeWrites: 0, patches: [], controller: new AbortController(), password: 'AUTO5_SECRET_DB', key: randomBytes(32) }
  active = f
  f.git = args => childProcess.execFileSync('git', args, { cwd: f.repo, encoding: 'utf8', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).trim()
  f.sessions = join(root, 'sessions'); f.backups = join(root, 'backups')
  for (const dir of [f.repo, f.sessions, f.backups]) { await fs.mkdir(dir); await restrictDirectory(dir) }
  f.git(['init', '-b', 'main']); f.git(['config', 'user.name', 'AUTO5 Synthetic']); f.git(['config', 'user.email', 'auto5@example.invalid'])
  // This is an inert local Git URL required by the release contract; never fetch/push.
  f.git(['remote', 'add', 'origin', 'https://github.com/Palmyna/my..git'])
  await fs.mkdir(join(f.repo, 'supabase', 'migrations'), { recursive: true })
  await fs.writeFile(join(f.repo, 'supabase', 'migrations', '20990101000000_auto5.sql'), '-- synthetic fixture only\n')
  await fs.writeFile(join(f.repo, 'base.txt'), 'AUTO.5 synthetic repository\n')
  f.git(['add', '.']); f.git(['commit', '-m', 'test: synthetic main']); f.git(['switch', '-c', 'dev'])
  f.prepareSource = async (version, mode = 'valid') => {
    const publication = { publication_key: `auto5.release.${version}`, category: 'changelog', app_version: mode === 'wrong' ? '98.0.0' : version,
      title: `AUTO.5 synthetic ${version}`, body: 'Synthetic release; never publish to MY.', action: { kind: 'notification_content' },
      requires_action: false, include_new_users: false, expires_at: null,
      publication_context: { reason: 'Isolated AUTO.5 fixture.', include_new_users_justification: null } }
    await fs.writeFile(join(f.repo, 'package.json'), JSON.stringify({ version }))
    await fs.writeFile(join(f.repo, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }))
    await fs.mkdir(join(f.repo, 'scripts', 'notifications', 'releases'), { recursive: true })
    if (mode !== 'missing') await fs.writeFile(join(f.repo, 'scripts', 'notifications', 'releases', `${version}.json`), mode === 'invalid' ? '{}' : JSON.stringify(publication))
    f.git(['add', '.']); f.git(['commit', '-m', `test: synthetic release ${version}`]); f.version = version
  }
  await f.prepareSource('99.0.1', changelog)
  const project = 'a'.repeat(20), target = { format: 'my-backup-target-v1', environment: 'cloud', project,
    host: `db.${project}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', system_id: '12345678901234567890',
    postgres_major: 17, client_image: `sha256:${'b'.repeat(64)}`, ca_file: join(root, 'synthetic.crt'), ca_sha256: 'c'.repeat(64), isolated_container: null }
  const vercel = { format: 'my-vercel-maintenance-target-v1', environment: 'production', project: 'my', domain: 'my.collectrealm.com',
    project_id: 'prj_Auto5', team_id: 'team_Auto5', global_config_id: 'ecfg_Auto5', global_config_slug: 'auto5-maintenance' }
  const external = JSON.parse((await fs.readFile(new URL('../backup/examples/external.json', import.meta.url), 'utf8')).replaceAll('REPLACE', 'auto5'))
  external.project = project; external.configuration.auth.site_url = 'https://auto5.example.invalid'
  external.configuration.edge.deployed_source_sha256 = 'd'.repeat(64); external.records = { auto5: { synthetic: true } }
  f.bundle = { config: { project, sessions_directory: f.sessions, encrypted_volume_evidence: 'auto5' }, target, vercel,
    fingerprint: 'e'.repeat(64), external, baseEvidence: { format: 'my-backup-evidence-v1',
      auth_consistency: 'postgresql_snapshot_external_keys_separate_sessions_reauth_required', storage_and_vault_expected_empty: true,
      storage_configuration_evidence: 'auto5', protected_storage_evidence: 'auto5', unsynchronized_destination: true, key_saved_separately_evidence: 'auto5' } }
  f.identity = { session_user: 'postgres', current_user: 'postgres', database: 'postgres', system_id: target.system_id,
    postgres_version: '17.6', version_num: '170006', replication_role: 'origin', full_visibility: true, tls: true }
  f.freezeState = { frozen, revision: '9007199254740997', changed_by: 'postgres', changed_at: new Date().toISOString() }
  f.inventory = { tables: [{ schema: 'auth', name: 'users', kind: 'r' }, { schema: 'public', name: 'id_seq', kind: 'S' }],
    roles: [{ rolname: 'postgres' }, { rolname: 'my_notification_publisher' }], triggers: [] }
  f.sql = { end: async () => {}, query: async sql => {
    f.events.push(`SQL:${sql.split(/\s/)[0]}`)
    const rows = /session_user::text, current_user::text/.test(sql) ? [f.identity]
      : /private.get_business_write_freeze/.test(sql) ? [f.freezeState]
      : /pg_prepared_xacts/.test(sql) ? [{ count: '0', oldest: null }]
      : /pg_stat_activity|pg_locks/.test(sql) ? []
      : /pg_export_snapshot/.test(sql) ? [{ id: '00000001-00000002-1' }]
      : /last_value::text/.test(sql) ? [{ last_value: '9007199254740999', is_called: true }]
      : /pg_sequence/.test(sql) ? [{ seqstart: '1', seqincrement: '1', seqmax: '9223372036854775807', seqmin: '1', seqcache: '1', seqcycle: false }]
      : /^(begin|commit|rollback|select pg_advisory_xact_lock_shared)/.test(sql) ? [] : assert.fail(`Unexpected synthetic SQL: ${sql}`)
    return { rows: structuredClone(rows) }
  } }
  let maintenanceValue = maintenance, generation = 1
  f.vercelLockDirectory = join(root, 'vercel-locks')
  f.operator = createVercelMaintenance(vercel, 'AUTO5_SECRET_VERCEL', { authorizeConnect: true, lockDirectory: f.vercelLockDirectory,
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'https://api.vercel.com')
      const path = url.pathname
      if (options.method === 'PATCH') {
        const value = JSON.parse(options.body)
        assert.deepEqual(value, { items: [{ operation: 'update', key: 'maintenance_production', value: value.items[0].value }] })
        if (!value.items[0].value && f.fault === 'vercel-open') throw new Error('AUTO5_SECRET_VERCEL_RESPONSE')
        maintenanceValue = value.items[0].value; generation++; f.patches.push(maintenanceValue)
        f.events.push(maintenanceValue ? 'vercel:closed' : 'vercel:opened')
        return Response.json({ status: 'ok' })
      }
      assert.equal(options.method, 'GET')
      const data = path === '/v9/projects/prj_Auto5' ? { id: vercel.project_id, name: 'my', accountId: vercel.team_id,
        ssoProtection: { deploymentType: 'all' }, env: [{ key: 'GLOBAL_CONFIG', target: ['production'], edgeConfigId: vercel.global_config_id, value: 'AUTO5_SECRET_CONFIG' }] }
        : path.includes('/domains/') ? { name: vercel.domain, projectId: vercel.project_id, verified: true }
        : path === '/v1/global-config/ecfg_Auto5' ? { id: vercel.global_config_id, ownerId: vercel.team_id, slug: vercel.global_config_slug, digest: `auto5-${generation}`, updatedAt: generation }
        : path.endsWith('/items') ? [{ key: 'maintenance_production', value: maintenanceValue, edgeConfigId: vercel.global_config_id, createdAt: 1, updatedAt: generation }]
        : path.startsWith('/v4/aliases/') ? { alias: vercel.domain, projectId: vercel.project_id, deploymentId: 'dpl_Auto5' }
        : path === '/v13/deployments/dpl_Auto5' ? { id: 'dpl_Auto5', projectId: vercel.project_id, target: 'production', readyState: 'READY',
          aliasAssigned: true, alias: [vercel.domain], gitSource: { sha: f.merge, ref: 'main' } } : assert.fail(`Unexpected synthetic endpoint: ${path}`)
      return Response.json(data)
    } })
  f.repository = () => ({ project, environment: 'cloud', head: f.git(['rev-parse', 'HEAD']), version: f.version,
    branch: f.git(['branch', '--show-current']), dirty: f.git(['status', '--porcelain']).length > 0 })
  const github = githubReader(undefined, { fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET'); assert.ok(url.startsWith('https://api.github.com/repos/Palmyna/my./'))
    return Response.json(url.endsWith('git/ref/heads/main') ? { ref: 'refs/heads/main', object: { type: 'commit', sha: f.merge } }
      : { number: f.pr, merged: true, state: 'closed', merge_commit_sha: f.merge,
        base: { ref: 'main', repo: { full_name: 'Palmyna/my.' } }, head: { ref: 'dev', sha: f.source, repo: { full_name: 'Palmyna/my.' } } })
  } })
  f.pr = 17
  f.deliver = () => {
    f.source = f.git(['rev-parse', 'HEAD']); f.git(['switch', 'main']); f.git(['merge', '--no-ff', 'dev', '-m', 'test: synthetic delivery'])
    f.merge = f.git(['rev-parse', 'HEAD']); f.git(['switch', 'dev']); assert.notEqual(f.source, f.merge)
    f.migrations = [{ version: '20990101000000', name: 'auto5' }]
    f.events.push('delivery:merged-migrated-promoted-simulated')
  }
  f.reader = { user_id: '55555555-5555-4555-8555-555555555555', registered_at: '2020-01-01T00:00:00Z', profile_exists: true, read_at: null, processed_at: null }
  f.publisher = { query: async (sql, args) => {
    assert.equal(sql, 'select private.publish_notification_announcement($1::jsonb) result'); f.dispatches++
    const p = JSON.parse(args[0]); let row = f.rows.find(r => r.publication.publication_key === p.publication_key)
    if (!row) { row = { announcement_id: randomUUID(), content_hash: publicationHash(p), publication: p,
      published_by: 'my_notification_publisher', published_at: new Date().toISOString(), withdrawn_at: null }; f.rows.push(row) }
    assert.equal(row.content_hash, publicationHash(p)); f.events.push('publisher:committed-simulated')
    if (f.fault === 'lost-publication-response') throw new Error('AUTO5_SECRET_LOST_RESPONSE')
    return { rows: [{ result: { outcome: 'published', publication_key: p.publication_key, content_hash: row.content_hash,
      announcement_id: row.announcement_id, published_at: row.published_at } }] }
  } }
  f.api = { signal: f.controller.signal, backupRoot: f.backups, lockDirectory: join(root, 'locks'), repository: f.repository,
    validateSource: repository => inspectSourceRelease(repository.head, f.repo),
    prepare: async () => {}, checkConfiguration: () => { if (f.fault === 'configuration') throw new Error('AUTO5_SECRET_CONFIG_CHANGE') },
    vercel: () => f.operator, maintenance: () => f.operator.preflight(), deployment: id => f.operator.publication(id),
    freeze: async (command, revision, consent) => {
      if (command !== 'preflight') assert.equal(revision, f.freezeState.revision)
      if (['close', 'reopen'].includes(command) && f.freezeState.frozen !== (command === 'close')) {
        if (command === 'reopen') assert.equal(consent.authorizeReopen, true)
        f.freezeWrites++; f.freezeState.frozen = command === 'close'
        f.freezeState.revision = (BigInt(revision) + 1n).toString(); f.events.push(`freeze:${command}`)
      }
      return { identity: f.identity, state: structuredClone(f.freezeState), verified: true, independent_read: true }
    },
    database: async () => ({ identity: f.identity, state: structuredClone(f.freezeState), migrations: f.migrations }),
    drainage: revision => readDrainage(f.sql, revision),
    capture: async (evidence, dir) => {
      f.captures++; process.env.MY_BACKUP_KEY = f.key.toString('base64'); process.env.MY_BACKUP_DATABASE_PASSWORD = f.password
      try { return await capture(target, evidence, external, dir) }
      finally { delete process.env.MY_BACKUP_KEY; delete process.env.MY_BACKUP_DATABASE_PASSWORD }
    },
    verify: async dir => {
      if (f.fault === 'independent-verify') throw new Error('AUTO5_SECRET_VERIFY')
      const verification = await verify(dir, f.key); f.events.push('archive:verified')
      return { verification, manifest: await decryptJson(join(dir, 'manifest.myb'), f.key),
        evidence: await decryptJson(join(dir, 'evidence.json.myb'), f.key), manifest_sha256: (await fileHash(join(dir, 'manifest.myb'))).sha256 }
    },
    archiveHash: archiveFingerprint, github, release: (source, merge) => inspectRelease(source, merge, f.repo),
    publication: binding => readPinnedChangelog(binding.changelog, binding.version, f.repo),
    readPublication: async binding => ({ identity: f.identity, observed_at: new Date().toISOString(), reader: structuredClone(f.reader),
      announcements: structuredClone(f.rows.filter(r => r.publication.publication_key === binding.changelog.publication_key
        || r.publication.app_version === binding.version)) }),
    publish: async (p, before) => { await before(); return { identity: { project, system_id: target.system_id, database: 'postgres',
      session_user: 'my_notification_publisher', current_user: 'my_notification_publisher', tls_verified: true, permissions_verified: true }, receipt: await publish(f.publisher, p) } },
    reopenMaintenance: consent => f.operator.setMaintenance('reopen', consent),
  }
  // Exercise the real operator questions/schemas, but answers are exclusively
  // synthetic declarations. They never become Production proof or real AAL2.
  f.openIO = operatorIO(async message => {
    f.messages.push(message)
    if (message.startsWith('Numéro réel')) return String(f.pr)
    if (message.startsWith('Identifiant réel')) return 'dpl_Auto5'
    if (message.startsWith('UUID réel')) return f.reader.user_id
    if (message.startsWith('Date UTC')) return new Date().toISOString()
    if (message.startsWith('Référence')) return 'auto5.fixture'
    const phrase = /Saisir ([A-Z0-9 ]+) : $/.exec(message)?.[1]
    assert.ok(phrase, `Unexpected operator question: ${message}`)
    if (f.fault === 'no-aal2' && phrase === 'VISIBILITE AAL2 ATTESTEE') return ''
    if (f.fault === 'no-final-proof' && phrase === 'RETOUR EN LIGNE ATTESTE') return ''
    f.events.push(`consent:${phrase}`); return phrase
  }, message => f.messages.push(message))
  f.backupIO = { progress: message => f.messages.push(message), confirm: async kind => { f.events.push(`consent:${kind}`); return true },
    attest: async () => ({ deployment_id: 'dpl_Auto5', http_checked_at: new Date().toISOString(), authenticated_http_503: true,
      propagation_and_coverage: true, ordinary_api_refusals: true, privileged_writers_excluded_until_end: true, ddl_roles_configuration_excluded_until_end: true }) }
  f.backup = () => runBackup(f.bundle, f.backupIO, f.api)
  f.open = () => runOpen(f.bundle, f.openIO, f.api)
  f.state = () => loadSession(f.sessions)
  f.archiveHashes = async dir => Object.fromEntries(await Promise.all((await fs.readdir(dir)).map(async name => [name, (await fileHash(join(dir, name))).sha256])))
  f.assertNoSecrets = async () => {
    const state = await f.state()
    const text = f.messages.join('\n') + JSON.stringify(state.session) + (await Promise.all(state.session.records.map(r => fs.readFile(join(state.folder, `${r.id}.json`), 'utf8')))).join('')
    assert.ok(!text.includes('AUTO5_SECRET')); assert.ok(!text.includes(f.key.toString('base64')))
    assert.equal(process.env.MY_BACKUP_KEY, undefined); assert.equal(process.env.MY_BACKUP_DATABASE_PASSWORD, undefined)
    return hashBytes(text)
  }
  return f
}
