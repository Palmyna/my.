import { parseArgs } from 'node:util'
import { createVercelMaintenance, operatorLockPath, readTarget, requireVercel, unknownResult } from './vercel.js'
import { repositoryIdentity } from './cli.js'

export function parseCommand(args) {
  let v
  try {
    v = parseArgs({ args, strict: true, allowPositionals: false, options: {
      command: { type: 'string' }, environment: { type: 'string' }, project: { type: 'string' }, target: { type: 'string' },
      'authorize-vercel-connect': { type: 'boolean' }, 'authorize-close': { type: 'boolean' },
      'authorize-reopen': { type: 'boolean' }, 'confirm-exclusive-writer': { type: 'boolean' },
      'expect-checkpoint': { type: 'string' }, 'timeout-ms': { type: 'string' },
    } }).values
  } catch { requireVercel(false, 'arguments_invalid') }
  const names = args.filter(a => a.startsWith('--')).map(a => a.split('=')[0])
  const write = ['close', 'reopen'].includes(v.command)
  requireVercel(new Set(names).size === names.length && ['preflight', 'close', 'reopen'].includes(v.command)
    && v.environment === 'production' && v.project === 'my' && !!v.target && v['authorize-vercel-connect'] === true
    && (write ? /^[a-f0-9]{64}$/.test(v['expect-checkpoint'] ?? '') && v['confirm-exclusive-writer'] === true
      : v['expect-checkpoint'] === undefined && v['confirm-exclusive-writer'] === undefined)
    && (v.command === 'close' ? v['authorize-close'] === true : v['authorize-close'] === undefined)
    && (v.command === 'reopen' ? v['authorize-reopen'] === true : v['authorize-reopen'] === undefined)
    && (v['timeout-ms'] === undefined || /^[1-9]\d*$/.test(v['timeout-ms'])
      && Number(v['timeout-ms']) >= 100 && Number(v['timeout-ms']) <= 60_000), 'arguments_invalid')
  return { command: v.command, target: v.target, timeout: Number(v['timeout-ms'] ?? 15_000),
    authorizeConnect: true, checkpoint: v['expect-checkpoint'], exclusiveWriter: v['confirm-exclusive-writer'] === true,
    authorizeClose: v['authorize-close'] === true, authorizeReopen: v['authorize-reopen'] === true }
}

export async function run(command, emit = () => undefined) {
  // Consume before Git/subprocesses; never load Vercel CLI auth files or GLOBAL_CONFIG.
  const token = process.env.MY_VERCEL_MAINTENANCE_TOKEN
  delete process.env.MY_VERCEL_MAINTENANCE_TOKEN
  const target = readTarget(command.target)
  const operator = createVercelMaintenance(target, token, command)
  const repository = repositoryIdentity('production', 'my')
  const result = command.command === 'preflight' ? await operator.preflight()
    : await operator.setMaintenance(command.command, command, emit)
  return { repository, operator_lock_path: operatorLockPath(target), ...result }
}

export async function main(args = process.argv.slice(2)) {
  const emit = result => console.log(JSON.stringify(result))
  const interrupted = () => {
    emit({ ...unknownResult(new Error()), outcome: 'interrupted', diagnostic: 'interrupted_state_unknown' })
    process.exit(130) // Deliberately leave any write marker; never mutate remotely on exit.
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try {
    const result = await run(parseCommand(args), emit)
    emit(result)
    if (!result.verified) process.exitCode = 1
  } catch (error) { emit(unknownResult(error)); process.exitCode = 1 }
  finally {
    delete process.env.MY_VERCEL_MAINTENANCE_TOKEN
    process.off('SIGINT', interrupted)
    process.off('SIGTERM', interrupted)
  }
}
if (import.meta.main) await main()
