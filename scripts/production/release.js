import { execFileSync } from 'node:child_process'
import { readFileSync, lstatSync, realpathSync } from 'node:fs'
import { join, dirname, parse, resolve } from 'node:path'
import { publicationSchema, publicationHash } from '../notifications/contract.ts'
import { notificationInstant } from '../../src/lib/notification-scalars.ts'
import { hashBytes } from '../backup/secure-files.js'
import { root } from '../backup/contract.js'
import { requireProduction } from './config.js'

const sha = /^[a-f0-9]{40}$/
export const githubRepository = 'Palmyna/my.'

export function prepareChangelog(bytes, version, file, now = Date.now()) {
  requireProduction(bytes.length <= 1_048_576, 'changelog_invalid')
  let value
  try { value = publicationSchema.parse(JSON.parse(bytes.toString('utf8'))) }
  catch { requireProduction(false, 'changelog_invalid') }
  requireProduction(value.category === 'changelog' && value.app_version === version, 'changelog_version_or_category_mismatch')
  requireProduction(value.expires_at === null || notificationInstant(value.expires_at) > BigInt(now) * 1000n,
    'changelog_expired')
  return { file, file_sha256: hashBytes(bytes), publication_key: value.publication_key,
    content_hash: publicationHash(value), app_version: value.app_version, category: value.category,
    include_new_users: value.include_new_users, expires_at: value.expires_at }
}

// Immutable Git objects, never fetch/checkout/merge. Missing objects fail closed.
// A previous classic main merge need not be an ancestor of dev: its tree can
// equal their common base. Unexpected main-only edits/conflict edits still fail.
export function inspectRelease(source, merge, directory = root) {
  requireProduction(sha.test(source) && sha.test(merge), 'git_commit_invalid')
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', timeout: 15_000,
    maxBuffer: 4_194_304, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  requireProduction(git(['remote', 'get-url', 'origin']).match(/^https:\/\/github\.com\/Palmyna\/my\.(?:\.git)?\/?$|^git@github\.com:Palmyna\/my\.(?:\.git)?$/i), 'git_repository_unexpected')
  requireProduction(git(['rev-parse', '--is-shallow-repository']) === 'false', 'git_history_incomplete')
  const parents = git(['show', '-s', '--format=%P', merge]).split(' ')
  requireProduction(parents.length === 2 && parents[1] === source, 'git_merge_source_unexpected')
  const base = git(['merge-base', parents[0], source])
  requireProduction(base === parents[0] || git(['rev-parse', `${base}^{tree}`]) === git(['rev-parse', `${parents[0]}^{tree}`]),
    'git_main_changes_not_in_source')
  const tree = git(['rev-parse', `${source}^{tree}`])
  requireProduction(git(['rev-parse', `${merge}^{tree}`]) === tree, 'git_production_tree_unexpected')
  const blob = file => execFileSync('git', ['show', `${source}:${file}`], { cwd: directory, timeout: 15_000,
    maxBuffer: 4_194_304, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const app = JSON.parse(blob('package.json')), lock = JSON.parse(blob('package-lock.json'))
  requireProduction(app.version === lock.version && app.version === lock.packages[''].version, 'git_release_versions_mismatch')
  // Version becomes part of a filename only after the existing SemVer contract.
  requireProduction(typeof app.version === 'string' && /^[0-9A-Za-z.+-]{1,64}$/.test(app.version), 'git_release_version_invalid')
  const file = `scripts/notifications/releases/${app.version}.json`
  let bytes
  try { bytes = blob(file) } catch { requireProduction(false, 'changelog_committed_file_missing') }
  const changelog = prepareChangelog(bytes, app.version, file)
  const actual = join(directory, file)
  requireProduction(realpathSync(actual) === resolve(actual), 'changelog_reparse_path_refused')
  for (let part = actual; part !== parse(part).root; part = dirname(part)) {
    requireProduction(!lstatSync(part).isSymbolicLink(), 'changelog_reparse_path_refused')
  }
  requireProduction(lstatSync(actual).isFile() && lstatSync(actual).size <= 1_048_576
    && hashBytes(readFileSync(actual)) === changelog.file_sha256, 'changelog_worktree_differs_from_release')
  const files = git(['ls-tree', '-r', '--name-only', source, '--', 'supabase/migrations']).split('\n')
  const migrations = files.map(file => {
    const match = /^supabase\/migrations\/(\d{14})_(.+)\.sql$/.exec(file)
    requireProduction(match, 'git_migration_filename_invalid')
    return { version: match[1], name: match[2], sha256: hashBytes(blob(file)) }
  }).sort((a, b) => a.version.localeCompare(b.version))
  requireProduction(migrations.length > 0 && new Set(migrations.map(m => m.version)).size === migrations.length, 'git_migrations_ambiguous')
  return { source, merge, previous_main: parents[0], tree, version: app.version, migrations, changelog }
}

// Only two fixed GET endpoints; no supplier response/error reaches a report.
export function githubReader(token, { signal, fetchImpl = globalThis.fetch } = {}) {
  requireProduction(token === undefined || (typeof token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(token)), 'github_token_invalid')
  return async pullRequest => {
    requireProduction(Number.isSafeInteger(pullRequest) && pullRequest > 0, 'github_pull_request_invalid')
    requireProduction(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'unsafe_tls_environment')
    const read = async path => {
      const response = await fetchImpl(`https://api.github.com/repos/${githubRepository}/${path}`, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      requireProduction(response.status === 200 && response.headers.get('content-type')?.includes('application/json'), 'github_read_unavailable')
      const chunks = [], reader = response.body.getReader()
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          requireProduction(size <= 2_097_152, 'github_read_unavailable')
          chunks.push(value)
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } finally { await reader.cancel().catch(() => undefined) }
    }
    const main = await read('git/ref/heads/main'), pr = await read(`pulls/${pullRequest}`)
    requireProduction(main.ref === 'refs/heads/main' && main.object?.type === 'commit' && sha.test(main.object.sha)
      && pr.number === pullRequest && pr.merged === true && pr.state === 'closed' && sha.test(pr.merge_commit_sha)
      && pr.base?.ref === 'main' && pr.head?.ref === 'dev'
      && pr.base.repo?.full_name === githubRepository && pr.head.repo?.full_name === githubRepository
      && sha.test(pr.head.sha), 'github_publication_contradictory')
    return { repository: githubRepository, main: main.object.sha, merge: pr.merge_commit_sha,
      source: pr.head.sha, pull_request: pullRequest, observed_at: new Date().toISOString() }
  }
}
