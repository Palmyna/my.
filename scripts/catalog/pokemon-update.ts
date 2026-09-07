import { mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { dex } from './model.ts'
import { parsePokemonReference, pokemonName, pokemonReferencePath, serializePokemonReference } from './pokemon-reference.ts'

const endpoint = 'https://pokeapi.co/api/v2/pokemon-species/'
const concurrency = 6, attempts = 3, timeoutMs = 15_000
const pageSchema = z.object({ count: dex, next: z.string().nullable(), results: z.array(z.object({ url: z.string() })) })
const speciesSchema = z.object({ id: dex, names: z.array(z.object({ name: z.string(), language: z.object({ name: z.string() }) })) })
interface Options { fetch?: typeof fetch; sleep?: (ms: number) => Promise<unknown>; progress?: (message: string) => void }
class TransientHttpError extends Error { retryAfterMs = 0 }

function checkPageUrl(value: string): string {
  const url = new URL(value)
  if (`${url.origin}${url.pathname}` !== endpoint || url.username || url.password || url.hash
    || [...url.searchParams].some(([key, item]) => !['offset', 'limit'].includes(key) || !/^[0-9]+$/.test(item)))
    throw new Error('Unexpected Pokemon species pagination URL')
  return url.href
}
function resourceId(value: string): number {
  if (!value.startsWith(endpoint) || !/^[1-9][0-9]*\/$/.test(value.slice(endpoint.length)))
    throw new Error('Unexpected Pokemon species resource URL')
  return dex.parse(Number(value.slice(endpoint.length, -1)))
}

async function getJson(url: string, options: Options): Promise<unknown> {
  const request = options.fetch ?? fetch, sleep = options.sleep ?? delay
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) {
        await response.body?.cancel()
        const message = `PokéAPI HTTP ${response.status}: ${url}`
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          const error = new TransientHttpError(message), retry = response.headers.get('retry-after')
          error.retryAfterMs = retry === null ? 0 : Math.max(0, Math.min(30_000,
            /^[0-9]+$/.test(retry) ? Number(retry) * 1000 : (Date.parse(retry) - Date.now()) || 0))
          throw error
        }
        throw new Error(message)
      }
      return await response.json()
    } catch (error) {
      const transient = error instanceof TransientHttpError || error instanceof TypeError
        || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      if (!transient || attempt === attempts - 1) throw error
      await sleep(Math.max(500 * 2 ** attempt, error instanceof TransientHttpError ? error.retryAfterMs : 0))
    }
  }
  throw new Error('PokéAPI retry limit reached')
}

/** Manual maintenance only. No database access; the catalogue never imports this module. */
export async function updatePokemonReference(file = pokemonReferencePath, options: Options = {}) {
  const progress = options.progress ?? (() => undefined), visited = new Set<string>(), ids = new Set<number>()
  let next: string | null = `${endpoint}?limit=200`, count: number | undefined
  while (next !== null) {
    const url = checkPageUrl(next)
    if (visited.has(url)) throw new Error('Repeated PokéAPI pagination page')
    visited.add(url)
    const page = pageSchema.parse(await getJson(url, options))
    count ??= page.count
    if (count !== page.count) throw new Error('PokéAPI species count changed during pagination')
    for (const item of page.results) {
      const id = resourceId(item.url)
      if (ids.has(id)) throw new Error(`Duplicate PokéAPI species: ${id}`)
      ids.add(id)
    }
    if (!page.results.length || ids.size > count || (ids.size === count && page.next !== null))
      throw new Error('Inconsistent PokéAPI pagination')
    next = page.next
  }
  if (ids.size !== count) throw new Error(`Incomplete species list: ${ids.size}/${count}`)
  const ordered = [...ids].sort((a, b) => a - b), names: Record<string, string> = {}, missing: number[] = []
  progress(`${count} espèces découvertes ; lecture des noms français (${concurrency} requêtes maximum).`)
  let cursor = 0, completed = 0, failed = false
  const workers = Array.from({ length: Math.min(concurrency, ordered.length) }, async () => {
    while (!failed) {
      const id = ordered[cursor++]
      if (id === undefined) return
      try {
        const species = speciesSchema.parse(await getJson(`${endpoint}${id}/`, options))
        if (species.id !== id) throw new Error(`PokéAPI species ID mismatch: requested ${id}, received ${species.id}`)
        const french = species.names.filter((entry) => entry.language.name === 'fr')
        if (french.length > 1) throw new Error(`Duplicate French name for species ${id}`)
        if (!french.length || !pokemonName.safeParse(french[0]?.name).success) missing.push(id)
        else names[String(species.id)] = french[0]!.name
        completed++
        if (completed % 100 === 0 || completed === count) progress(`${completed}/${count} espèces lues.`)
      } catch (error) { failed = true; throw error }
    }
  })
  // Settle every in-flight request before returning a failure; never publish a partial generation.
  const results = await Promise.allSettled(workers)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  const summary = { discovered: count, with_fr: Object.keys(names).length, without_fr: missing.length,
    min_dex: ordered[0]!, max_dex: ordered.at(-1)! }
  progress(JSON.stringify(summary))
  if (missing.length) throw new Error(`Missing French species names (${missing.length}): ${missing.sort((a, b) => a - b).join(', ')}`)
  const contents = serializePokemonReference(names), reference = parsePokemonReference(contents)
  // Same-directory rename is the publication point. An unsuccessful generation leaves the old file intact.
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx')
    try { await handle.writeFile(contents, 'utf8'); await handle.sync() } finally { await handle.close() }
    await rename(temporary, file)
  } finally { await unlink(temporary).catch((error: unknown) => { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }) }
  return { ...summary, hash: reference.hash, file }
}

if (import.meta.main) {
  await updatePokemonReference(pokemonReferencePath, { progress: console.log }).then((result) => console.log('Référentiel publié :', result))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Pokemon reference update failed'); process.exitCode = 1 })
}
