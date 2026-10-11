import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanup as cleanupCollections, install as installCollections, type Client } from './collection-update-fixtures.ts'
export { parent, target, users, type Client } from './collection-update-fixtures.ts'
export const announcement = (n = 1) => `f3600000-0000-0000-0000-${String(n).padStart(12,'0')}`
const identities = Array.from({ length: 99 }, (_, n) => announcement(n + 1))
export async function install(db: Client) {
  assert.equal((await db.query<{ n: number }>('select count(*)::int n from private.notification_announcements where id=any($1::uuid[])',[identities])).rows[0]!.n,0,
    'Reserved synthetic announcements must be unused')
  await installCollections(db)
  try {
    await db.query('begin')
    await db.query(readFileSync('supabase/tests/database/notification_api.fixtures.inc','utf8').replace(/^\\ir .*$/gm,''))
    await db.query('commit')
  } catch (error) { await db.query('rollback'); await cleanupCollections(db); throw error }
}
export async function cleanup(db: Client) {
  await db.query('delete from private.notification_announcements where id=any($1::uuid[])',[identities])
  await cleanupCollections(db)
  assert.equal((await db.query<{ n: number }>('select count(*)::int n from private.notification_announcements where id=any($1::uuid[])',[identities])).rows[0]!.n,0)
}
