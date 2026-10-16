import { join } from 'node:path'
import { configurationBundle, verifyMountedVolume, backupRoot, requireProduction } from './config.js'
import { archiveVerifier, archiveFingerprint } from './archive.js'
import { githubReader, inspectRelease } from './release.js'
import { connectCloudOperator, cloudConnectionConfig } from '../maintenance/cloud.js'
import { verifyFreezeContract, readFreeze } from '../maintenance/database.js'
import { createVercelMaintenance } from '../maintenance/vercel.js'
import { encryptionKey } from '../backup/secure-files.js'
import { checkedNativePath } from '../backup/native.js'

// AUTO.1 primitives, same TLS/identity and SQL security contract. Compare
// history against the backed-up Git source, never a possibly advanced dev tree.
export async function readPublicationDatabase(target, connection, open = connectCloudOperator) {
  const { client, identity } = await open(target, connection)
  try {
    await client.query('begin isolation level repeatable read read only')
    const contract = await verifyFreezeContract(client)
    const state = await readFreeze(client)
    const migrations = (await client.query('select version, name from supabase_migrations.schema_migrations order by version')).rows
    await client.query('commit')
    return { identity, contract, state, migrations, observed_at: new Date().toISOString(),
      evidence_scope: 'SQL_contract_and_migration_history_not_deployment_logs_or_backend_compatibility' }
  } finally { await client.query('rollback').catch(() => undefined); await client.end().catch(() => undefined) }
}

// Internal reusable API, no command and no mutation capability exposed. Secrets
// stay in closures. Caller must consume volatile channels before any Git child.
export function openPreparationAPI(bundle, secrets, { authorizeConnect, signal, configFile } = {}) {
  requireProduction(authorizeConnect === true, 'read_connections_authorization_required')
  const github = githubReader(secrets.githubToken, { signal })
  const vercel = createVercelMaintenance(bundle.vercel, secrets.token, { authorizeConnect: true, signal })
  const connection = cloudConnectionConfig(bundle.maintenance, secrets.password)
  const key = encryptionKey(secrets.key)
  const checkConfiguration = () => requireProduction(configurationBundle(configFile).fingerprint === bundle.fingerprint,
    'configuration_changed_during_session')
  return { signal, backupRoot, lockDirectory: join(process.env.LOCALAPPDATA ?? '', 'MY', 'production'),
    checkConfiguration,
    async prepare() {
      requireProduction(process.platform === 'win32', 'windows_operator_required')
      checkedNativePath(bundle.config.sessions_directory, true)
      verifyMountedVolume(bundle.config)
      checkConfiguration()
    },
    github, release: inspectRelease, verify: archiveVerifier(bundle, key),
    maintenance: () => vercel.preflight(), deployment: id => vercel.publication(id),
    database: () => readPublicationDatabase(bundle.maintenance, connection),
    async archiveHash(directory, manifest) {
      verifyMountedVolume(bundle.config)
      checkedNativePath(directory, true)
      return archiveFingerprint(directory, manifest)
    },
    dispose() { key.fill(0); connection.password = undefined; Object.keys(secrets).forEach(k => { secrets[k] = undefined }) },
  }
}
