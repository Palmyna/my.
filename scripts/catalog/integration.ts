import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { connect, readState } from './database.ts'
import { applyPlan } from './apply.ts'
import { fixtureSource } from './fixtures.ts'
import { normalize, validateCatalogue } from './normalize.ts'
import { readSource } from './reader.ts'
import { applyOverrides, parseOverrides } from './overrides.ts'
import { includeOverrideHistory, makePlan } from './plan.ts'
import { canonical, hash } from './model.ts'
import type { Catalogue } from './model.ts'
import { report } from './report.ts'
import { variantKey } from './variants.ts'

const directory = path.resolve('.cache/catalog-test-fixture')
mkdirSync(path.join(directory, 'data/Synthetic/Set'), { recursive: true })
mkdirSync(path.join(directory, 'meta/translations'), { recursive: true })
const source = fixtureSource(), rawSet = source.sets[0]!, rawSeries = source.series[0]!
writeFileSync(path.join(directory, 'data/Synthetic.ts'), `export default ${JSON.stringify(rawSeries)}`)
writeFileSync(path.join(directory, 'data/Synthetic/Set.ts'), `export default ${JSON.stringify(rawSet)}`)
for (const card of source.cards) writeFileSync(path.join(directory, `data/Synthetic/Set/${card.localId}.ts`), `export default ${JSON.stringify(card)}`)
writeFileSync(path.join(directory, 'meta/translations/fr.json'), JSON.stringify(Object.fromEntries(
  ['category','rarity','variantType','variantSize','variantFoil','variantStamp','variantSubtype'].map((key) => [key, {}]))))
