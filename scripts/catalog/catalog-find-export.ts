import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeSearchText, searchCatalog } from './search-catalog.ts'
import type { CatalogSearchEntry, CatalogSearchResponse } from './search-catalog.ts'

export interface CatalogExportVariant {
  cardId: string; label: string | null; date: string | null; dateOrigin: string; key: string
}
export const exportColumns = ['Card', 'Nom', 'Set', 'N°', 'Variante', 'Date', 'Origine date', 'Variant Key'] as const
export type CatalogExportRow = Record<typeof exportColumns[number], string>

/** Exhaust the existing engine's pages without copying any matching or ordering rule. */
export function findAllCatalogMatches(entries: readonly CatalogSearchEntry[], query: string): CatalogSearchResponse {
  let remaining = entries
  const response = searchCatalog(remaining, query, { limit: 100 })
  let page = response.results
  while (response.results.length < response.total) {
    const selected = new Set(page.map(({ entry }) => entry.id))
    remaining = remaining.filter((entry) => !selected.has(entry.id))
    page = searchCatalog(remaining, query, { limit: 100 }).results
    if (!page.length) throw new Error('Incomplete catalogue search export')
    response.results.push(...page)
  }
  return response
}

export function catalogExportRows(response: CatalogSearchResponse, variants: readonly CatalogExportVariant[]): CatalogExportRow[] {
  const byCard = new Map<string, CatalogExportVariant[]>()
  for (const variant of variants) {
    const group = byCard.get(variant.cardId) ?? []
    group.push(variant); byCard.set(variant.cardId, group)
  }
  return response.results.flatMap(({ entry }) => (byCard.get(entry.id) ?? []).map((variant) => ({
    Card: entry.card, Nom: entry.name ?? '', Set: entry.set.name ?? entry.set.tcgdexId,
    'N°': entry.set.officialCardCount === null ? entry.localId : `${entry.localId}/${entry.set.officialCardCount}`,
    Variante: variant.label ?? '', Date: variant.date ?? '', 'Origine date': variant.dateOrigin, 'Variant Key': variant.key,
  })))
}

/** Semicolon CSV for French spreadsheets; every cell is quoted, including embedded CR/LF. */
export function encodeCatalogCsv(rows: readonly CatalogExportRow[]): string {
  const encode = (values: readonly string[]): string => values.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')
  return '\uFEFF' + [encode(exportColumns), ...rows.map((row) => encode(exportColumns.map((column) => row[column])))].join('\r\n') + '\r\n'
}

export function catalogExportPath(query: string): string {
  const normalized = normalizeSearchText(query)
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70).replace(/-$/, '') || 'recherche'
  const suffix = createHash('sha256').update(normalized).digest('hex').slice(0, 10)
  return path.resolve('.cache/catalog-exports', `catalog-find-${slug}-${suffix}.csv`)
}

export class CatalogExportWriteError extends Error {
  constructor() { super("Écriture du CSV local impossible. Vérifie les droits du dossier .cache/catalog-exports et ferme le fichier dans Excel/LibreOffice s'il est ouvert.") }
}

export function writeCatalogExport(query: string, rows: readonly CatalogExportRow[]): string | null {
  if (!rows.length) return null
  const file = catalogExportPath(query), temporary = `${file}.${randomUUID()}.tmp`
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(temporary, encodeCatalogCsv(rows), { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, file)
    return file
  } catch { throw new CatalogExportWriteError() }
  finally { rmSync(temporary, { force: true }) }
}
