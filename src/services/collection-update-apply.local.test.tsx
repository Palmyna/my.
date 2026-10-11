import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { CollectionUpdatePreview } from '../types/collection-update'
import { connect } from '../../scripts/catalog/database.ts'
import { cleanup, install, parent, users } from '../../scripts/collection-update-apply-fixtures.ts'
import { getCollectionContentV2 } from './collection-content'
import { getCollectionOverview, listDashboardCollections } from './collections'
import { listCollectionItemOrder } from './collection-items'
import { CollectionActions } from '../features/collections/CollectionActions'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionUpdatePreviewKey } from '../features/collections/collection-query'
import { dashboardCollectionsKey } from '../features/dashboard/dashboard-query'

const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }))
vi.mock('./supabase', () => ({ getSupabaseClient: () => context.client }))
vi.mock('../features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'a2500000-0000-0000-0000-000000000001' }, isAuthorized: true }) }))

describe.skipIf(process.env.MY_SUPABASE_LOCAL_TEST !== '1')('8F.3 real React → SDK → PostgREST → PostgreSQL', () => {
  test.each(['normal', 'lost response and reload', 'reread failure and reload'] as const)('%s', async scenario => {
    const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
      execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
    expect(settings.API_URL).toBe('http://127.0.0.1:55321')
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: users[0], role: 'authenticated', aal: 'aal2', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`
    const jwt = `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
    const trace: { rpc: string; status: number; request: unknown }[] = []
    let committed = false, blocked = scenario !== 'normal'
    context.client = createClient<Database>(settings.API_URL, settings.ANON_KEY, { accessToken: () => Promise.resolve(jwt),
      global: { fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const rpc = url.split('/').pop()!
        if (blocked && committed && (rpc === 'get_collection_operation_result' && scenario === 'lost response and reload'
          || rpc === 'get_collection_content_v2' && scenario === 'reread failure and reload')) throw new TypeError('Synthetic read unavailable')
        const response = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) })
        trace.push({ rpc, status: response.status, request: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null })
        if (rpc === 'apply_collection_update' && response.ok) {
          committed = true
          if (blocked && scenario === 'lost response and reload') throw new TypeError('Synthetic response loss AFTER real SQL commit')
        }
        return response
      } } })
    const db = await connect()
    let installed = false, mounted: ReturnType<typeof render> | undefined
    let cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const viewer = users[0]!
    function Workspace() {
      useQuery({ queryKey: collectionContentKey(viewer, parent()), queryFn: () => getCollectionContentV2(parent()) })
      useQuery({ queryKey: collectionItemOrderKey(viewer, parent()), queryFn: () => listCollectionItemOrder(parent()) })
      useQuery({ queryKey: dashboardCollectionsKey(viewer), queryFn: listDashboardCollections })
      const overview = useQuery({ queryKey: collectionOverviewKey(viewer, parent()), queryFn: () => getCollectionOverview(parent()) })
      return overview.isSuccess ? <CollectionActions collection={overview.data} userId={viewer} unavailable={() => { throw new Error('Unexpected access loss') }} /> : null
    }
    const mount = () => render(<QueryClientProvider client={cache}><MemoryRouter><Workspace /></MemoryRouter></QueryClientProvider>)
    const open = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Actions de la collection' }))
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier les mises à jour' }))
    }
    try {
      sessionStorage.clear()
      HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
      HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
      await install(db); installed = true
      const saved = async (table: string) => (await db.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t where ${table.endsWith('physical_copies') ? 'user_id' : 'collection_id'}=$1 order by to_jsonb(t)::text`, [table.endsWith('physical_copies') ? viewer : parent()])).rows
      const copies = await saved('public.physical_copies'), intents = await saved('private.collection_order_intents')
      mounted = mount(); await screen.findByRole('button', { name: 'Actions de la collection' })
      expect(trace.some(call => /update_status|preview_collection_update|apply_collection_update/.test(call.rpc))).toBe(false)
      await open(); const confirm = await screen.findByRole('button', { name: 'Mettre à jour la collection' })
      const plan = cache.getQueryData<CollectionUpdatePreview>(collectionUpdatePreviewKey(viewer, parent()))!
      expect(plan.converted).toHaveLength(1); expect(plan.added).toHaveLength(1); expect(plan.removed).toHaveLength(1)
      expect(trace.filter(call => call.rpc === 'get_variant_detail')).toHaveLength(1)
      fireEvent.click(confirm); fireEvent.click(confirm)
      if (scenario !== 'normal') {
        await screen.findByRole('button', { name: 'Vérifier le résultat' })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier le résultat' })).toBeEnabled())
        expect(sessionStorage.length).toBe(1)
        expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!) as unknown).toMatchObject({ confirmed: scenario === 'reread failure and reload' })
        mounted.unmount(); cache.clear(); cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); blocked = false
        mounted = mount(); await open()
        const recover = await screen.findByRole('button', { name: 'Vérifier le résultat' })
        await waitFor(() => expect(recover).toBeEnabled()); fireEvent.click(recover)
      }
      await screen.findByText('Opération confirmée. Votre collection a été mise à jour et son contenu relu.')
      expect(trace.filter(call => call.rpc === 'apply_collection_update')).toHaveLength(1)
      expect(trace.filter(call => call.rpc === 'get_collection_update_status')).toHaveLength(1)
      expect(trace.filter(call => call.rpc === 'preview_collection_update')).toHaveLength(1)
      expect(sessionStorage.length).toBe(0)
      const actual = (await db.query(`select id collection_item_id,variant_id::text,origin,automatic_rank::text,is_hidden from public.collection_items where collection_id=$1 order by sort_position,id`, [parent()])).rows as { collection_item_id: string; variant_id: string; origin: string; automatic_rank: string | null; is_hidden: boolean }[]
      expect(actual.map(item => ({ variantId: item.variant_id, collectionItemId: plan.added.some(added => added.variantId === item.variant_id) ? null : item.collection_item_id,
        origin: item.origin, automaticRank: item.automatic_rank, isHidden: item.is_hidden }))).toEqual(plan.finalOrder)
      expect(await saved('public.physical_copies')).toEqual(copies); expect(await saved('private.collection_order_intents')).toEqual(intents)
      const authoritative = await getCollectionOverview(parent())
      expect(authoritative.totalCount).toBe(actual.filter(item => !item.is_hidden).length)
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); await open(); await screen.findByText(/Votre collection est à jour/)
    } finally {
      mounted?.unmount(); cache.clear(); context.client = null; sessionStorage.clear(); await db.query('rollback')
      if (installed) await cleanup(db)
      await db.end()
    }
  }, 30_000)
})
