import { canonical, compare, hash, unique } from './model.ts'
import type { Catalogue, Card } from './model.ts'
import { tables } from './database.ts'
import type { Row, State, Table } from './database.ts'
import type { Override } from './overrides.ts'
import { normalizeProperties, variantKey } from './variants.ts'

export interface Diff { created: number; modified: number; reactivated: number; disappeared: number; deactivated: number; unchanged: number }
export interface Plan {
  rows: Record<Table, Row[]>; writes: Record<Table, Row[]>; additions: Record<Table, Row[]>; diffs: Record<Table, Diff>
  mappings: Row[]; mappingAdds: Row[]; mappingRemoves: Row[]; aliases: Row[]
  targets: { created: number; changed: number; unchanged: number; pokemon: number; set: number }
  structures: { type: string; target: string; ids: string[]; hash: string; version: string }[]
}
const id = (row: Row): string => String(row.id)
const nullable = (value: Row[string] | undefined): string | null => value === null || value === undefined ? null : String(value)
const mappingKey = (row: Row): string => `${String(row.card_id)}:${String(row.pokemon_id)}`
function same(previous: Row, next: Row): boolean {
  return Object.keys(next).every((key) => canonical(previous[key]) === canonical(next[key]))
}

/** A known, disappeared entity can be maintained explicitly; an unknown selector still fails validation. */
export function includeOverrideHistory(input: Catalogue, state: State, overrides: Override[]): Catalogue {
  const result = structuredClone(input)
  for (const override of overrides) {
    if (override.action === 'card.add' || result.cards.some((card) => card.key === override.card)) continue
    const previous = state.rows.source_cards.find((row) => (row.tcgdex_id !== null && `tcgdex:${String(row.tcgdex_id)}` === override.card)
      || state.aliases.some((alias) => alias.entity_key === override.card && alias.source_card_id === row.id))
    if (!previous) continue
    const set = state.rows.tcg_sets.find((row) => row.id === previous.set_id)
    if (!set || !result.sets.some((item) => item.key === set.tcgdex_id)) throw new Error(`Historical override requires a current set: ${override.card}`)
    const key = override.card
    const card: Card = { key, sourceId: nullable(previous.tcgdex_id), localId: String(previous.local_id), set: String(set.tcgdex_id),
      name: nullable(previous.name_fr), category: nullable(previous.category), rarity: nullable(previous.rarity), image: nullable(previous.image_url),
      date: nullable(previous.effective_release_date), dateOrigin: 'unknown', sourceUpdated: nullable(previous.source_updated_at),
      dex: state.mappings.filter((row) => row.card_id === previous.id).map((row) => Number(state.rows.pokemon.find((p) => p.id === row.pokemon_id)?.dex_number)),
      rank: Number(previous.normalized_number), origin: previous.origin === 'my' ? 'my' : 'tcgdex', present: false, active: false,
      variants: state.rows.catalog_variants.filter((row) => row.source_card_id === previous.id && row.size !== 'jumbo').map((row) => {
        const props = normalizeProperties({ type: String(row.variant_type), subtype: nullable(row.subtype), size: 'standard',
          stamp: Array.isArray(row.stamp) ? row.stamp : [], foil: nullable(row.foil) })
        return { ...props, key: `${key}#${String(row.variant_key)}`, identity: variantKey(props), sourceId: nullable(row.source_variant_id),
          label: String(row.label), image: nullable(row.image_url), availability: row.french_availability === 'confirmed' ? 'confirmed'
            : row.french_availability === 'unavailable' ? 'unavailable' : 'unknown',
          origin: row.origin === 'my' ? 'my' : 'tcgdex', present: false, active: false, rank: Number(row.sort_order), alias: true }
      }) }
    result.cards.push(card)
  }
  return result
}

