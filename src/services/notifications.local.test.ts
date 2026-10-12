import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import { connect } from '../../scripts/catalog/database.ts'
import { announcement, cleanup, install, parent, target, users } from '../../scripts/notification-fixtures.ts'
import { createNotificationService } from './notifications'
import { notificationCenterOptions, notificationUnreadCountOptions, notificationReadMutationOptions,
  announcementProcessMutationOptions, notificationCenterKey, notificationUnreadCountKey, notificationContentKey } from '../features/notifications/notification-query'
const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }))
vi.mock('./supabase', () => ({ getSupabaseClient: () => context.client }))

describe.skipIf(process.env.MY_SUPABASE_LOCAL_TEST !== '1')('8G.2 services → SDK → real Local PostgREST', () => {
  test('five RPCs, concordance, audience, transitions, ACL and cache invalidation', async () => {
    const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
      execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js','status','-o','json'],
        { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], windowsHide: true })))
    expect(settings.API_URL).toBe('http://127.0.0.1:55321')
    const trace: { name: string; status: number }[] = []
    function client(user: string | null, aal = 'aal2') {
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, role: 'authenticated', aal, aud: 'authenticated', exp: Math.floor(Date.now()/1000)+600 })}`
      const token = user === null ? settings.ANON_KEY : `${body}.${createHmac('sha256',settings.JWT_SECRET).update(body).digest('base64url')}`
      return createClient<Database>(settings.API_URL,settings.ANON_KEY,{ accessToken: () => Promise.resolve(token),
        global: { fetch: async (input,init) => {
          const response = await fetch(input,{ ...init, signal: AbortSignal.timeout(10_000) })
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
          trace.push({ name: url.split('/').pop()!, status: response.status }); return response
        } } })
    }
    const db = await connect(), cache = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    let installed = false
    try {
      await db.query('select pg_advisory_lock(830011)')
      await install(db); installed = true
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
      await target(db,['-95005','-95003','-95001'],'8'); await db.query('commit')
      context.client = client(users[0]!)
      const service = createNotificationService(context.client)
      const viewer = users[0]!
      const first = await cache.fetchQuery(notificationCenterOptions(viewer,{ limit: 2 }))
      expect(first.items[0]?.kind).toBe('collection_update'); expect(first.unreadCount).toBe('5')
      expect(await cache.fetchQuery(notificationUnreadCountOptions(viewer))).toEqual({ unreadCount: first.unreadCount })
      const second = await service.getNotificationCenter({ limit: 2, cursor: first.nextCursor })
      const last = await service.getNotificationCenter({ limit: 2, cursor: second.nextCursor })
      expect([...first.items,...second.items,...last.items].map(item => item.kind)).toEqual(['collection_update','announcement','changelog','announcement','announcement'])
      expect(new Set([...first.items,...second.items,...last.items].map(item => item.notificationKey)).size).toBe(5)
      expect(second.unreadCount).toBe('5'); expect(last.unreadCount).toBe('5'); expect(last.nextCursor).toBeNull()
      expect((await service.getNotificationContent(announcement(2)))?.body).toBe('Plain text <script>alert(1)</script> javascript:example')
      expect((await db.query<{ n: number }>('select count(*)::int n from private.notification_announcement_states')).rows[0]!.n).toBe(0)
      expect((await db.query<{ n: number }>('select count(*)::int n from private.collection_notification_reads')).rows[0]!.n).toBe(0)
      cache.setQueryData(notificationCenterKey(viewer),first)
      cache.setQueryData(notificationContentKey(viewer,announcement(2)),{})
      const observed = { notificationKey: `collection:${parent()}`, observedRevision: '8' }
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
      await target(db,['-95005','-95003','-95001'],'9'); await db.query('commit')
      await cache.getMutationCache().build(cache,notificationReadMutationOptions(cache,viewer)).execute(observed)
      expect(cache.getQueryState(notificationCenterKey(viewer))?.isInvalidated).toBe(true)
      expect(cache.getQueryState(notificationUnreadCountKey(viewer))?.isInvalidated).toBe(true)
      expect((await service.getNotificationCenter()).items.find(item => item.kind==='collection_update')).toMatchObject({ revision: '9', state: 'unread' })
      await cache.getMutationCache().build(cache,announcementProcessMutationOptions(cache,viewer)).execute({ announcementId: announcement(2), observedHash: 'a'.repeat(64) })
      expect(cache.getQueryState(notificationContentKey(viewer,announcement(2)))?.isInvalidated).toBe(true)
      expect(await service.getNotificationContent(announcement(2))).toBeNull()
      expect(await service.getNotificationUnreadCount()).toEqual({ unreadCount: '4' })
      const saved = (await db.query('select * from private.notification_announcement_states where user_id=$1 and announcement_id=$2',[viewer,announcement(2)])).rows
      expect(await service.processAnnouncementNotification({ announcementId: announcement(2), observedHash: 'a'.repeat(64) })).toEqual({ outcome: 'recorded' })
      expect((await db.query('select * from private.notification_announcement_states where user_id=$1 and announcement_id=$2',[viewer,announcement(2)])).rows).toEqual(saved)
      await expect(service.processAnnouncementNotification({ announcementId: announcement(3), observedHash: 'a'.repeat(64) })).rejects.toHaveProperty('code','action_unresolved')
      const newcomer = createNotificationService(client(users[1]!))
      expect(await newcomer.getNotificationUnreadCount()).toEqual({ unreadCount: '1' })
      expect(await newcomer.getNotificationContent(announcement(1))).toBeNull()
      expect(await newcomer.markNotificationRead(observed)).toEqual({ outcome: 'obsolete' })
      const third = createNotificationService(client(users[2]!))
      expect((await third.getNotificationCenter()).items.every(item => item.kind !== 'collection_update')).toBe(true)
      for (const blocked of [client(users[0]!,'aal1'),client(users[3]!),client(null)]) {
        const denied = createNotificationService(blocked)
        for (const operation of [() => denied.getNotificationCenter(), () => denied.getNotificationUnreadCount(), () => denied.getNotificationContent(announcement(1)),
          () => denied.markNotificationRead(observed), () => denied.processAnnouncementNotification({ announcementId: announcement(1), observedHash: 'a'.repeat(64) })]) {
          await expect(operation()).rejects.toHaveProperty('code','not_authorized')
        }
      }
      const response = await fetch(`${settings.API_URL}/rest/v1/notification_announcements`,{ headers: { apikey: settings.ANON_KEY,
        Authorization: `Bearer ${settings.ANON_KEY}`, 'Accept-Profile': 'private' } })
      expect(response.status).toBe(406)
      expect(trace.filter(call => call.status===401)).toHaveLength(5)
      expect(trace.filter(call => call.status===403)).toHaveLength(11)
      for (const name of ['get_notification_center','get_notification_unread_count','get_notification_content','mark_notification_read','process_announcement_notification']) {
        expect(trace.some(call => call.name===name && call.status===200)).toBe(true)
      }
    } finally {
      cache.clear(); context.client = null; await db.query('rollback')
      if (installed) await cleanup(db)
      await db.end()
    }
  },30_000)
})
