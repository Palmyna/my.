import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { StrictMode } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import { connect } from '../../scripts/catalog/database.ts'
import { announcement, cleanup, install, parent, users, type Client } from '../../scripts/notification-fixtures.ts'
import { AuthenticatedLayout } from '../app/AuthenticatedLayout'
import { CollectionPage } from '../features/collections/CollectionPage'
import { notificationCenterKey, notificationUnreadCountKey } from '../features/notifications/notification-query'
import type { NotificationCenter } from '../types/notifications'

const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }))
vi.mock('./supabase', () => ({ getSupabaseClient: () => context.client }))
vi.mock('../features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'a2500000-0000-0000-0000-000000000001' },
  isAuthorized: true, actions: { signOut: vi.fn() } }) }))

// Exact real rows before installation and after cleanup, including the personal
// collections/items/copies/intents/receipts and the notification storage.
async function snapshot(db: Client) {
  const tables = (await db.query<{ schemaname: string; tablename: string }>(
    "select schemaname,tablename from pg_tables where schemaname in ('public','private') order by schemaname,tablename")).rows
  const rows = new Map<string, string>()
  for (const { schemaname, tablename } of tables) {
    const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"'
    rows.set(`${schemaname}.${tablename}`, (await db.query<{ data: string }>(
      `select coalesce(jsonb_agg(row order by row::text),'[]'::jsonb)::text data from
       (select to_jsonb(t) row from ${identifier(schemaname)}.${identifier(tablename)} t) s`)).rows[0]!.data)
  }
  return rows
}

