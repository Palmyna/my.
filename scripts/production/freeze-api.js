import { parseCommand, run } from '../maintenance/cli.js'
import { requireProduction } from './config.js'

// Same AUTO.1 command parser, transaction/barrier, revision CAS and independent
// socket as the manual operator command. Its password channel is consumed
// before repositoryIdentity spawns Git.
export async function productionFreeze(bundle, password, command, revision, { authorizeReopen = false } = {}) {
  requireProduction(['preflight', 'close', 'verify-closed', 'reopen', 'verify-open'].includes(command), 'freeze_command_invalid')
  requireProduction(command !== 'reopen' || authorizeReopen === true, 'freeze_reopen_authorization_required')
  const args = ['--command', command, '--environment', 'cloud', '--project', bundle.config.project,
    '--target', bundle.config.maintenance_target, '--authorize-cloud-connect']
  if (revision !== undefined) args.push('--expect-revision', revision, '--expect-system-id', bundle.target.system_id)
  if (command === 'close') args.push('--authorize-close')
  if (command === 'reopen') args.push('--authorize-reopen')
  requireProduction(!process.env.MY_MAINTENANCE_DATABASE_PASSWORD, 'inherited_freeze_secret_refused')
  process.env.MY_MAINTENANCE_DATABASE_PASSWORD = password
  try { return await run(parseCommand(args)) }
  finally { delete process.env.MY_MAINTENANCE_DATABASE_PASSWORD }
}
