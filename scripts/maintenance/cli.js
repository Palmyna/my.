import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { MaintenanceError, operatorConnection, connectOperator, readFreeze, verifyContract, observe, probeOrdinary } from './database.js'

const root = new URL('../../', import.meta.url)
const decimal = /^(0|[1-9]\d*)$/
export function parseCommand(args) {
  let values
  try {
    values = parseArgs({ args, strict: true, allowPositionals: false, options: {
      command: { type: 'string' }, environment: { type: 'string' }, project: { type: 'string' },
      'expect-system-id': { type: 'string' }, 'expect-revision': { type: 'string' },
      'authorize-reopen': { type: 'boolean' }, 'timeout-ms': { type: 'string' },
    } }).values
  } catch { throw new MaintenanceError('arguments_invalid') }
  const names = args.filter(a => a.startsWith('--')).map(a => a.split('=')[0])
  const commands = ['preflight', 'observe', 'close', 'verify-closed', 'reopen', 'verify-open']
  const bound = ['close', 'reopen', 'verify-closed', 'verify-open'].includes(values.command)
  if (new Set(names).size !== names.length || !commands.includes(values.command) || values.environment !== 'local'
    || values.project !== 'my-local' || (bound && (!decimal.test(values['expect-system-id'] ?? '') || !decimal.test(values['expect-revision'] ?? '')))
    || (!bound && (values['expect-system-id'] !== undefined || values['expect-revision'] !== undefined))
    || (values.command === 'reopen' ? values['authorize-reopen'] !== true : values['authorize-reopen'] !== undefined)
    || (values['timeout-ms'] !== undefined && (!/^[1-9]\d*$/.test(values['timeout-ms']) || Number(values['timeout-ms']) < 100 || Number(values['timeout-ms']) > 60_000))) {
    throw new MaintenanceError('arguments_invalid_local_target_and_explicit_reopen_required')
  }
  return { command: values.command, systemId: values['expect-system-id'], revision: values['expect-revision'], timeout: Number(values['timeout-ms'] ?? 15_000) }
}

export function repositoryIdentity() {
  if (!/^project_id\s*=\s*"my-local"\s*$/m.test(readFileSync(new URL('supabase/config.toml', root), 'utf8'))) throw new MaintenanceError('repository_project_invalid')
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const app = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'))
  if (app.version !== lock.version || app.version !== lock.packages[''].version) throw new MaintenanceError('application_versions_mismatch')
  return { project: 'my-local', environment: 'local', branch: git(['branch', '--show-current']), head: git(['rev-parse', 'HEAD']),
    version: app.version, dirty: git(['status', '--porcelain']).length > 0 }
}

function requireExpected(command, identity, state) {
  if (command.systemId !== identity.system_id) throw new MaintenanceError('unexpected_postgresql_system')
  if (command.revision !== state.revision) throw new MaintenanceError('freeze_revision_changed')
}

export async function run(command, emit = () => undefined) {
  const repository = repositoryIdentity()
  const connection = operatorConnection()
  const { client, identity } = await connectOperator(connection, command.timeout)
  const common = { repository, identity, backup_authorized: false, global_closure: 'not_attested' }
  try {
    if (command.command === 'observe') return { ...common, state: await readFreeze(client), observation: await observe(client) }
    const contract = await verifyContract(client)
    if (command.command === 'preflight') return { ...common, state: await readFreeze(client), contract, observation: await observe(client) }
    if (command.systemId !== identity.system_id) throw new MaintenanceError('unexpected_postgresql_system')
    if (['close', 'reopen'].includes(command.command)) {
      const frozen = command.command === 'close'
      emit({ ...common, action: command.command, requested: true, recorded: 'unknown', verified: false })
      await client.query('begin')
      let provisional
      try {
        // Same transaction and ordering as PROD.2. CAS prevents stale consent reopening a newer closure.
        await client.query('select pg_advisory_xact_lock(771403)')
        requireExpected(command, identity, await readFreeze(client))
        await client.query('select private.set_business_write_freeze($1)::text', [frozen])
        provisional = await readFreeze(client)
        emit({ action: command.command, requested: true, recorded: 'provisional_before_commit', verified: false, state: provisional })
        await client.query('commit')
      } catch (error) { await client.query('rollback').catch(() => undefined); throw error }
      emit({ action: command.command, requested: true, recorded: 'commit_acknowledged', verified: false })
      // Fresh socket, not a statement in the setter's snapshot.
      const independent = await connectOperator(connection, command.timeout)
      try {
        const state = await readFreeze(independent.client)
        if (independent.identity.system_id !== identity.system_id || state.revision !== provisional.revision || state.frozen !== frozen) throw new MaintenanceError('committed_state_unverified')
        return { ...common, action: command.command, requested: true, recorded: 'committed', verified: true, state, contract,
          independent_read: true, next: frozen ? 'verify-closed_then_external_coordination' : 'verify-open_then_manual_Vercel_reopen' }
      } finally { await independent.client.end().catch(() => undefined) }
    }
    const frozen = command.command === 'verify-closed'
    await client.query('begin')
    try {
      // Hold off another operator toggle during this bounded observation/probe.
      await client.query('select pg_advisory_xact_lock_shared(771403)')
      const state = await readFreeze(client)
      requireExpected(command, identity, state)
      if (state.frozen !== frozen) throw new MaintenanceError('freeze_state_unexpected')
      const observation = await observe(client)
      if (observation.admission_locks.length || observation.prepared_transactions.count !== '0') throw new MaintenanceError('drainage_uncertain_inspect_observe')
      const probes = await probeOrdinary(connection, frozen, command.timeout)
      const after = await readFreeze(client)
      if (after.revision !== state.revision || after.frozen !== state.frozen) throw new MaintenanceError('freeze_state_changed')
      await client.query('commit')
      return { ...common, state, contract, observation, probes, ordinary_writes: frozen ? 'closed_and_drained' : 'open_zero_row_probe_verified',
        evidence_scope: 'Local_backend_only_at_observation', required_external_evidence: ['Vercel_authorized_HTTP',
          'privileged_writers_stopped_and_coordinated', 'Auth_internal_writes_and_consistent_backup_snapshot', 'Cloud_rehearsal_and_publication_prerequisites'] }
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error }
  } finally { await client.end().catch(() => undefined) }
}

export function safeDiagnostic(error) {
  if (error instanceof MaintenanceError) return error.message
  return ({ '42501': 'postgresql_permissions_insufficient', '57014': 'statement_timeout_state_unknown',
    '55P03': 'lock_timeout_state_unknown', '40P01': 'deadlock_state_unknown', 'PT503': 'freeze_state_unavailable',
    '28P01': 'postgresql_authentication_failed', 'ECONNREFUSED': 'local_service_unavailable' })[error?.code] ?? 'connection_or_command_failed_state_unknown'
}

export async function main(args = process.argv.slice(2)) {
  const emit = result => console.log(JSON.stringify(result))
  const interrupted = () => {
    emit({ outcome: 'interrupted', recorded: 'unknown', verified: false, backup_authorized: false,
      next: 'fresh_preflight_and_observe_required_no_automatic_reopen' })
    process.exit(130) // Close only this process's sockets; never terminate other backends.
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try { emit(await run(parseCommand(args), emit)) }
  catch (error) {
    emit({ outcome: 'unverified', diagnostic: safeDiagnostic(error), recorded: 'unknown', verified: false,
      backup_authorized: false, next: 'fresh_preflight_and_observe_required_no_automatic_reopen' })
    process.exitCode = 1
  } finally { process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted) }
}

if (import.meta.main) await main()