export function makePlan(catalogue: Catalogue, state: State): Plan {
  const plan: Plan = { rows: {} as Plan['rows'], writes: {} as Plan['writes'], additions: {} as Plan['additions'], diffs: {} as Plan['diffs'],
    mappings: [], mappingAdds: [], mappingRemoves: [], aliases: [], targets: { created: 0, changed: 0, unchanged: 0, pokemon: 0, set: 0 }, structures: [] }
  const next = { ...state.next }
  const seen = new Map<Table, Set<string>>()
  for (const table of tables) { plan.rows[table] = []; plan.writes[table] = []; plan.additions[table] = []; seen.set(table, new Set()) }
  const add = (table: Table, values: Row, previous?: Row): Row => {
    const row: Row = { id: previous ? id(previous) : String(next[table]++), ...values }
    const used = seen.get(table)
    if (used?.has(id(row))) throw new Error(`Two entities resolve to the same ${table} ID: ${id(row)}`)
    if (!previous && state.rows[table].some((old) => old.id === row.id)) throw new Error(`Sequence is behind existing IDs: ${table}`)
    used?.add(id(row)); plan.rows[table].push(row)
    if (!previous) plan.additions[table].push(row)
    return row
  }
  const oldBy = (table: Table, key: string): Map<string, Row> => new Map(state.rows[table].map((row) => [String(row[key]), row]))
  const oldSeries = oldBy('tcg_series', 'tcgdex_id'), oldSets = oldBy('tcg_sets', 'tcgdex_id'), oldCards = oldBy('source_cards', 'tcgdex_id')
  const oldPokemon = oldBy('pokemon', 'dex_number'), oldVariants = new Map(state.rows.catalog_variants.map((row) => [`${String(row.source_card_id)}#${String(row.variant_key)}`, row]))
  const oldAlias = new Map(state.aliases.map((row) => [String(row.entity_key), row]))
  const seriesIds = new Map<string, string>(), setIds = new Map<string, string>(), pokemonIds = new Map<number, string>()
  const cardIds = new Map<string, string>(), variantIds = new Map<string, string>()
  for (const serie of [...catalogue.series].sort((a, b) => compare(a.key, b.key))) {
    const row = add('tcg_series', { tcgdex_id: serie.key, name_fr: serie.name, name_source: serie.sourceName,
      sort_order: String(serie.rank), is_active: serie.active }, oldSeries.get(serie.key))
    seriesIds.set(serie.key, id(row))
  }
  for (const set of [...catalogue.sets].sort((a, b) => compare(a.key, b.key))) {
    const row = add('tcg_sets', { tcgdex_id: set.key, series_id: seriesIds.get(set.series) ?? null, name_fr: set.name, name_source: set.sourceName,
      abbreviation: set.abbreviation, abbreviation_fr: set.abbreviationFr, release_date: set.date, official_card_count: set.count,
      sort_order: String(set.rank), logo_url: set.logo, symbol_url: set.symbol, is_active: set.active }, oldSets.get(set.key))
    setIds.set(set.key, id(row))
  }
  for (const number of [...new Set(catalogue.cards.flatMap((card) => card.dex))].sort((a, b) => a - b)) {
    const previous = oldPokemon.get(String(number))
    const row = add('pokemon', { dex_number: number, name_fr: previous?.name_fr ?? null,
      is_active: catalogue.cards.some((card) => card.active && card.dex.includes(number)) }, previous)
    pokemonIds.set(number, id(row))
  }
  for (const card of [...catalogue.cards].sort((a, b) => compare(a.key, b.key))) {
    const alias = oldAlias.get(card.key)
    const previous = card.sourceId ? oldCards.get(card.sourceId) : state.rows.source_cards.find((row) => row.id === alias?.source_card_id)
    const row = add('source_cards', { tcgdex_id: card.sourceId, local_id: card.localId, set_id: setIds.get(card.set) ?? null,
      name_fr: card.name, category: card.category, rarity: card.rarity, image_url: card.image, normalized_number: String(card.rank),
      effective_release_date: card.date, source_updated_at: card.sourceUpdated, source_present: card.present, is_active: card.active, origin: card.origin }, previous)
    cardIds.set(card.key, id(row))
    if (card.origin === 'my' && !alias) plan.aliases.push({ entity_key: card.key, source_card_id: id(row), variant_id: null })
    for (const variant of [...card.variants].sort((a, b) => compare(a.key, b.key))) {
      const alias = oldAlias.get(variant.key)
      const previous = alias ? state.rows.catalog_variants.find((row) => row.id === alias.variant_id)
        : oldVariants.get(`${id(row)}#${variant.identity}`) ?? oldVariants.get(`${id(row)}#${variant.key.slice(card.key.length + 1)}`)
      const variantRow = add('catalog_variants', { source_card_id: id(row), source_variant_id: variant.sourceId, variant_key: variant.identity,
        label: variant.label, variant_type: variant.type, subtype: variant.subtype, size: variant.size, stamp: variant.stamp, foil: variant.foil,
        image_url: variant.image ?? card.image, french_availability: variant.availability, sort_order: String(variant.rank),
        origin: variant.origin, source_present: variant.present, is_active: variant.active }, previous)
      variantIds.set(variant.key, id(variantRow))
      if (variant.alias && !alias) plan.aliases.push({ entity_key: variant.key, source_card_id: null, variant_id: id(variantRow) })
    }
    for (const number of card.dex) plan.mappings.push({ card_id: id(row), pokemon_id: pokemonIds.get(number) ?? null })
  }
  // Retain absent entities and all user references. Only activity/presence change.
  for (const table of tables.filter((table) => table !== 'automatic_target_states')) {
    const columns = Object.keys(plan.rows[table][0] ?? {})
    for (const previous of state.rows[table]) if (!seen.get(table)?.has(id(previous))) {
      const values = Object.fromEntries(columns.filter((key) => key !== 'id').map((key) => [key, previous[key] ?? null]))
      // A table may be empty in the desired snapshot (e.g. all Pokemon mappings removed).
      if (!columns.length) for (const [key, value] of Object.entries(previous)) if (!['id', 'created_at', 'updated_at'].includes(key)) values[key] = value
      values.is_active = false
      if ('source_present' in previous) values.source_present = false
      add(table, values, previous)
    }
  }
  const eligible = catalogue.cards.flatMap((card) => card.active && catalogue.sets.find((set) => set.key === card.set)?.active
    ? card.variants.filter((v) => v.active && v.availability === 'confirmed' && v.size === 'standard').map((variant) => ({ card, variant })) : [])
  const oldTargets = new Map(state.rows.automatic_target_states.map((row) => [`${String(row.target_type)}:${String(row.pokemon_id ?? row.set_id)}`, row]))
  const target = (type: 'pokemon' | 'set', targetId: string, entries: typeof eligible): void => {
    const previous = oldTargets.get(`${type}:${targetId}`)
    const ordered = [...entries].sort((a, b) => (type === 'pokemon' ? compare(a.card.date ?? '9999-12-31', b.card.date ?? '9999-12-31') : 0)
      || a.card.rank - b.card.rank || a.variant.rank - b.variant.rank || compare(a.card.key, b.card.key) || compare(a.variant.identity, b.variant.identity))
    const ids = ordered.map((item) => variantIds.get(item.variant.key) ?? '')
    const contentHash = hash(ids), changed = previous && previous.content_hash !== contentHash
    const version = previous ? BigInt(String(previous.generation_version)) + (changed ? 1n : 0n) : 1n
    add('automatic_target_states', { target_type: type, pokemon_id: type === 'pokemon' ? targetId : null,
      set_id: type === 'set' ? targetId : null, generation_version: String(version), content_hash: contentHash }, previous)
    plan.structures.push({ type, target: targetId, ids, hash: contentHash, version: String(version) })
    plan.targets[type]++; plan.targets[!previous ? 'created' : changed ? 'changed' : 'unchanged']++
  }
  for (const [number, pokemonId] of pokemonIds) {
    const entries = eligible.filter((item) => item.card.dex.includes(number))
    if (entries.length || oldTargets.has(`pokemon:${pokemonId}`)) target('pokemon', pokemonId, entries)
  }
  for (const [key, setId] of setIds) target('set', setId, eligible.filter((item) => item.card.set === key))
  for (const old of state.rows.automatic_target_states) if (!seen.get('automatic_target_states')?.has(id(old)))
    target(old.target_type === 'pokemon' ? 'pokemon' : 'set', String(old.pokemon_id ?? old.set_id), [])
  for (const table of tables) {
    const previous = oldBy(table, 'id')
    const diff: Diff = { created: 0, modified: 0, reactivated: 0, disappeared: 0, deactivated: 0, unchanged: 0 }
    for (const row of plan.rows[table]) {
      const old = previous.get(id(row))
      if (!old) { diff.created++; plan.writes[table].push(row) }
      else if (same(old, row)) diff.unchanged++
      else {
        diff.modified++; plan.writes[table].push(row)
        if (old.is_active === false && row.is_active === true) diff.reactivated++
        if (old.is_active === true && row.is_active === false) diff.deactivated++
        if (old.source_present === true && row.source_present === false) diff.disappeared++
      }
    }
    plan.diffs[table] = diff
  }
  const previousMappings = new Set(state.mappings.map(mappingKey)), wantedMappings = new Set(plan.mappings.map(mappingKey))
  plan.mappingAdds = plan.mappings.filter((row) => !previousMappings.has(mappingKey(row)))
  plan.mappingRemoves = state.mappings.filter((row) => !wantedMappings.has(mappingKey(row)))
  // Validate the complete retained state too, including inactive rows absent from the snapshot.
  for (const table of tables) {
    unique(plan.rows[table], (row) => String(row.id), `${table} ID`)
    if (['tcg_series', 'tcg_sets', 'source_cards'].includes(table)) unique(plan.rows[table].filter((row) => row.tcgdex_id !== null),
      (row) => String(row.tcgdex_id), `${table} source ID`)
  }
  unique(plan.rows.catalog_variants, (row) => `${String(row.source_card_id)}#${String(row.variant_key)}`, 'retained variant identity')
  unique(plan.rows.catalog_variants.filter((row) => row.source_variant_id !== null),
    (row) => `${String(row.source_card_id)}#${String(row.source_variant_id)}`, 'retained source variant ID')
  unique(plan.mappings, mappingKey, 'mapping')
  return plan
}
