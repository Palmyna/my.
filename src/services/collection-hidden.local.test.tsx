import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { CollectionContentItemV2 } from '../types/collection-content'
import { connect } from '../../scripts/catalog/database.ts'
import { cleanup, install, item, operation, parent, state, users } from '../../scripts/collection-hidden-fixtures.ts'
import { createCollectionItemsService } from './collection-items'
import { createCollectionContentService } from './collection-content'
import { createCollectionsService } from './collections'
import { useCollectionStructureMutation } from '../features/collections/useCollectionStructureMutation'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from '../features/collections/collection-query'
import { dashboardCollectionsKey } from '../features/dashboard/dashboard-query'

// Opt-in only: real Local PostgreSQL/PostgREST, committed synthetic fixtures.
// Ordinary frontend runs remain independent of a running Local installation.
const context = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null,
  auth: { user: { id: 'a2500000-0000-0000-0000-000000000001' }, isAuthorized: true } }))
vi.mock('./supabase', () => ({ getSupabaseClient: () => context.client }))
vi.mock('../features/auth/auth-context', () => ({ useAuth: () => context.auth }))

describe.skipIf(process.env.MY_SUPABASE_LOCAL_TEST !== '1')('8C real Local services/hooks/PostgREST', () => {
  test('masking lifecycle, authoritative progression, uncertainty, HTTP conflicts and security', async () => {
    const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
      execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
    expect(settings.API_URL).toBe('http://127.0.0.1:55321')
    const token = (user: string, aal: string) => {
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, role: 'authenticated', aud: 'authenticated', aal, exp: Math.floor(Date.now() / 1000) + 600 })}`
      return `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
    }
    const trace: { url: string; body: string | null; status: number }[] = []
    let loseResponse = false
    const client = (user = users[0]!, aal = 'aal2') => createClient<Database>(settings.API_URL, settings.ANON_KEY, {
      accessToken: () => Promise.resolve(token(user, aal)),
      global: { fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const response = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) })
        trace.push({ url, body: typeof init?.body === 'string' ? init.body : null, status: response.status })
        if (loseResponse && url.endsWith('/rpc/set_collection_item_hidden') && response.ok) {
          loseResponse = false; throw new TypeError('Synthetic response loss after actual HTTP commit')
        }
        return response
      } },
    })
    const db = await connect()
    let installed = false
    const owner = client(), recipient = client(users[1]), items = createCollectionItemsService(owner)
    const content = createCollectionContentService(owner), summaries = createCollectionsService(owner)
    const shared = createCollectionsService(recipient)
    context.client = owner
    const op = (revision: string, id: string = randomUUID()) => ({ orderContractVersion: 2 as const, expectedRevision: revision, operationId: id })
    async function progress(ownedCount: number, totalCount: number) {
      for (const service of [summaries, shared]) {
        expect(await service.getCollectionOverview(parent())).toMatchObject({ ownedCount, totalCount })
        expect((await service.listDashboardCollections()).find(c => c.collectionId === parent())).toMatchObject({ ownedCount, totalCount })
      }
    }
    let unmount: (() => void) | undefined
    try {
      await install(db); installed = true
      const original = await content.getCollectionContentV2(parent())
      const order = await items.listOrder(parent())
      await progress(2, 5)
      const first = op('2', operation(800))
      const changed = await items.setHidden(parent(), item(1), true, first)
      expect(changed).toMatchObject({ outcome: 'changed', personalRevision: '3', collectionItemId: item(1) })
      expect(await items.setHidden(parent(), item(1), true, first)).toEqual(changed)
      expect(await items.setHidden(parent(), item(1), true, op('3'))).toMatchObject({ outcome: 'noop', personalRevision: '3' })
      await progress(1, 4)
      const raw = await owner.rpc('get_collection_content_v2', { p_collection_id: parent() })
      const shape = z.object({ order_contract_version: z.number(), personal_revision: z.string(), items: z.array(z.record(z.string(), z.unknown())) }).parse(raw.data)
      expect(Object.keys(shape).sort()).toEqual(['items', 'order_contract_version', 'personal_revision'])
      for (const entry of shape.items) expect(Object.keys(entry)).toHaveLength(16)
      const hiddenContent = await content.getCollectionContentV2(parent())
      expect(hiddenContent.items[0]).toMatchObject({ isHidden: true, owned: true })
      const legacyItem = ({ isHidden, ...entry }: CollectionContentItemV2) => { expect(typeof isHidden).toBe('boolean'); return entry }
      expect(hiddenContent.items.map(legacyItem)).toEqual(original.items.map(legacyItem))
      expect(await content.getCollectionContent(parent())).toEqual(original.items.map(legacyItem))
      expect(await items.listOrder(parent())).toEqual(order)
      expect(await createCollectionContentService(recipient).getCollectionContentV2(parent())).toEqual(hiddenContent)
      const stable = await state(db)
      const start = Date.now()
      await expect(items.setHidden(parent(), item(3), true, op('2'))).rejects.toHaveProperty('code', 'collection_structure_conflict')
      expect(Date.now() - start).toBeLessThan(3000)
      expect(trace.at(-1)?.status).toBe(409)
      const args = { p_collection_id: parent(), p_collection_item_id: item(3), p_is_hidden: true, p_expected_revision: 2, p_operation_id: randomUUID() }
      const stale = await owner.rpc('set_collection_item_hidden', args)
      expect(stale.status).toBe(409)
      expect(stale.error).toMatchObject({ code: '40001', message: 'collection_structure_conflict' })
      await expect(items.setHidden(parent(), item(1), false, first)).rejects.toHaveProperty('code', 'operation_id_conflict')
      expect(await state(db)).toEqual(stable)

      // Only Auth context/client factory replaced. Real hook, services, SDK,
      // QueryClient, HTTP, RLS, receipt and authoritative rereads all exercised.
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      const hook = renderHook(() => {
        const read = useQuery({ queryKey: collectionContentKey(users[0], parent()), queryFn: () => content.getCollectionContentV2(parent()) })
        useQuery({ queryKey: collectionItemOrderKey(users[0], parent()), queryFn: () => items.listOrder(parent()) })
        useQuery({ queryKey: collectionOverviewKey(users[0], parent()), queryFn: () => summaries.getCollectionOverview(parent()) })
        useQuery({ queryKey: dashboardCollectionsKey(users[0]), queryFn: () => summaries.listDashboardCollections() })
        return { ...useCollectionStructureMutation(users[0]!, parent()), ready: read.isSuccess && !read.isFetching }
      }, { wrapper })
      unmount = hook.unmount
      await waitFor(() => expect(hook.result.current.ready).toBe(true))
      loseResponse = true
      const writeCount = trace.filter(t => t.url.endsWith('/rpc/set_collection_item_hidden')).length
      await act(async () => {
        expect(await hook.result.current.submit({ type: 'hide', collectionItemId: item(3), isHidden: true })).toBe(true)
      })
      expect(trace.filter(t => t.url.endsWith('/rpc/set_collection_item_hidden'))).toHaveLength(writeCount + 1)
      expect(trace.some(t => t.url.endsWith('/rpc/get_collection_operation_result') && t.status === 200)).toBe(true)
      expect(cache.getQueryData(collectionOverviewKey(users[0], parent()))).toMatchObject({ ownedCount: 1, totalCount: 3 })
      expect(cache.getQueryData(collectionContentKey(users[0], parent()))).toMatchObject({ personalRevision: '4' })
      expect(sessionStorage.length).toBe(0)
      await progress(1, 3)
      await items.setHidden(parent(), item(5), true, op('4'))
      await progress(1, 2)
      await items.remove(parent(), item(2), op('5'))
      await items.remove(parent(), item(4), op('6'))
      await progress(0, 0)
      expect((await content.getCollectionContentV2(parent())).items).toHaveLength(3)
      expect(await items.setHidden(parent(), item(1), true, first)).toEqual(changed)
      expect(await items.operationResult(parent(), first.operationId)).toEqual(changed)
      await items.setHidden(parent(), item(1), false, op('7'))
      await progress(1, 1)
      const protectedState = await state(db)
      for (const forbidden of [client(users[1]), client(users[2]), client(users[3]), client(users[0], 'aal1')]) {
        await expect(createCollectionItemsService(forbidden).setHidden(parent(), item(1), true, op('8'))).rejects.toHaveProperty('code', 'collection_action_unavailable')
        await expect(createCollectionItemsService(forbidden).operationResult(parent(), first.operationId)).rejects.toHaveProperty('code', 'collection_action_unavailable')
      }
      const anon = createClient<Database>(settings.API_URL, settings.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      expect((await anon.rpc('set_collection_item_hidden', { ...args, p_expected_revision: 8 })).error?.code).toBe('42501')
      expect((await owner.from('collection_items').update({ is_hidden: true }).eq('id', item(1))).error?.code).toBe('42501')
      await expect(items.setHidden(parent(2), item(6), true, op('1'))).rejects.toHaveProperty('code', 'collection_item_hidden_invalid')
      await expect(items.setHidden(parent(8), item(8), true, op('0'))).rejects.toHaveProperty('code', 'order_contract_upgrade_required')
      await expect(items.setHidden(parent(99), item(1), true, op('8'))).rejects.toHaveProperty('code', 'collection_action_unavailable')
      expect(await state(db)).toEqual(protectedState)
      await db.query('delete from public.collection_shares where collection_id=$1', [parent()])
      await expect(shared.getCollectionOverview(parent())).rejects.toHaveProperty('code', 'collection_unavailable')
      await expect(createCollectionContentService(recipient).getCollectionContentV2(parent())).rejects.toHaveProperty('code', 'collection_unavailable')
      expect((await content.getCollectionContentV2(parent(4))).items).toEqual([])
    } finally {
      unmount?.(); context.client = null
      try { await db.query('rollback'); if (installed) await cleanup(db) }
      finally { await db.end() }
    }
  }, 45_000)
})
