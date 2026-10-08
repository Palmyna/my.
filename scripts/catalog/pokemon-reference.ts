import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { dex, hash } from './model.ts'
import { POKEMON_TYPES } from '../../src/types/pokemon.ts'

export const pokemonReferencePath = path.resolve(import.meta.dirname, '../../data/pokemon/pokemon-reference.json')
// Validate without trimming or normalizing the source typography.
export const pokemonName = z.string().refine((value) => value.trim().length > 0 && !/\p{Cc}/u.test(value), 'Invalid French species name')
const dexKey = z.string().regex(/^[1-9][0-9]*$/).refine((value) => dex.safeParse(Number(value)).success, 'Invalid national dex number')
export const pokemonTypes = z.array(z.enum(POKEMON_TYPES)).min(1).max(2).refine(value => new Set(value).size === value.length, 'Duplicate Pokemon type')
const entrySchema = z.strictObject({ name_fr: pokemonName, types: pokemonTypes })
const mappingSchema = z.record(dexKey, entrySchema).refine((value) => Object.keys(value).length > 0, 'Empty Pokemon reference')
export type PokemonReferenceEntry = z.infer<typeof entrySchema>
export interface PokemonReference { entries: Readonly<Record<string, PokemonReferenceEntry>>; hash: string; count: number }

export function parsePokemonReference(contents: string): PokemonReference {
  const entries = mappingSchema.parse(JSON.parse(contents))
  // JSON.parse alone silently accepts repeated keys, including equivalent Unicode escapes.
  const document = ts.parseJsonText('pokemon-reference.json', contents)
  const statement = document.statements[0]
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isObjectLiteralExpression(statement.expression))
    throw new Error('Expected a Pokemon reference object')
  function checkKeys(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set<string>()
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) throw new Error('Invalid Pokemon reference key')
        const key = property.name.text
        if (keys.has(key)) throw new Error(`Duplicate Pokemon reference key: ${key}`)
        keys.add(key)
      }
    }
    ts.forEachChild(node, checkKeys)
  }
  checkKeys(statement.expression)
  return { entries: Object.freeze(entries), hash: hash(entries), count: Object.keys(entries).length }
}

export function serializePokemonReference(entries: Record<string, PokemonReferenceEntry>): string {
  const valid = mappingSchema.parse(entries)
  return `{\n${Object.keys(valid).sort((a, b) => Number(a) - Number(b))
    .map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(valid[key])}`).join(',\n')}\n}\n`
}

export const loadPokemonReference = (file = pokemonReferencePath): PokemonReference => parsePokemonReference(readFileSync(file, 'utf8'))
export const pokemonFor = (reference: PokemonReference, number: number): PokemonReferenceEntry | null => reference.entries[String(number)] ?? null