describe.skipIf(process.env.MY_SUPABASE_LOCAL_TEST !== '1')('8H.2 React → SDK → Local PostgREST', () => {
  test.each(['bell', 'menu', 'uncertain recovery'] as const)('%s: manual read, content/process, preview/read and confirmed apply refresh', async scenario => {
    const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
      execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
    expect(settings.API_URL).toBe('http://127.0.0.1:55321')
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: users[0], role: 'authenticated', aal: 'aal2', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`
    const jwt = `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
    const trace: { rpc: string; status: number; request: Record<string, unknown> }[] = []
    let blocked = scenario === 'uncertain recovery', committed = false
    context.client = createClient<Database>(settings.API_URL, settings.ANON_KEY, { accessToken: () => Promise.resolve(jwt),
      global: { fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, rpc = url.split('/').pop()!
        if (blocked && committed && rpc === 'get_collection_operation_result') throw new TypeError('Synthetic receipt unavailable')
        const response = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) })
        trace.push({ rpc, status: response.status, request: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {} })
        if (rpc === 'apply_collection_update' && response.ok) {
          committed = true
          if (blocked) throw new TypeError('Synthetic lost response AFTER real SQL commit')
        }
        return response
      } } })
    const db = await connect(), cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }), viewer = users[0]!
    let installed = false, mounted: ReturnType<typeof render> | undefined
    const baseline = await snapshot(db)
    const bell = () => screen.getByRole('button', { name: /^Notifications —/ })
    try {
      await db.query('select pg_advisory_lock(830011)')
      await install(db); installed = true
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
      await db.query(readFileSync('supabase/tests/database/collection_update_apply.fixtures.inc', 'utf8')); await db.query('commit')
      HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
      HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
      sessionStorage.clear()
      mounted = render(<StrictMode><QueryClientProvider client={cache}><MemoryRouter initialEntries={[scenario === 'bell' ? '/dashboard' : `/collections/${parent()}`]}>
        <Routes><Route element={<AuthenticatedLayout />}><Route path="/dashboard" element={<h1>Dashboard</h1>} />
          <Route path="/collections/:collectionId" element={<CollectionPage />} /></Route></Routes>
      </MemoryRouter></QueryClientProvider></StrictMode>)
      await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications — 5 non lues'))
      fireEvent.click(bell()); const list = await screen.findByRole('list', { name: 'Notifications actives' })
      const collection = within(list).getByRole('button', { name: 'Voir la mise à jour' }).closest('li')!
      fireEvent.click(within(collection).getByRole('button', { name: 'Marquer comme lue' }))
      await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications — 4 non lues'))
      expect(trace.some(call => /process_announcement|preview_collection_update|apply_collection_update/.test(call.rpc))).toBe(false)
      const changelog = within(list).getByText('Synthetic notification 2').closest('li')!
      fireEvent.click(within(changelog).getByRole('button', { name: 'Lire' }))
      await screen.findByText('Consultation enregistrée.')
      expect(document.querySelector('.notification-body')?.textContent).toBe('Plain text <script>alert(1)</script> javascript:example')
      expect(document.querySelector('.notification-body script')).toBeNull()
      await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications — 3 non lues'))
      expect(trace.filter(call => call.rpc === 'process_announcement_notification')).toHaveLength(1)
      expect(trace.find(call => call.rpc === 'process_announcement_notification')?.request).toEqual({ p_announcement_id: announcement(2), p_observed_hash: 'a'.repeat(64) })
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
      if (scenario === 'bell') fireEvent.click(screen.getByRole('button', { name: 'Voir la mise à jour' }))
      else {
        fireEvent.click(screen.getByRole('button', { name: 'Fermer les notifications' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Actions de la collection' }))
        fireEvent.click(screen.getByRole('button', { name: 'Vérifier les mises à jour' }))
      }
      const confirm = await screen.findByRole('button', { name: 'Mettre à jour la collection' })
      await waitFor(() => expect(trace.filter(call => call.rpc === 'mark_notification_read')).toHaveLength(2))
      expect(trace.filter(call => call.rpc === 'mark_notification_read').map(call => call.request)).toEqual([
        { p_notification_key: `collection:${parent()}`, p_observed_revision: '8' },
        { p_notification_key: `collection:${parent()}`, p_observed_revision: '8' },
      ])
      expect(trace.some(call => call.rpc === 'apply_collection_update')).toBe(false)
      fireEvent.click(confirm)
      if (scenario === 'uncertain recovery') {
        await screen.findByRole('button', { name: 'Vérifier le résultat' })
        expect(sessionStorage.length).toBe(1)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier le résultat' })).toBeEnabled(), { timeout: 5_000 })
        blocked = false
        fireEvent.click(screen.getByRole('button', { name: 'Vérifier le résultat' }))
      }
      await screen.findByText(/Opération confirmée/, {}, { timeout: 5_000 })
      expect(trace.filter(call => call.rpc === 'apply_collection_update')).toHaveLength(1)
      if (scenario === 'uncertain recovery') {
        const written = trace.find(call => call.rpc === 'apply_collection_update')!.request
        expect(trace.find(call => call.rpc === 'get_collection_operation_result')?.request.p_operation_id).toBe(written.p_operation_id)
      }
      expect(sessionStorage.length).toBe(0)
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); fireEvent.click(bell())
      await waitFor(() => expect(cache.getQueryData<NotificationCenter>(notificationCenterKey(viewer))?.items.some(item => item.kind === 'collection_update')).toBe(false))
      expect(screen.queryByRole('button', { name: 'Voir la mise à jour' })).toBeNull()
      expect(cache.getQueryData(notificationUnreadCountKey(viewer))).toEqual({ unreadCount: '3' })
      expect((await db.query<{ version: string }>('select read_target_version::text version from private.collection_notification_reads where collection_id=$1', [parent()])).rows).toEqual([{ version: '8' }])
    } finally {
      mounted?.unmount(); cache.clear(); context.client = null; sessionStorage.clear(); await db.query('rollback')
      try {
        if (installed) await cleanup(db)
        expect(await snapshot(db)).toEqual(baseline)
      } finally { await db.end() }
    }
  }, 30_000)
})
