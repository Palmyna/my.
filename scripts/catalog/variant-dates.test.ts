import { describe, expect, it } from 'vitest'
import { emptyState, fixture, fixturePokemonReference, fixtureSource } from './fixtures.ts'
import type { Card, Catalogue } from './model.ts'
import type { State } from './database.ts'
import { effectiveDate, normalize, validateCatalogue } from './normalize.ts'
import { applyOverrides, parseOverrides } from './overrides.ts'
import { includeOverrideHistory, makePlan as planWithReference } from './plan.ts'
import { report } from './report.ts'
import { rankCards } from './order.ts'
import { variantKey, variants } from './variants.ts'

const cardKey = 'tcgdex:fixture-set-10', normal = variantKey({ type: 'normal' })
const plan = (c: Catalogue, state = emptyState()) => planWithReference(c, state, fixturePokemonReference)
const stateFor = (p: ReturnType<typeof plan>): State => ({ ...emptyState(), rows: p.rows, mappings: p.mappings, aliases: p.aliases })
const patch = (date: string | null, id = 'date') => ({ id, reason: 'Synthetic verified variant date',
  action: 'variant.patch', card: cardKey, key: normal, patch: { date } })
const add = (date?: string) => ({ id: 'added', reason: 'Synthetic later printing', action: 'variant.add', card: cardKey,
  variant: { type: 'normal', stamp: ['staff'], availability: 'confirmed', ...(date === undefined ? {} : { date }) } })
const cardPatch = { id: 'zz-card-date', reason: 'Synthetic card correction', action: 'card.patch', card: cardKey,
  patch: { date: '2022-03-01' } }
const find = (c: Catalogue, key = `${cardKey}#${normal}`) => c.cards.find((c) => c.key === cardKey)!.variants.find((v) => v.key === key)!

describe('variant release dates and fallback', () => {
  it('inherits the real card/set origin in source normalization', () => {
    const raw = fixtureSource()
    raw.cards[0]!.releaseDate = '2021-03-01'
    const c = normalize(raw)
    expect(c.cards[0]!.variants.every((v) => v.date === '2021-03-01' && v.dateOrigin === 'card')).toBe(true)
    expect(c.cards[1]!.variants.every((v) => v.date === '2020-02-29' && v.dateOrigin === 'set')).toBe(true)
  })
  it.each(['card', 'product', 'set', 'override', 'unknown'] as const)('preserves fallback origin %s', (dateOrigin) => {
    const date = dateOrigin === 'unknown' ? null : '2020-01-01'
    const v = variants(undefined, 'c', [], {}, { date, dateOrigin }).values[0]!
    expect(v).toMatchObject({ date, dateOrigin })
  })
  it('keeps NULL when no reliable source date exists', () => {
    const raw = fixtureSource()
    delete raw.sets[0]!.releaseDate
    const c = normalize(raw)
    expect(c.cards.flatMap((card) => card.variants).every((v) => v.date === null && v.dateOrigin === 'unknown')).toBe(true)
    validateCatalogue(c)
  })
  it('rejects invalid effective dates and unsupported provenance', () => {
    const c = fixture()
    find(c).date = '2021-02-29'
    expect(() => validateCatalogue(c)).toThrow()
    find(c).date = ''
    expect(() => validateCatalogue(c)).toThrow()
    find(c).date = null
    Object.assign(find(c), { dateOrigin: 'guessed' })
    expect(() => validateCatalogue(c)).toThrow()
  })
  it('inherits a reliable product fallback without inventing a source relation', () => {
    expect(variants(undefined, 'c', [], {}, effectiveDate(null, '2020-01-01', null)).values[0])
      .toMatchObject({ date: '2020-01-01', dateOrigin: 'product' })
  })
})

