import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { promises as fs, constants } from 'node:fs'
import { configurationBundle, preflightStorage, verifyMountedVolume, backupRoot, requireProduction, ProductionError } from './config.js'
import { runBackup } from './backup.js'
import { repositoryIdentity, parseCommand as freezeCommand, run as freezeRun, safeDiagnostic as freezeDiagnostic } from '../maintenance/cli.js'
import { createVercelMaintenance, safeDiagnostic as vercelDiagnostic, VercelMaintenanceError, operatorLockPath } from '../maintenance/vercel.js'
import { connectCloudOperator, cloudConnectionConfig } from '../maintenance/cloud.js'
import { capture } from '../backup/cli.js'
import { requireClosed, identity as backupIdentity } from '../backup/database.js'
import { observe } from '../maintenance/database.js'
import { BackupError, diagnostic as backupDiagnostic } from '../backup/contract.js'
import { MaintenanceError } from '../maintenance/database.js'
import { encryptionKey, restrictDirectory } from '../backup/secure-files.js'
import { archiveVerifier } from './archive.js'

export function safeDiagnostic(error) {
  if (error instanceof ProductionError) return error.message
  if (error instanceof VercelMaintenanceError) return `vercel:${vercelDiagnostic(error)}`
  if (error instanceof MaintenanceError) return `supabase:${freezeDiagnostic(error)}`
  if (error instanceof BackupError) return `backup:${backupDiagnostic(error)}`
  return 'configuration_or_operation_failed_details_suppressed'
}

export async function readDrainage(client, revision) {
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock_shared(771403)')
  const state = await requireClosed(client, { freeze_revision: revision })
  const observation = await observe(client)
  // Validate the sample actually recorded as well as the one requireClosed reads.
  requireProduction(observation.visibility === 'all_database_sessions_at_sample'
    && observation.admission_locks.length === 0 && observation.prepared_transactions.count === '0'
    && !observation.transactions.some(t => t.category !== 'auth_internal'), 'technical_drainage_uncertain')
  await client.query('commit')
  return { state, observation, observed_at: new Date().toISOString(),
    privileged_writer_exclusion: 'operator_declaration_required_not_proven_by_sample' }
}

export function productionAPI(bundle, secrets, signal, configFile) {
  const key = encryptionKey(secrets.key)
  const { config, target, maintenance } = bundle
  const freeze = async (command, revision) => {
    const args = ['--command', command, '--environment', 'cloud', '--project', config.project,
      '--target', config.maintenance_target, '--authorize-cloud-connect']
    if (revision !== undefined) args.push('--expect-revision', revision, '--expect-system-id', target.system_id)
    if (command === 'close') args.push('--authorize-close')
    process.env.MY_MAINTENANCE_DATABASE_PASSWORD = secrets.password
    try { return await freezeRun(freezeCommand(args)) }
    finally { delete process.env.MY_MAINTENANCE_DATABASE_PASSWORD }
  }
  return {
    signal, backupRoot, lockDirectory: join(process.env.LOCALAPPDATA ?? '', 'MY', 'production'),
    repository: () => repositoryIdentity('cloud', config.project),
    checkConfiguration() {
      requireProduction(configurationBundle(configFile).fingerprint === bundle.fingerprint, 'configuration_changed_during_session')
    },
    async prepare() {
      await preflightStorage(bundle, secrets.password)
      await restrictDirectory(config.sessions_directory)
      await fs.access(backupRoot, constants.W_OK)
    },
    vercel: () => createVercelMaintenance(bundle.vercel, secrets.token, { authorizeConnect: true, signal }),
    freeze,
    async drainage(revision) {
      const { client } = await connectCloudOperator(maintenance, cloudConnectionConfig(maintenance, secrets.password))
      try {
        await backupIdentity(client, target)
        return await readDrainage(client, revision)
      } finally { await client.query('rollback').catch(() => undefined); await client.end().catch(() => undefined) }
    },
    async capture(evidence, directory) {
      verifyMountedVolume(config) // Recheck after potentially long operator input.
      // PROD.4 consumes these existing volatile channels. Other phases keep
      // their secrets in closures; nothing is written to argv, reports or Git.
      process.env.MY_BACKUP_KEY = secrets.key
      process.env.MY_BACKUP_DATABASE_PASSWORD = secrets.password
      try { return await capture(target, evidence, bundle.external, directory, { signal }) }
      finally { delete process.env.MY_BACKUP_KEY; delete process.env.MY_BACKUP_DATABASE_PASSWORD }
    },
    verify: archiveVerifier(bundle, key),
    dispose() { key.fill(0); secrets.key = undefined; secrets.password = undefined; secrets.token = undefined },
  }
}

