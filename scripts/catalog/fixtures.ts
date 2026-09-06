import { normalize } from './normalize.ts'
import type { Catalogue } from './model.ts'
import type { Source } from './reader.ts'
import type { State } from './database.ts'
import { tables } from './database.ts'

export function fixtureSource(): Source {
  const serie = { id: 'fixture-series', name: { fr: 'Série synthétique', en: 'Synthetic series' } }
  const set = { id: 'fixture-set', name: { fr: 'Set synthétique' }, serie, cardCount: { official: 3 }, releaseDate: { fr: '2020-02-29', en: '2020-01-01' } }
  return { series: [serie], sets: [set], pocket: 0, translations: {}, cards: [
    { localId: '10', set, name: { fr: 'Carte multi Pokémon' }, category: 'Pokemon', dexId: [25, 644], cameoDexIds: [1],
      variants: [{ type: 'normal' }, { type: 'reverse', languages: ['en'] }, { type: 'holo', stamp: ['staff', 'pre-release'], foil: 'cosmos', languages: ['fr'] }, { type: 'holo', size: 'jumbo' }] },
    { localId: '2A', set, name: { fr: 'Dresseur' }, category: 'Trainer', variants: { normal: true, reverse: true } },
  ] }
}
export const fixture = (): Catalogue => normalize(fixtureSource())
export function emptyState(): State {
  return { rows: { pokemon: [], tcg_series: [], tcg_sets: [], source_cards: [], catalog_variants: [], automatic_target_states: [] },
    next: Object.fromEntries(tables.map((table) => [table, 1n])) as State['next'], mappings: [], aliases: [] }
}
