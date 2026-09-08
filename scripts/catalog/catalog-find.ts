import { parseArgs } from 'node:util'
import { searchCatalog, tokenizeSearchQuery, CatalogSearchQueryError } from './search-catalog.ts'
import type { CatalogSearchResponse } from './search-catalog.ts'
import { loadCatalogSearchEntries, loadCatalogSearchExport, CatalogSearchReadError, CatalogSearchUnavailableError } from './search-catalog-db.ts'
import { catalogExportRows, findAllCatalogMatches, writeCatalogExport, CatalogExportWriteError } from './catalog-find-export.ts'

export const findUsage = 'Usage: npm run catalog:find -- "<recherche>" [--limit 20 | --export]'
export function parseFindArgs(args: string[]): { query: string; limit: number; export?: true } {
  try {
    const { values, positionals } = parseArgs({ args, options: { limit: { type: 'string' }, export: { type: 'boolean' } }, strict: true, allowPositionals: true })
    if (values.export && values.limit !== undefined) throw new CatalogSearchQueryError('--export contient tous les résultats et ne peut pas être combiné avec --limit.')
    if (positionals.length !== 1) throw new CatalogSearchQueryError(findUsage)
    const query = positionals[0]!, rawLimit = values.limit ?? '20'
    tokenizeSearchQuery(query)
    if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) throw new CatalogSearchQueryError(findUsage)
    return { query, limit: Number(rawLimit), ...(values.export ? { export: true as const } : {}) }
  } catch (error) {
    throw error instanceof CatalogSearchQueryError && error.message.startsWith('--export') ? error : new CatalogSearchQueryError(findUsage)
  }
}

export function findDisplayRows(response: CatalogSearchResponse) {
  return response.results.map(({ entry }) => ({
    Card: entry.card, Nom: entry.name ?? '—',
    Pokémon: entry.pokemon.map((pokemon) => pokemon.name ?? `#${pokemon.dexNumber}`).join(', ') || '—',
    Set: entry.set.name ?? entry.set.tcgdexId,
    'N°': entry.set.officialCardCount === null ? entry.localId : `${entry.localId}/${entry.set.officialCardCount}`,
    Variantes: entry.variantCount,
    ...(response.results.some(({ entry }) => !entry.isActive) ? { État: entry.isActive ? 'active' : 'inactive' } : {}),
  }))
}

export async function runCatalogFind(args: string[]): Promise<number> {
  try {
    const { query, limit, export: exporting } = parseFindArgs(args)
    if (exporting) {
      const { response, variants } = await loadCatalogSearchExport((entries) => findAllCatalogMatches(entries, query))
      const rows = catalogExportRows(response, variants)
      if (!response.total) console.log(`Aucun résultat pour ${JSON.stringify(query.trim())}. Aucun CSV écrit ; un ancien export éventuel est conservé.`)
      else {
        const file = writeCatalogExport(query, rows)
        console.log(`${response.total} carte${response.total === 1 ? '' : 's'} trouvée${response.total === 1 ? '' : 's'} ; ${rows.length} variante${rows.length === 1 ? '' : 's'} exportée${rows.length === 1 ? '' : 's'} — catalogue LOCAL.`)
        console.log(file ? `CSV : ${file}` : 'Aucune variante standard à exporter ; aucun CSV écrit.')
      }
      return 0
    }
    const result = searchCatalog(await loadCatalogSearchEntries(), query, { limit })
    if (!result.total) console.log(`Aucun résultat pour ${JSON.stringify(query.trim())}.`)
    else {
      console.log(`Résultats pour ${JSON.stringify(query.trim())} — catalogue LOCAL`)
      console.table(findDisplayRows(result))
      const plural = result.results.length === 1 ? '' : 's'
      console.log(`${result.results.length} résultat${plural} affiché${plural} sur ${result.total}.`)
    }
    return 0
  } catch (error) {
    // Never expose a driver/CLI message, environment value, stack or connection string.
    console.error(error instanceof CatalogSearchQueryError || error instanceof CatalogSearchUnavailableError || error instanceof CatalogSearchReadError || error instanceof CatalogExportWriteError
      ? error.message : 'Recherche du catalogue local impossible. Vérifie Supabase local et sa configuration.')
    return 1
  }
}

if (import.meta.main) process.exitCode = await runCatalogFind(process.argv.slice(2))