export async function main(args = process.argv.slice(2)) {
  // Consume before Git or any child is started. Do not read CLI credentials or
  // dotenv files, and never expose an environment dump in an error path.
  const secrets = { key: process.env.MY_BACKUP_KEY, password: process.env.MY_BACKUP_DATABASE_PASSWORD,
    token: process.env.MY_VERCEL_MAINTENANCE_TOKEN }
  delete process.env.MY_BACKUP_KEY
  delete process.env.MY_BACKUP_DATABASE_PASSWORD
  delete process.env.MY_VERCEL_MAINTENANCE_TOKEN
  const controller = new AbortController()
  let api, reader, forcedExit, bundle
  const interrupted = () => {
    controller.abort()
    reader?.close()
    console.error('Interruption : état non attesté. Garder maintenance et gel ; examiner session et verrous avant reprise.')
    forcedExit ??= setTimeout(() => process.exit(130), 20_000)
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { config: { type: 'string' } } })
    requireProduction(args.length === 2 && values.config, 'only_config_argument_allowed')
    bundle = configurationBundle(values.config)
    requireProduction(process.stdin.isTTY && process.stdout.isTTY, 'interactive_operator_terminal_required')
    api = productionAPI(bundle, secrets, controller.signal, values.config)
    reader = createInterface({ input: process.stdin, output: process.stdout })
    // Readline owns Ctrl+C while attached to the terminal. Relay it to the
    // process so existing PROD.4 native child handlers receive the same signal.
    reader.on('SIGINT', () => process.emit('SIGINT'))
    const question = message => reader.question(message, { signal: controller.signal })
    const confirm = async (_kind, message, phrase) => (await question(`${message}\nSaisir ${phrase} : `)).trim() === phrase
    const io = { confirm, progress: message => console.log(message), async attest() {
      console.log('Vérifier via accès Vercel authentifié : GET/HEAD 503 MY., headers anti-cache/robots/CSP, routes et assets, domaine, build Production identifié et déploiements compatibles ; propagation/couverture examinées. Vérifier aussi refus API ordinaires avec sessions existantes. Exclure durablement super_admin AAL2, SQL administrateur, publisher, imports, jobs/cron/intégrations, DDL, rôles et configuration jusqu’à fin de capture. Aucune attestation ne remplace le drainage technique. Auth interne reste couvert par le snapshot et les bornes de séquences PROD.4.')
      const deployment_id = (await question('Identifiant réel du déploiement Production contrôlé (dpl_...) : ')).trim()
      const http_checked_at = (await question('Horodatage réel du contrôle HTTP, après fermeture (UTC ISO, exemple 2026-10-16T12:34:56Z) : ')).trim()
      const ok = await confirm('attestation', 'Confirmer uniquement les contrôles réellement effectués et les exclusions établies. Déclaration horodatée, distincte des observations automatiques.', 'FERMETURE ATTESTEE')
      return { deployment_id, http_checked_at, authenticated_http_503: ok, propagation_and_coverage: ok, ordinary_api_refusals: ok,
        privileged_writers_excluded_until_end: ok, ddl_roles_configuration_excluded_until_end: ok }
    } }
    const result = await runBackup(bundle, io, api)
    console.log(`Sauvegarde vérifiée : ${result.backup}\nSession : ${result.session}\nCapture : ${result.capture} · verify : ${result.verify}\nMaintenance et gel conservés. Restauration PROD.5 non prouvée ; publication non autorisée par ce résultat.`)
  } catch (error) {
    console.error(`Arrêt : ${safeDiagnostic(error)}. Garder maintenance et gel ; aucun rollback automatique.`)
    if (bundle) console.error(`Reprise : même commande, session ${bundle.config.sessions_directory}\\current.json. Verrous éventuels : ${join(process.env.LOCALAPPDATA ?? '', 'MY', 'production', 'prod-backup.lock')} ; ${operatorLockPath(bundle.vercel)}. Après interruption forcée, examiner processus et marqueurs exacts avant suppression manuelle.`)
    process.exitCode = controller.signal.aborted ? 130 : 1
  } finally {
    clearTimeout(forcedExit)
    reader?.close()
    api?.dispose()
    secrets.key = undefined; secrets.password = undefined; secrets.token = undefined
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted)
  }
}
if (import.meta.main) await main()
