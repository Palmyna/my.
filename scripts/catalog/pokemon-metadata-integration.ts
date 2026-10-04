import assert from 'node:assert/strict'
import path from 'node:path'
import { connect, readState } from './database.ts'
import { loadPokemonReference, parsePokemonReference, serializePokemonReference } from './pokemon-reference.ts'
import { lockCache, snapshot } from './snapshot.ts'
import { normalize, validateCatalogue } from './normalize.ts'
import { readSource } from './reader.ts'
import { applyOverrides, loadOverrides } from './overrides.ts'
import { includeOverrideHistory, makePlan } from './plan.ts'
import { applyPlan } from './apply.ts'
import { report } from './report.ts'
import { hash } from './model.ts'

/** Populated local DB proof: type-only apply and idempotence, always rolled back. */
const unlock = lockCache()
try {
  const client = await connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(771402)')
    const latest = (await client.query<{ source_sha: string }>(
      "select source_sha from private.catalog_sync_runs where status='success' order by finished_at desc limit 1")).rows[0]
    assert.ok(latest, 'A successful local catalogue import is required; never resolve remote HEAD')
    const source = snapshot(latest.source_sha), reference = loadPokemonReference(), overrides = loadOverrides(path.resolve('data/catalog-overrides'))
    const before = await readState(client)
    const catalogue = applyOverrides(includeOverrideHistory(normalize(readSource(source.directory)), before, overrides.values), overrides.values)
    validateCatalogue(catalogue)
    const baseline = makePlan(catalogue, before, reference)
    assert.deepEqual(Object.values(baseline.writes).flat(), [], 'Current snapshot/reference must already be synchronized')
    const entries = structuredClone(reference.entries), target = before.rows.pokemon.find(row => entries[String(row.dex_number)])
    assert.ok(target, 'A referenced Pokemon is required')
    const entry = entries[String(target.dex_number)]!
    entry.types = [entry.types[0] === 'water' ? 'fire' : 'water']
    const changedReference = parsePokemonReference(serializePokemonReference(entries))
    const plan = makePlan(catalogue, before, changedReference)
    assert.notEqual(reference.hash, changedReference.hash)
    assert.equal(plan.writes.pokemon.length, 1)
    assert.equal(plan.writes.pokemon[0]?.name_fr, target.name_fr)
    assert.deepEqual(plan.structures, baseline.structures)
    assert.equal(plan.targets.changed, 0)
    assert.deepEqual(plan.mappingAdds, []); assert.deepEqual(plan.mappingRemoves, [])
    assert.deepEqual(Object.entries(plan.writes).filter(([table]) => table !== 'pokemon').flatMap(([, rows]) => rows), [])
    const users = async () => hash((await client.query(`select
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.profiles x) profiles,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.user_preferences x) preferences,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.collection_view_preferences x) view_preferences,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.collections x) collections,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.collection_items x) items,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.physical_copies x) copies,
      (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text collate "C") from public.collection_shares x) shares`)).rows)
    const userBefore = await users()
    const canonical = async () => hash((await client.query(`select target.id, ordered.variant_id, ordered.automatic_rank
      from public.automatic_target_states target cross join lateral
        private.canonical_collection_variants(target.target_type,coalesce(target.pokemon_id,target.set_id)) ordered
      order by target.id, ordered.automatic_rank`)).rows)
    const canonicalBefore = await canonical()
    await applyPlan(client, before, plan, catalogue, report(catalogue, plan, source, overrides.hash, 'integration', new Date().toISOString()))
    const after = await readState(client)
    for (const [table, rows] of Object.entries(before.rows)) if (table !== 'pokemon') assert.deepEqual(after.rows[table as keyof typeof after.rows], rows)
    assert.deepEqual(after.mappings, before.mappings); assert.deepEqual(after.aliases, before.aliases); assert.deepEqual(after.next, before.next)
    assert.equal(await canonical(), canonicalBefore)
    assert.equal(await users(), userBefore)
    assert.deepEqual(Object.values(makePlan(catalogue, after, changedReference).writes).flat(), [])
    console.log(`PASS type-only pipeline apply: 1 Pokemon metadata change; ${before.rows.automatic_target_states.length} structures/orders/hashes/versions, mappings, variants, sequences and user rows unchanged; retry noop. Transaction rolled back.`)
  } finally { try { await client.query('rollback') } finally { await client.end() } }
} finally { unlock() }
