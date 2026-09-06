import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hash } from './model.ts'
import { fixture, fixtureSource, emptyState } from './fixtures.ts'
import { compareNumbers, compareVariants, rankCards } from './order.ts'
import { normalizeProperties, sourceVariantId, variantKey, variants } from './variants.ts'
import { assetSegment, effectiveDate, normalize, reliableDate, validateCatalogue } from './normalize.ts'
import { applyOverrides, parseOverrides, loadOverrides } from './overrides.ts'
import { makePlan } from './plan.ts'
import { assertLocalUrl } from './database.ts'
import { LiteralReader } from './reader.ts'

describe('variant identity and source semantics', () => {
  it('normalizes size and unordered stamps, ignores labels/languages/third party', () => {
    const props = { type: 'holo', stamp: ['staff', 'pre-release'] }
    expect(variantKey(props)).toBe(variantKey({ ...props, size: 'standard', stamp: ['pre-release', 'staff'] }))
    expect(variantKey({ ...props, ...{ label: 'Nouvelle traduction', languages: ['en'], thirdParty: { price: 42 } } })).toBe(variantKey(props))
    expect(variantKey({ ...props, foil: 'cosmos' })).not.toBe(variantKey(props))
    expect(variantKey({ ...props, subtype: 'unlimited' })).not.toBe(variantKey(props))
  })
  it('reproduces source IDs while keeping MY identity collision-safe', () => {
    // Upstream English identifier for the canonical string "standard|normal".
    expect(sourceVariantId(normalizeProperties({ type: 'normal' }), false)).toBe('endfynwn4n10gzq')
    expect(variantKey({ type: 'holo', stamp: ['a', 'bc'] })).not.toBe(variantKey({ type: 'holo', stamp: ['ab', 'c'] }))
  })
  it.each([[undefined, 'confirmed'], [['fr'], 'confirmed'], [['en'], 'unavailable'], [[], 'unavailable']] as const)('handles languages %s', (languages, expected) => {
    expect(variants([{ type: 'normal', ...(languages === undefined ? {} : { languages }) }], 'c', []).values[0]?.availability).toBe(expected)
  })
  it('normalizes legacy once; excludes jumbo; never persists generated', () => {
    const result = variants({ normal: true, holo: true, reverse: true, firstEdition: true, wPromo: true, jumbo: true, preRelease: true }, 'c', [])
    expect(result.values).toHaveLength(7)
    expect(result.jumbo).toBe(1)
    expect(result.values.every((v) => v.sourceId === null && v.availability === 'confirmed')).toBe(true)
    expect(variants(undefined, 'c', []).values.map((v) => v.type)).toEqual(['normal'])
    expect(variants([{ type: 'metal', size: 'jumbo' }], 'c', []).values).toEqual([])
  })
  it('rejects unsupported shapes instead of guessing variants', () => {
    expect(() => variants({ mystery: true }, 'c', [])).toThrow()
    expect(() => variants([{ type: 'holo', languages: null }], 'c', [])).toThrow()
  })
  it('coalesces exact repetitions but refuses conflicting definitions of one identity', () => {
    const diagnostics: import('./model.ts').Diagnostic[] = []
    expect(variants([{ type: 'normal' }, { type: 'normal' }], 'c', diagnostics).values).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('repeated-source-variant')
    expect(() => variants([{ type: 'normal' }, { type: 'normal', languages: ['en'] }], 'c', [])).toThrow('Conflicting')
  })
})
describe('deterministic order and dates', () => {
  it('follows all validated macro priorities', () => {
    const inputs = [
      { type: 'normal' }, { type: 'normal', stamp: ['staff'] }, { type: 'holo' }, { type: 'holo', stamp: ['staff'] },
      { type: 'holo', foil: 'cosmos' }, { type: 'holo', foil: 'cosmos', stamp: ['staff'] }, { type: 'reverse' },
      { type: 'reverse', stamp: ['staff'] }, { type: 'reverse', foil: 'pokeball' }, { type: 'reverse', foil: 'masterball' }, { type: 'metal' },
    ].map(normalizeProperties)
    expect([...inputs].reverse().sort(compareVariants)).toEqual(inputs)
  })
  it('naturally orders main numbers, suffixes and prefix groups, then atypical values', () => {
    expect(['10', '2A', 'GG10', '1', 'SV001', 'TG02', '3', 'GG01', '2', '?', 'TG01'].sort(compareNumbers))
      .toEqual(['1', '2', '2A', '3', '10', 'GG01', 'GG10', 'SV001', 'TG01', 'TG02', '?'])
    expect(['100000000000000000001', '100000000000000000000'].sort(compareNumbers)[0]).toBe('100000000000000000000')
    expect(['TWO', 'A', '%3F', '!', 'Z'].sort(compareNumbers)).toEqual(['!', '%3F', 'A', 'TWO', 'Z'])
    expect(assetSegment('%3F')).toBe('%3F')
  })
  it('orders unknown dates last; date changes affect Pokemon but not set order', () => {
    const c = fixture()
    c.cards[0]!.date = null
    c.cards[1]!.dex = [25]
    const first = makePlan(c, emptyState())
    const secondCard = first.rows.source_cards.find((row) => row.local_id === '2A')!
    const secondIds = first.rows.catalog_variants.filter((row) => row.source_card_id === secondCard.id).map((row) => row.id)
    expect(first.structures.find((target) => target.type === 'pokemon')?.ids.slice(0, 2)).toEqual(secondIds)
    c.cards[0]!.date = '2000-01-01'
    const changed = makePlan(c, { ...emptyState(), rows: first.rows, mappings: first.mappings })
    expect(changed.structures.filter((target) => target.type === 'set')).toEqual(first.structures.filter((target) => target.type === 'set'))
    expect(changed.targets.changed).toBe(1)
  })
  it('uses only real full dates with the approved fallback hierarchy', () => {
    expect(reliableDate({ fr: '2020-02-29', en: '2019-01-01' })).toBe('2020-02-29')
    expect(reliableDate({ en: '2019-01-01' })).toBeNull()
    expect(reliableDate('2021-02-29')).toBeNull()
    expect(effectiveDate('2022-01-01', '2021-01-01', '2020-01-01').dateOrigin).toBe('card')
    expect(effectiveDate(null, '2021-01-01', '2020-01-01').dateOrigin).toBe('product')
    expect(effectiveDate(null, null, '2020-01-01').dateOrigin).toBe('set')
    expect(effectiveDate(null, null, null)).toEqual({ date: null, dateOrigin: 'unknown' })
  })
  it('preserves multi-dex links and excludes cameos without extracting names', () => {
    const catalogue = fixture(), plan = makePlan(catalogue, emptyState())
    expect(plan.rows.pokemon.map((row) => row.dex_number)).toEqual([25, 644])
    expect(plan.rows.pokemon.every((row) => row.name_fr === null)).toBe(true)
    expect(plan.targets).toMatchObject({ set: 1, pokemon: 2 })
  })
})
describe('strict Git overrides', () => {
  const card = 'tcgdex:fixture-set-10', key = variantKey({ type: 'normal' })
  it.each(['confirmed', 'unknown', 'unavailable'])('forces availability %s without changing identity', (availability) => {
    const result = applyOverrides(fixture(), parseOverrides([{ id: 'fr-fix', reason: 'Verified specimen', action: 'variant.patch', card, key, patch: { availability } }]))
    const variant = result.cards[0]?.variants.find((v) => v.identity === key)
    expect(variant?.availability).toBe(availability)
    expect(variant?.type).toBe('normal')
  })
  it('patches metadata/date/activity, properties and mappings with provenance', () => {
    const result = applyOverrides(fixture(), parseOverrides([
      { id: 'card', reason: 'Documented correction', action: 'card.patch', card, patch: { name: 'Corrigée', date: '2022-01-01' } },
      { id: 'variant', reason: 'Verified foil', action: 'variant.patch', card, key, patch: { foil: 'cosmos', stamp: ['staff'], active: false } },
      { id: 'include', reason: 'Missing dex', action: 'mapping.include', card, dex: 1 },
      { id: 'exclude', reason: 'Incorrect dex', action: 'mapping.exclude', card, dex: 644 },
    ]))
    expect(result.cards[0]).toMatchObject({ name: 'Corrigée', date: '2022-01-01', dateOrigin: 'override', dex: [1, 25] })
    expect(result.cards[0]?.variants.some((v) => v.foil === 'cosmos' && v.type === 'normal' && !v.active)).toBe(true)
    expect(result.overrides).toHaveLength(4)
    validateCatalogue(result)
  })
  it('never resets omitted properties in a label or availability patch', () => {
    const source = fixture(), holo = source.cards[0]!.variants.find((v) => v.type === 'holo')!
    const result = applyOverrides(source, parseOverrides([{ id: 'label-only', reason: 'Translation correction', action: 'variant.patch',
      card, key: holo.identity, patch: { label: 'Libellé corrigé', availability: 'unknown' } }]))
    const corrected = result.cards[0]!.variants.find((v) => v.key === holo.key)!
    expect(corrected).toMatchObject({ identity: holo.identity, stamp: holo.stamp, foil: 'cosmos', label: 'Libellé corrigé', availability: 'unknown' })
    expect(() => parseOverrides([{ id: 'empty', reason: 'No fields', action: 'variant.patch', card, key, patch: {} }])).toThrow()
  })
  it('adds a real local card and a missing variant through the same model', () => {
    const result = applyOverrides(fixture(), parseOverrides([
      { id: 'local-card', reason: 'Source missing', action: 'card.add', card: { set: 'fixture-set', localId: 'TG01', name: 'Locale', date: null,
        dex: [25], variants: [{ type: 'normal', availability: 'confirmed' }] } },
      { id: 'local-holo', reason: 'Source missing', action: 'variant.add', card, variant: { type: 'holo', availability: 'confirmed' } },
    ]))
    validateCatalogue(result)
    expect(result.cards[2]).toMatchObject({ origin: 'my', present: false, active: true })
    expect(makePlan(result, emptyState()).aliases).toHaveLength(3)
  })
  it('reports redundant patches without deleting them', () => {
    const result = applyOverrides(fixture(), parseOverrides([{ id: 'redundant', reason: 'Source caught up', action: 'card.patch', card, patch: { name: 'Carte multi Pokémon' } }]))
    expect(result.overrides[0]?.redundant).toBe(true)
  })
  it.each([
    [{ id: 'x', reason: '', action: 'mapping.include', card, dex: 25 }],
    [{ id: 'x', reason: 'x', action: 'unknown', card }],
    [{ id: 'x', reason: 'x', action: 'card.patch', card, patch: { unknown: true } }],
    [{ id: 'x', reason: 'x', action: 'mapping.include', card, dex: -1 }],
    [{ id: 'x', reason: 'x', action: 'card.patch', card, patch: { date: '2021-02-29' } }],
  ])('rejects invalid JSON schema %#', (value) => { expect(() => parseOverrides(value)).toThrow() })
  it('rejects unknown targets, conflicting fields, duplicate IDs/variants and missing sets', () => {
    const item = { id: 'x', reason: 'x', action: 'card.patch', card, patch: { name: 'A' } }
    expect(() => parseOverrides([item, item])).toThrow('Duplicate')
    expect(() => applyOverrides(fixture(), parseOverrides([{ ...item, card: 'unknown' }]))).toThrow('Unknown')
    expect(() => applyOverrides(fixture(), parseOverrides([item, { ...item, id: 'y' }]))).toThrow('Conflicting')
    expect(() => applyOverrides(fixture(), parseOverrides([{ id: 'x', reason: 'x', action: 'variant.patch', card, key: '?', patch: { active: false } }]))).toThrow('Unknown')
    expect(() => applyOverrides(fixture(), parseOverrides([{ id: 'x', reason: 'x', action: 'variant.add', card, variant: { type: 'normal', availability: 'confirmed' } }]))).toThrow('Duplicate')
    expect(() => applyOverrides(fixture(), parseOverrides([{ id: 'x', reason: 'x', action: 'card.add', card: { set: '?', localId: '1', name: 'x', date: null, variants: [{ type: 'normal', availability: 'confirmed' }] } }]))).toThrow('Unknown set')
  })
})
describe('plans, hashes and local boundaries', () => {
  it('is idempotent and hashes only ordered internal variant IDs', () => {
    const catalogue = fixture(), plan = makePlan(catalogue, emptyState())
    const state = { ...emptyState(), rows: plan.rows, mappings: plan.mappings, aliases: plan.aliases }
    expect(Object.values(makePlan(catalogue, state).writes).flat()).toEqual([])
    const changed = structuredClone(catalogue)
    for (const card of changed.cards) { card.name = 'Renamed'; card.image = null; card.rarity = 'Other' }
    expect(makePlan(changed, state).targets.changed).toBe(0)
    expect(hash(['1', '2'])).not.toBe(hash(['2', '1']))
    expect(hash(['1', '2'])).not.toBe(hash(['1', '3']))
  })
  it('versions an added eligible variant but preserves existing IDs', () => {
    const catalogue = fixture(), first = makePlan(catalogue, emptyState()), state = { ...emptyState(), rows: first.rows, mappings: first.mappings }
    for (const table of Object.keys(state.next) as (keyof typeof state.next)[]) state.next[table] = BigInt(first.rows[table].length + 1)
    const changed = structuredClone(catalogue)
    const reverse = changed.cards[0]?.variants.find((variant) => variant.type === 'reverse')
    if (reverse) reverse.availability = 'confirmed'
    const next = makePlan(changed, state)
    expect(next.targets.changed).toBe(3)
    expect(next.additions.catalog_variants).toEqual([])
    expect(next.rows.catalog_variants.map((row) => row.id)).toEqual(first.rows.catalog_variants.map((row) => row.id))
  })
  it('keeps disappeared rows and empty prior targets', () => {
    const first = makePlan(fixture(), emptyState()), changed = fixture()
    changed.cards = changed.cards.slice(1); rankCards(changed.cards)
    const next = makePlan(changed, { ...emptyState(), rows: first.rows, mappings: first.mappings })
    expect(next.diffs.source_cards.disappeared).toBe(1)
    expect(next.rows.source_cards).toHaveLength(2)
    expect(next.structures.filter((target) => target.type === 'pokemon').every((target) => target.ids.length === 0)).toBe(true)
  })
  it.each(['postgres://x@remote:55322/postgres', 'postgres://x@127.0.0.1:54322/postgres', 'postgres://x@localhost:55322/other', 'postgres://x@localhost:55322/postgres?host=remote'])('rejects unsafe target %s', (url) => { expect(() => assertLocalUrl(url)).toThrow() })
  it('accepts only the configured loopback endpoint', () => { expect(() => assertLocalUrl('postgres://x@127.0.0.1:55322/postgres')).not.toThrow() })
  it('rejects duplicate source cards and variants', () => {
    const raw = fixtureSource(); raw.cards.push(raw.cards[0]!)
    expect(() => validateCatalogue(normalize(raw))).toThrow('Duplicate')
    const catalogue = fixture(); catalogue.cards[0]!.variants.push(catalogue.cards[0]!.variants[0]!)
    expect(() => validateCatalogue(catalogue)).toThrow('Duplicate')
  })
})
describe('literal parsing and JSON files', () => {
  it('reads only selected literals and refuses executable expressions/path escapes', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'my-catalog-test-'))
    try {
      mkdirSync(path.join(directory, 'data'))
      writeFileSync(path.join(directory, 'data/a.ts'), "const card = { name: {fr:'Bonjour'}, hp: unknownCall() }; export default card")
      expect(new LiteralReader(path.join(directory, 'data')).read(path.join(directory, 'data/a.ts'))).toEqual({ name: { fr: 'Bonjour' } })
      writeFileSync(path.join(directory, 'data/b.ts'), "const card = { name: fetch('secret') }; export default card")
      expect(() => new LiteralReader(path.join(directory, 'data')).read(path.join(directory, 'data/b.ts'))).toThrow('Unsupported')
      writeFileSync(path.join(directory, 'data/broken.ts'), "const card = { name: {fr:'broken'}; export default card")
      expect(() => new LiteralReader(path.join(directory, 'data')).read(path.join(directory, 'data/broken.ts'))).toThrow('Invalid TypeScript')
      writeFileSync(path.join(directory, 'outside.ts'), 'export default {}')
      expect(() => new LiteralReader(path.join(directory, 'data')).read(path.join(directory, 'outside.ts'))).toThrow('outside')
      writeFileSync(path.join(directory, 'bad.json'), '[invalid')
      expect(() => loadOverrides(directory)).toThrow()
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
