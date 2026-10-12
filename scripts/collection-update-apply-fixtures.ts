import { readFileSync } from 'node:fs'
import { install as installUpdate, cleanup as cleanupUpdate, type Client } from './collection-update-fixtures.ts'
export { parent, item, operation, users, state, target, type Client } from './collection-update-fixtures.ts'

export type Token = {
  contract_version: number; applied_target_version: string; target_version: string
  target_hash: string; personal_revision: string; plan_hash: string
}
export type Entry = {
  collection_item_id: string | null; variant_id: string; origin: string
  automatic_rank: string | null; is_hidden: boolean
}
export type Plan = { token: Token; final_order: Entry[] }
export type Result = {
  operation_id: string; outcome: 'applied'; personal_revision: string; applied_target_version: string
  created_items: { variant_id: string; collection_item_id: string }[]
}

export async function install(db: Client) {
  // Reuse 8E's reserved fixtures and cleanup. Serialize with real catalogue sync
  // during installation, without entering any user collection writer.
  await db.query('select pg_advisory_lock(771402)')
  try {
    await installUpdate(db)
    try {
      await db.query('begin')
      await db.query(readFileSync('supabase/tests/database/collection_update_apply.fixtures.inc', 'utf8'))
      await db.query('commit')
    } catch (error) {
      await db.query('rollback'); await cleanupUpdate(db); throw error
    }
  } finally { await db.query('select pg_advisory_unlock(771402)') }
}
export async function cleanup(db: Client) {
  await db.query('select pg_advisory_lock(771402)')
  try { await cleanupUpdate(db) } finally { await db.query('select pg_advisory_unlock(771402)') }
}
