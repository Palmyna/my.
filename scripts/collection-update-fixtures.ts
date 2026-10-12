import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { install as installHidden, cleanup as cleanupHidden, type Client } from './collection-hidden-fixtures.ts'
export { parent, item, operation, users, state, type Client } from './collection-hidden-fixtures.ts'

export async function install(db: Client) {
  assert.equal((await db.query<{ n:number }>('select count(*)::int n from public.automatic_target_states where id in(-95002,-95003)')).rows[0]!.n,0,
    'Additional reserved synthetic states must be unused')
  await installHidden(db)
  try {
    await db.query('begin')
    await db.query(readFileSync('supabase/tests/database/collection_update.fixtures.inc','utf8'))
    await db.query('commit')
  } catch (error) { await db.query('rollback'); await cleanupHidden(db); throw error }
}
export async function cleanup(db: Client) {
  await db.query('delete from public.automatic_target_states where id in(-95002,-95003)')
  await cleanupHidden(db)
}
export async function target(db: Client, ids: readonly string[], version: string) {
  await db.query(`update public.catalog_variants v set is_active=v.id=any($1::bigint[]),
    sort_order=coalesce(array_position($1::bigint[],v.id),99) where v.source_card_id=-95001`,[ids])
  await db.query(`update public.automatic_target_states set generation_version=$1::bigint,content_hash=(select
    encode(sha256(convert_to('[' || coalesce(string_agg(to_json(variant_id::text)::text,',' order by automatic_rank),'') || ']','UTF8')),'hex')
    from private.canonical_collection_variants('set',-95001)) where id=-95001`,[version])
}
