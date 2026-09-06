import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { compare, text } from './model.ts'
import type { Diagnostic } from './model.ts'

type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal }
const fields = new Set(['id', 'name', 'serie', 'set', 'cardCount', 'abbreviations', 'releaseDate',
  'category', 'rarity', 'dexId', 'cameoDexIds', 'variants'])

/** Read data literals only. Never execute TypeScript obtained from the upstream repository. */
export class LiteralReader {
  private readonly cache = new Map<string, Literal>()
  private readonly reading = new Set<string>()
  private readonly root: string
  constructor(directory: string) { this.root = realpathSync(directory) }

  read(file: string, keep = true): Literal {
    const resolved = realpathSync(file)
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error(`Import outside snapshot data: ${file}`)
    const cached = this.cache.get(resolved)
    if (cached !== undefined) return cached
    if (this.reading.has(resolved)) throw new Error(`Circular data import: ${file}`)
    this.reading.add(resolved)
    try {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      if ('parseDiagnostics' in source && Array.isArray(source.parseDiagnostics) && source.parseDiagnostics.length) {
        throw new Error(`Invalid TypeScript syntax: ${file}`)
      }
      const declarations = new Map<string, ts.Expression>()
      const imports = new Map<string, string>()
      let exported: ts.Expression | undefined
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && statement.importClause?.name && ts.isStringLiteral(statement.moduleSpecifier)) {
          const specifier = statement.moduleSpecifier.text
          if (!specifier.startsWith('.')) throw new Error(`Nonlocal data import: ${file}`)
          imports.set(statement.importClause.name.text, path.resolve(path.dirname(file), `${specifier.replace(/\.ts$/, '')}.ts`))
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.initializer) declarations.set(declaration.name.text, declaration.initializer)
          }
        } else if (ts.isExportAssignment(statement)) exported = statement.expression
      }
      const evaluate = (node: ts.Expression, root = false): Literal => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
        if (ts.isNumericLiteral(node)) return Number(node.text)
        if (node.kind === ts.SyntaxKind.TrueKeyword) return true
        if (node.kind === ts.SyntaxKind.FalseKeyword) return false
        if (node.kind === ts.SyntaxKind.NullKeyword) return null
        if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return evaluate(node.expression, root)
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text)
        if (ts.isIdentifier(node)) {
          const imported = imports.get(node.text)
          if (imported) return this.read(imported)
          const declared = declarations.get(node.text)
          if (declared && declared !== node) return evaluate(declared, root)
          throw new Error(`Unsupported identifier ${node.text}: ${file}`)
        }
        if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => evaluate(element))
        if (ts.isObjectLiteralExpression(node)) {
          const result: Record<string, Literal> = Object.create(null) as Record<string, Literal>
          for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) throw new Error(`Unsupported object syntax: ${file}`)
            const key = property.name.text
            if (root && !fields.has(key)) continue
            if (key in result) throw new Error(`Duplicate data field ${key}: ${file}`)
            result[key] = evaluate(property.initializer)
          }
          return result
        }
        throw new Error(`Unsupported data expression ${ts.SyntaxKind[node.kind]}: ${file}`)
      }
      if (!exported) throw new Error(`Missing default data export: ${file}`)
      const result = evaluate(exported, true)
      if (keep) this.cache.set(resolved, result)
      return result
    } finally { this.reading.delete(resolved) }
  }
}

const names = z.record(z.string(), z.string())
const rawSeries = z.object({ id: text, name: names })
const rawSet = z.object({ id: text, name: names, serie: rawSeries,
  cardCount: z.object({ official: z.number().int().nonnegative() }),
  abbreviations: names.optional(), releaseDate: z.union([z.string(), names]).optional(),
})
const rawCard = z.object({ name: names, set: rawSet, category: z.string().optional(), rarity: z.string().optional(),
  dexId: z.array(z.number()).optional(), cameoDexIds: z.array(z.number()).optional(), variants: z.unknown().optional(),
  releaseDate: z.union([z.string(), names]).optional(),
})
export type RawSeries = z.infer<typeof rawSeries>
export type RawSet = z.infer<typeof rawSet>
export type RawCard = z.infer<typeof rawCard> & { localId: string }
export interface Source { series: RawSeries[]; sets: RawSet[]; cards: RawCard[]; translations: Record<string, Record<string, string>>; pocket: number; diagnostics?: Diagnostic[] }

function files(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(directory, entry.name)).sort(compare)
}
export function readSource(directory: string): Source {
  const data = path.join(directory, 'data')
  const reader = new LiteralReader(data)
  const translations = z.record(z.string(), z.string())
  const result: Source = { series: [], sets: [], cards: [], translations: z.object({ category: translations, rarity: translations,
    variantType: translations, variantSize: translations, variantFoil: translations, variantStamp: translations, variantSubtype: translations })
    .parse(JSON.parse(readFileSync(path.join(directory, 'meta/translations/fr.json'), 'utf8'))), pocket: 0, diagnostics: [] }
  const selectedSets = new Map<string, RawSet>()
  const selectedSeries = new Map<string, RawSeries>()
  for (const seriesFile of files(data)) {
    const serie = rawSeries.parse(reader.read(seriesFile))
    const seriesDirectory = seriesFile.slice(0, -3)
    for (const setFile of files(seriesDirectory)) {
      const set = rawSet.parse(reader.read(setFile))
      if (set.serie.id !== serie.id) throw new Error(`Set/series path mismatch: ${setFile}`)
      if (serie.id !== 'tcgp' && set.name.fr) { selectedSets.set(set.id, set); selectedSeries.set(serie.id, serie) }
      for (const cardFile of files(setFile.slice(0, -3))) {
        const card = rawCard.parse(reader.read(cardFile, false))
        if (!card.name.fr?.trim()) continue
        if (serie.id === 'tcgp') { result.pocket++; continue }
        if (card.set.id !== set.id) result.diagnostics?.push({ code: 'set-path-mismatch', target: cardFile,
          detail: `The explicit set reference ${card.set.id} takes precedence over the folder ${set.id}.` })
        selectedSets.set(card.set.id, card.set); selectedSeries.set(card.set.serie.id, card.set.serie)
        result.cards.push({ ...card, localId: path.basename(cardFile, '.ts') })
      }
    }
  }
  result.sets = [...selectedSets.values()]
  result.series = [...selectedSeries.values()]
  return result
}
