import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { dex, hash } from './model.ts'

export const pokemonReferencePath = path.resolve(import.meta.dirname, '../../data/pokemon/pokemon-fr.json')
// Validate without trimming or normalizing the source typography.
export const pokemonName = z.string().refine((value) => value.trim().length > 0, 'Empty French species name')
const dexKey = z.string().regex(/^[1-9][0-9]*$/).refine((value) => dex.safeParse(Number(value)).success, 'Invalid national dex number')
const mappingSchema = z.record(dexKey, pokemonName).refine((value) => Object.keys(value).length > 0, 'Empty Pokemon reference')
export interface PokemonReference { names: Readonly<Record<string, string>>; hash: string; count: number }

export function parsePokemonReference(contents: string): PokemonReference {
  const names = mappingSchema.parse(JSON.parse(contents))
  // JSON.parse alone silently accepts repeated keys, including equivalent Unicode escapes.
  const document = ts.parseJsonText('pokemon-fr.json', contents)
  const statement = document.statements[0]
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isObjectLiteralExpression(statement.expression))
    throw new Error('Expected a flat Pokemon reference object')
  const keys = new Set<string>()
  for (const property of statement.expression.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) throw new Error('Invalid Pokemon reference key')
    const key = property.name.text
    if (keys.has(key)) throw new Error(`Duplicate national dex number: ${key}`)
    keys.add(key)
  }
  return { names: Object.freeze(names), hash: hash(names), count: keys.size }
}

export function serializePokemonReference(names: Record<string, string>): string {
  const valid = mappingSchema.parse(names)
  return `{\n${Object.keys(valid).sort((a, b) => Number(a) - Number(b))
    .map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(valid[key])}`).join(',\n')}\n}\n`
}

export const loadPokemonReference = (file = pokemonReferencePath): PokemonReference => parsePokemonReference(readFileSync(file, 'utf8'))
export const pokemonNameFor = (reference: PokemonReference, number: number): string | null => reference.names[String(number)] ?? null