describe('variant date overrides', () => {
  it('adds without a date using the card fallback', () => {
    expect(find(applyOverrides(fixture(), parseOverrides([add()])), 'my:added'))
      .toMatchObject({ date: '2020-02-29', dateOrigin: 'set' })
  })
  it('adds with an explicit override date', () => {
    expect(find(applyOverrides(fixture(), parseOverrides([add('2021-01-01')])), 'my:added'))
      .toMatchObject({ date: '2021-01-01', dateOrigin: 'override' })
  })
  it('patches a date without changing either identity, source ID or allocated ID', () => {
    const c = fixture(), first = plan(c), changed = applyOverrides(c, parseOverrides([patch('2021-01-01')]))
    const before = find(c), after = find(changed)
    expect(after).toMatchObject({ date: '2021-01-01', dateOrigin: 'override', key: before.key,
      identity: before.identity, sourceId: before.sourceId })
    expect(variantKey(after)).toBe(variantKey(before))
    expect(plan(changed, stateFor(first)).rows.catalog_variants.map((v) => [v.id, v.variant_key]))
      .toEqual(first.rows.catalog_variants.map((v) => [v.id, v.variant_key]))
  })
  it('date:null removes an explicit correction and restores the card fallback', () => {
    const c = applyOverrides(fixture(), parseOverrides([patch('2021-01-01')]))
    expect(find(applyOverrides(c, parseOverrides([patch(null)]))))
      .toMatchObject({ date: '2020-02-29', dateOrigin: 'set' })
  })
  it('date:null returns NULL when the card is unknown', () => {
    const c = fixture()
    c.cards[0]!.date = null; c.cards[0]!.dateOrigin = 'unknown'
    expect(find(applyOverrides(c, parseOverrides([patch(null)])))).toMatchObject({ date: null, dateOrigin: 'unknown' })
  })
  it('resolves card patches after additions or date:null without replacing specific dates', () => {
    const c = applyOverrides(fixture(), parseOverrides([add(), patch(null), cardPatch]))
    expect(find(c)).toMatchObject({ date: '2022-03-01', dateOrigin: 'override' })
    expect(find(c, 'my:added')).toMatchObject({ date: '2022-03-01', dateOrigin: 'override' })
    const explicit = applyOverrides(fixture(), parseOverrides([add('2021-01-01'), patch('2021-02-01'), cardPatch]))
    expect(find(explicit).date).toBe('2021-02-01')
    expect(find(explicit, 'my:added').date).toBe('2021-01-01')
  })
  it('keeps a known specific source variant date when its card is corrected', () => {
    const c = fixture()
    Object.assign(find(c), { date: '2021-01-01', dateOrigin: 'variant' })
    expect(find(applyOverrides(c, parseOverrides([cardPatch])))).toMatchObject({ date: '2021-01-01', dateOrigin: 'variant' })
  })
  it('supports dates on variants nested in card.add and preserves inherited override provenance', () => {
    const c = applyOverrides(fixture(), parseOverrides([{ id: 'local', reason: 'Synthetic local card', action: 'card.add',
      card: { set: 'fixture-set', localId: '30', name: 'Local', date: '2020-01-01', variants: [
        { type: 'normal', availability: 'confirmed' }, { type: 'holo', availability: 'confirmed', date: '2021-01-01' },
      ] } }]))
    expect(c.cards.find((c) => c.key === 'my:local')!.variants.map((v) => [v.date, v.dateOrigin]))
      .toEqual([['2020-01-01', 'override'], ['2021-01-01', 'override']])
  })
  it.each(['2021-02-29', '2020', '2020-13-01'])('rejects invalid override date %s', (date) => {
    expect(() => parseOverrides([add(date)])).toThrow()
    expect(() => parseOverrides([patch(date)])).toThrow()
  })
})

function chronology(): Catalogue {
  const c = fixture(), base = c.cards[0]!
  const card = (localId: string, date: string, promo = false): Card => {
    const key = `tcgdex:fixture-set-${localId}`, cardDate = { date, dateOrigin: 'card' as const }
    return { ...base, ...cardDate, key, sourceId: `fixture-set-${localId}`, localId, dex: [25],
      variants: variants(promo ? [{ type: 'normal' }, { type: 'normal', stamp: ['staff'] }] : undefined, key, [], {}, cardDate).values }
  }
  c.cards = [card('1', '2020-01-01', true), card('2', '2020-06-01')]
  rankCards(c.cards)
  return c
}

