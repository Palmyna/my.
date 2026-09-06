import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Snapshot } from './model.ts'

export const repository = 'https://github.com/tcgdex/cards-database'
export const cacheDirectory = path.resolve('.cache/tcgdex')
function git(args: string[], directory?: string): string {
  return execFileSync('git', args, { ...(directory ? { cwd: directory } : {}), encoding: 'utf8', windowsHide: true,
    timeout: 180_000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
export function lockCache(): () => void {
  mkdirSync(cacheDirectory, { recursive: true })
  const lock = path.join(cacheDirectory, 'pipeline.lock')
  let handle: number
  try { handle = openSync(lock, 'wx') } catch { throw new Error('Catalogue cache is locked. Check for another run; remove a stale .cache/tcgdex/pipeline.lock only after checking its process.') }
  return () => { closeSync(handle); unlinkSync(lock) }
}
export function snapshot(requested?: string): Snapshot {
  if (requested && !/^[a-f0-9]{40}$/.test(requested)) throw new Error('--snapshot requires a full lowercase 40-character SHA')
  const directory = path.join(cacheDirectory, 'cards-database')
  if (!existsSync(path.join(directory, '.git'))) git(['clone', '--depth', '1', `${repository}.git`, directory])
  const origin = git(['remote', 'get-url', 'origin'], directory).replace(/\.git$/, '')
  if (origin !== repository) throw new Error('Unexpected snapshot origin')
  if (git(['status', '--porcelain', '--untracked-files=all'], directory)) throw new Error('Snapshot cache contains local changes; use a clean cache')
  let sha = requested
  if (!sha) {
    git(['fetch', '--depth', '1', 'origin', 'HEAD'], directory)
    sha = git(['rev-parse', 'FETCH_HEAD'], directory)
  } else {
    try { git(['cat-file', '-e', `${sha}^{commit}`], directory) }
    catch { git(['fetch', '--depth', '1', 'origin', sha], directory) }
  }
  git(['checkout', '--detach', sha], directory)
  if (git(['rev-parse', 'HEAD'], directory) !== sha) throw new Error('Snapshot SHA mismatch')
  return { repository, sha, committedAt: git(['show', '-s', '--format=%cI', sha], directory), directory }
}
