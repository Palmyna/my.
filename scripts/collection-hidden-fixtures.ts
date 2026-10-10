import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { connect } from './catalog/database.ts'

export type Client = Awaited<ReturnType<typeof connect>>
export const parent = (n = 1) => `c2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
export const item = (n: number) => `d2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
export const operation = (n: number) => `e2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
export const users = [1, 2, 3, 4].map(n => `a2500000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const parents = Array.from({ length: 8 }, (_, n) => parent(n + 1))
export type Result = { operation_id: string; outcome: 'changed' | 'noop'; personal_revision: string; collection_item_id: string }

export async function fixtureCount(db: Client) {
  return (await db.query<{ n: number }>(`select (
    (select count(*) from auth.users where id=any($1::uuid[])) +
    (select count(*) from public.profiles where id=any($1::uuid[])) +
    (select count(*) from public.collections where id=any($2::uuid[])) +
    (select count(*) from public.collection_items where collection_id=any($2::uuid[])) +
    (select count(*) from private.collection_order_intents where collection_id=any($2::uuid[])) +
    (select count(*) from private.collection_operation_receipts where collection_id=any($2::uuid[])) +
    (select count(*) from public.catalog_variants where id between -95021 and -95001 or id=9007199254740997) +
    (select count(*) from public.source_cards where id in(-95001,-95002,-95003,-95004)) +
    (select count(*) from public.tcg_sets where id in(-95001,-95002,-95003)) +
    (select count(*) from public.tcg_series where id=-95001) +
    (select count(*) from public.automatic_target_states where id=-95001))::int n`, [users, parents])).rows[0]!.n
}
export async function install(db: Client) {
  assert.equal(await fixtureCount(db), 0, 'Reserved synthetic identities must be unused')
  await db.query('begin')
  for (const name of ['relative_order_writer', 'manual_collection_items_v2', 'collection_hidden']) {
    await db.query(readFileSync(resolve('supabase/tests/database', `${name}.fixtures.inc`), 'utf8'))
  }
  await db.query('commit')
}
export async function cleanup(db: Client) {
  await db.query('begin')
  await db.query('delete from public.collections where id=any($1::uuid[])', [parents])
  await db.query('delete from auth.users where id=any($1::uuid[])', [users])
  await db.query('delete from public.automatic_target_states where id=-95001')
  await db.query('delete from public.catalog_variants where id between -95021 and -95001 or id=9007199254740997')
  await db.query('delete from public.source_cards where id in(-95001,-95002,-95003,-95004)')
  await db.query('delete from public.tcg_sets where id in(-95001,-95002,-95003)')
  await db.query('delete from public.tcg_series where id=-95001')
  await db.query('commit')
  assert.equal(await fixtureCount(db), 0, 'No synthetic residue')
}
export async function state(db: Client, collection = parent()) {
  return (await db.query<{ data: unknown }>(`select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=$1),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=$1),
    'intents',(select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=$1),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=$1)) data`, [collection])).rows[0]!.data
}
