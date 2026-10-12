import { QueryClient,QueryClientProvider,useQuery } from '@tanstack/react-query'
import { act,renderHook } from '@testing-library/react'
import { expect,test,vi } from 'vitest'
import { collectionUpdatePreviewOptions,collectionUpdateStatusOptions,invalidateCollectionUpdateQueries } from './collection-update-query'
import { collectionUpdatePreviewKey,collectionUpdateStatusKey } from './collection-query'
import { previewCollectionUpdate,getCollectionUpdateStatus } from '../../services/collection-update'
vi.mock('../../services/collection-update',async importOriginal=>({ ...await importOriginal<object>(),previewCollectionUpdate:vi.fn(),getCollectionUpdateStatus:vi.fn() }))
test('mount/focus/invalidation do not fetch; explicit refetch only',async()=>{
  vi.mocked(previewCollectionUpdate).mockResolvedValue({} as Awaited<ReturnType<typeof previewCollectionUpdate>>)
  const client=new QueryClient(),options=collectionUpdatePreviewOptions('viewer','parent')
  const hook=renderHook(()=>({ ...useQuery(options) }),{ wrapper:({ children })=><QueryClientProvider client={client}>{children}</QueryClientProvider> })
  expect(previewCollectionUpdate).not.toHaveBeenCalled()
  await act(()=>invalidateCollectionUpdateQueries(client,'viewer','parent'))
  expect(previewCollectionUpdate).not.toHaveBeenCalled()
  await act(()=>hook.result.current.refetch())
  expect(previewCollectionUpdate).toHaveBeenCalledExactlyOnceWith('parent')
  expect(getCollectionUpdateStatus).not.toHaveBeenCalled()
  hook.unmount();client.clear()
})
test('targeted invalidation marks both stale, no read, other viewer/parent intact',async()=>{
  const client=new QueryClient()
  for (const key of [collectionUpdatePreviewKey('v','p'),collectionUpdateStatusKey('v','p'),collectionUpdatePreviewKey('other','p'),collectionUpdatePreviewKey('v','other')]) client.setQueryData(key,{})
  await invalidateCollectionUpdateQueries(client,'v','p')
  expect(client.getQueryState(collectionUpdatePreviewKey('v','p'))!.isInvalidated).toBe(true)
  expect(client.getQueryState(collectionUpdateStatusKey('v','p'))!.isInvalidated).toBe(true)
  expect(client.getQueryState(collectionUpdatePreviewKey('other','p'))!.isInvalidated).toBe(false)
  expect(client.getQueryState(collectionUpdatePreviewKey('v','other'))!.isInvalidated).toBe(false)
  expect(collectionUpdateStatusOptions('v','p')).toMatchObject({ enabled:false,retry:false,refetchInterval:false,refetchOnWindowFocus:false })
  client.clear()
})