describe('variant chronology, target hashes and history', () => {
  it('interleaves A Normal, B Normal, A Promo; changes only the Pokemon target', () => {
    const c = chronology(), first = plan(c), state = stateFor(first)
    c.cards[0]!.variants[1]!.date = '2021-01-01'
    c.cards[0]!.variants[1]!.dateOrigin = 'override'
    const changed = plan(c, state), [aNormal, aPromo, bNormal] = first.structures.find((s) => s.type === 'set')!.ids
    const pokemon = changed.structures.find((s) => s.type === 'pokemon')!
    expect(pokemon.ids).toEqual([aNormal, bNormal, aPromo])
    expect(pokemon.hash).not.toBe(first.structures.find((s) => s.type === 'pokemon')!.hash)
    expect(pokemon.version).toBe('2')
    expect(changed.structures.find((s) => s.type === 'set')).toEqual(first.structures.find((s) => s.type === 'set'))
    expect(changed.rows.catalog_variants.map((v) => v.id)).toEqual(first.rows.catalog_variants.map((v) => v.id))
    expect(plan(c, stateFor(changed)).writes.catalog_variants).toEqual([])
    expect(plan(c, stateFor(changed)).targets.changed).toBe(0)
  })
  it('does not bump any hash/version when a date changes without moving a variant', () => {
    const c = chronology(), first = plan(c)
    c.cards[1]!.variants[0]!.date = '2020-07-01'
    const changed = plan(c, stateFor(first))
    expect(changed.structures).toEqual(first.structures)
    expect(changed.writes.automatic_target_states).toEqual([])
    expect(changed.diffs.catalog_variants.modified).toBe(1)
  })
  it('sorts NULL strictly after all known dates and retains deterministic ties', () => {
    const c = chronology()
    c.cards[0]!.variants[0]!.date = null
    c.cards[0]!.variants[1]!.date = null
    c.cards[1]!.variants[0]!.date = '9999-12-31'
    const p = plan(c), ids = p.structures.find((s) => s.type === 'set')!.ids
    expect(p.structures.find((s) => s.type === 'pokemon')!.ids).toEqual([ids[2], ids[0], ids[1]])
    c.cards.reverse(); c.cards.forEach((c) => c.variants.reverse())
    expect(plan(c).structures).toEqual(p.structures)
  })
  it('retains persisted dates for absent variants, absent cards and historical override reconstruction', () => {
    const c = applyOverrides(fixture(), parseOverrides([patch('2021-01-01')]))
    const first = plan(c), state = stateFor(first), wanted = first.rows.catalog_variants.find((v) => v.variant_key === normal)!
    const missingVariant = structuredClone(c)
    missingVariant.cards[0]!.variants = missingVariant.cards[0]!.variants.filter((v) => v.identity !== normal)
    expect(plan(missingVariant, state).rows.catalog_variants.find((v) => v.id === wanted.id))
      .toMatchObject({ effective_release_date: '2021-01-01', date_origin: 'override', is_active: false })
    const missingCard = structuredClone(c)
    missingCard.cards = missingCard.cards.filter((c) => c.key !== cardKey)
    expect(plan(missingCard, state).rows.catalog_variants.find((v) => v.id === wanted.id))
      .toMatchObject({ effective_release_date: '2021-01-01', date_origin: 'override' })
    const maintain = parseOverrides([{ id: 'maintain', reason: 'Historical metadata only', action: 'card.patch', card: cardKey, patch: { name: 'Historical' } }])
    const restored = applyOverrides(includeOverrideHistory(missingCard, state, maintain), maintain)
    expect(find(restored)).toMatchObject({ date: '2021-01-01', dateOrigin: 'override', active: false })
    expect(plan(restored, state).rows.catalog_variants.find((v) => v.id === wanted.id))
      .toMatchObject({ effective_release_date: '2021-01-01', date_origin: 'override' })
  })
  it('reports every persisted provenance, including retained variants and NULL dates', () => {
    const c = chronology(), p = plan(c), origins = ['variant', 'card', 'product', 'set', 'override', 'unknown']
    p.rows.catalog_variants = origins.map((origin, i) => ({ ...p.rows.catalog_variants[0]!, id: String(i + 1),
      date_origin: origin, effective_release_date: origin === 'unknown' ? null : '2020-01-01' }))
    const r = report(c, p, { repository: 'fixture', sha: 'a'.repeat(40), committedAt: '2020-01-01', directory: '' }, '', 'test', new Date().toISOString())
    expect(r.variant_dates).toEqual({ variant: 1, card: 1, product: 1, set: 1, override: 1, unknown: 1 })
    expect(r.catalogue.variants_without_date).toBe(1)
  })
})