const fixture = normalize(readSource(directory))
const client = await connect()
let checks = 0
const check = (actual: unknown, expected: unknown): void => { assert.deepEqual(actual, expected); checks++ }
const snap = { repository: 'https://github.com/tcgdex/cards-database', sha: 'a'.repeat(40), committedAt: '2020-01-01T00:00:00Z', directory }
async function apply(catalogue: Catalogue) {
  validateCatalogue(catalogue)
  const state = await readState(client), plan = makePlan(catalogue, state)
  await applyPlan(client, state, plan, catalogue, report(catalogue, plan, snap, hash(catalogue.overrides), 'integration', new Date().toISOString()))
  return plan
}
await client.query('begin')
try {
  const baseline = await readState(client)
  assert.equal(baseline.rows.source_cards.length, 0, 'Run integration on a reset LOCAL database, before the real import')
  const dry = makePlan(fixture, baseline)
  check(await readState(client), baseline)
  const first = await apply(fixture)
  check(first.rows, dry.rows); check(first.structures, dry.structures)
  check(first.rows.catalog_variants.length, 5)
  const stored = await readState(client)
  check(stored.rows.catalog_variants.some((row) => Array.isArray(row.stamp) && row.stamp.length === 2), true)
  const second = await apply(fixture)
  check(Object.values(second.writes).flat(), []); check(second.targets.changed, 0)
  check((await readState(client)).next, stored.next)
  check(first.rows.catalog_variants.map((row) => row.id), second.rows.catalog_variants.map((row) => row.id))

  const user = '70000000-0000-0000-0000-000000000001', collection = '71000000-0000-0000-0000-000000000001'
  const cardId = first.rows.source_cards.find((row) => row.tcgdex_id === 'fixture-set-10')!.id
  const variantId = first.rows.catalog_variants.find((row) => row.source_card_id === cardId && row.variant_type === 'normal')!.id
  await client.query('insert into auth.users(id) values($1)', [user])
  await client.query('insert into public.profiles(id) values($1)', [user])
  await client.query("insert into public.collections(id,owner_id,name,collection_type) values($1,$2,'Synthetic','free')", [collection, user])
  await client.query("insert into public.collection_items(collection_id,variant_id,origin,sort_position) values($1,$2,'manual',1)", [collection, variantId])
  await client.query("insert into public.physical_copies(user_id,variant_id,note) values($1,$2,'Protected note')", [user, variantId])
  const userState = async (): Promise<string> => canonical((await client.query(`select
    (select jsonb_agg(x) from public.collections x) collections,
    (select jsonb_agg(x) from public.collection_items x) items,
    (select jsonb_agg(x) from public.physical_copies x) copies,
    (select jsonb_agg(x) from public.profiles x) profiles,
    (select jsonb_agg(x) from public.collection_shares x) shares`)).rows)
  const userBefore = await userState()
  const card = 'tcgdex:fixture-set-10', key = variantKey({ type: 'normal' })
  const patches = parseOverrides([
    { id: 'name', reason: 'Synthetic metadata', action: 'card.patch', card, patch: { name: 'Renamed', image: 'https://example.test/image.webp' } },
    { id: 'foil', reason: 'Synthetic correction', action: 'variant.patch', card, key, patch: { foil: 'galaxy' } },
  ])
  const corrected = applyOverrides(fixture, patches), correction = await apply(corrected)
  check(correction.additions.catalog_variants.length, 0)
  check(correction.rows.catalog_variants.find((row) => row.variant_type === 'normal' && row.source_card_id === cardId)?.id, variantId)
  check((await apply(corrected)).writes.catalog_variants.length, 0)
  check((await apply(fixture)).additions.catalog_variants.length, 0)
  check(await userState(), userBefore)

  const additions = parseOverrides([
    { id: 'local', reason: 'Synthetic local card', action: 'card.add', card: { set: 'fixture-set', localId: 'TG01', name: 'Local', date: null,
      dex: [25], variants: [{ type: 'normal', availability: 'confirmed' }] } },
    { id: 'extra', reason: 'Synthetic local variant', action: 'variant.add', card, variant: { type: 'metal', availability: 'confirmed' } },
    { id: 'remove-dex', reason: 'Synthetic mapping correction', action: 'mapping.exclude', card, dex: 644 },
    { id: 'add-dex', reason: 'Synthetic mapping correction', action: 'mapping.include', card, dex: 1 },
  ])
  const local = applyOverrides(fixture, additions), added = await apply(local)
  check(added.additions.source_cards.length, 1); check(added.additions.catalog_variants.length, 2)
  check((await apply(local)).additions.catalog_variants.length, 0)
  check(added.rows.source_cards.some((row) => row.origin === 'my' && row.source_present === false && row.is_active === true), true)
  const removed = structuredClone(fixture); removed.cards = removed.cards.filter((item) => item.key !== card)
  const disappearance = await apply(removed)
  check(disappearance.rows.source_cards.find((row) => row.id === cardId)?.is_active, false)
  check(await userState(), userBefore)
  const maintain = parseOverrides([
    { id: 'maintain-card', reason: 'Historical source removal', action: 'card.patch', card, patch: { active: true } },
    { id: 'maintain-variant', reason: 'Historical source removal', action: 'variant.patch', card, key, patch: { active: true } },
  ])
  const maintained = applyOverrides(includeOverrideHistory(removed, await readState(client), maintain), maintain)
  check((await apply(maintained)).rows.source_cards.find((row) => row.id === cardId)?.source_present, false)
  check((await apply(maintained)).writes.source_cards.length, 0)
  const restored = await apply(local)
  check(restored.additions.catalog_variants.length, 0)
  check(restored.rows.source_cards.find((row) => row.id === cardId)?.is_active, true)
  check(await userState(), userBefore)
  const metadata = structuredClone(local)
  for (const item of metadata.cards) { item.name = 'Other name'; item.rarity = 'Other rarity' }
  check((await apply(metadata)).targets.changed, 0)
  const structural = structuredClone(metadata)
  structural.cards[0]!.variants.find((item) => item.type === 'reverse')!.availability = 'confirmed'
  check((await apply(structural)).targets.changed > 0, true)
  check(await userState(), userBefore)

  // Inject a genuine late SQL failure after catalogue writes; savepoint rollback restores all data.
  const beforeFailure = await readState(client)
  const runCount = await client.query<{ count: string }>('select count(*) from private.catalog_sync_runs')
  const brokenPlan = makePlan(metadata, beforeFailure)
  brokenPlan.aliases.push({ entity_key: 'bad-foreign-key', source_card_id: '-999999', variant_id: null })
  await client.query('savepoint failed_apply')
  await assert.rejects(applyPlan(client, beforeFailure, brokenPlan, metadata, report(metadata, brokenPlan, snap, hash([]), 'integration', new Date().toISOString())))
  checks++
  await client.query('rollback to savepoint failed_apply')
  check(await readState(client), beforeFailure)
  check((await client.query('select count(*) from private.catalog_sync_runs')).rows, runCount.rows)
  check(await userState(), userBefore)
  console.log(`Catalogue integration: ${checks} assertions passed; all catalogue and user fixtures rolled back.`)
} finally { await client.query('rollback'); await client.end() }
