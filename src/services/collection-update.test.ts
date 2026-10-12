import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { CollectionUpdateError, createCollectionUpdateService, decodeCollectionUpdatePreview, decodeCollectionUpdateStatus,
  decodeCollectionUpdateToken, getCollectionUpdateStatus, previewCollectionUpdate } from './collection-update'
import { updateItem, updateParent, updatePreview, updateStatus, updateToken } from '../test/collection-update'
import { getSupabaseClient } from './supabase'
vi.mock('./supabase',() => ({ getSupabaseClient: vi.fn() }))
const setup = (data: unknown=updatePreview(),error: unknown=null) => {
  const rpc=vi.fn().mockResolvedValue({ data,error }),from=vi.fn()
  const client={ rpc,from } as unknown as SupabaseClient<Database>
  return { rpc,from,client,service: createCollectionUpdateService(client) }
}
test('exact versions/revision/variant and all six token fields',() => {
  const token=decodeCollectionUpdateToken(updateToken())
  expect(token).toEqual({ contractVersion: 1,appliedTargetVersion: '9007199254740997',targetVersion: '9007199254740998',
    targetHash: 'a'.repeat(64),personalRevision: '9007199254740999',planHash: 'b'.repeat(64) })
  const plan=decodeCollectionUpdatePreview(updatePreview())
  expect(plan.added[0]!.variantId).toBe('9007199254740997')
  expect(plan.converted[0]!.collectionItemId).toBe(updateItem(3))
  expect(plan.finalOrder.map(item=>item.variantId)).toEqual(['3','1','9007199254740997','4'])
  expect(plan.finalOrder[1]!.isHidden).toBe(true)
})
test.each([1,2])('status accepts actual contract %s without upgrading',version => {
  expect(decodeCollectionUpdateStatus({ ...updateStatus(),order_contract_version: version }).orderContractVersion).toBe(version)
})
test('higher version but no useful update and empty target are valid',() => {
  expect(decodeCollectionUpdateStatus({ ...updateStatus(),update_available: false }).updateAvailable).toBe(false)
  const payload={ ...updatePreview(),added: [],converted: [],rank_changes: [],target_empty: true,
    removed: [updatePreview().removed[0]!],final_order: [updatePreview().final_order[3]!] }
  expect(decodeCollectionUpdatePreview(payload).finalOrder[0]!.origin).toBe('manual')
  expect(decodeCollectionUpdatePreview({ ...payload,final_order: [] }).targetEmpty).toBe(true)
})
for (const [name,factory,decode] of [
  ['status',updateStatus,decodeCollectionUpdateStatus],['token',updateToken,decodeCollectionUpdateToken],['preview',updatePreview,decodeCollectionUpdatePreview],
] as const) {
  test.each(Object.keys(factory()))(`${name} requires field %s`,field => {
    const row: Record<string,unknown> = factory();delete row[field]
    expect(()=>decode(row)).toThrow(CollectionUpdateError)
  })
  test(`${name} rejects extra fields`,()=>expect(()=>decode({ ...factory(),extra: true })).toThrow(CollectionUpdateError))
}
test.each([null,undefined,0,-1,'01','+1','1e3','1.0',' 1','-1','9223372036854775808'])('reject exact version %j',value => {
  expect(()=>decodeCollectionUpdateToken({ ...updateToken(),target_version: value })).toThrow(CollectionUpdateError)
})
test.each([null,undefined,3,'1',0])('reject token format %j',version=>{
  expect(()=>decodeCollectionUpdateToken({ ...updateToken(),contract_version: version })).toThrow(CollectionUpdateError)
})
test.each(['a'.repeat(63),'A'.repeat(64),'g'.repeat(64),''])('reject hash %s',value=>{
  expect(()=>decodeCollectionUpdateToken({ ...updateToken(),plan_hash: value })).toThrow(CollectionUpdateError)
})
test.each(['added','removed','converted','rank_changes','final_order'] as const)('reject nested extras and duplicates: %s',name=>{
  const payload=updatePreview()
  expect(()=>decodeCollectionUpdatePreview({ ...payload,[name]: [...payload[name],payload[name][0]] })).toThrow(CollectionUpdateError)
  expect(()=>decodeCollectionUpdatePreview({ ...payload,[name]: [{ ...payload[name][0],extra: true }] })).toThrow(CollectionUpdateError)
})
test.each([
  (p: ReturnType<typeof updatePreview>)=>{ p.token.target_version=p.token.applied_target_version },
  (p: ReturnType<typeof updatePreview>)=>{ p.token.target_version='1' },
  (p: ReturnType<typeof updatePreview>)=>{ p.update_available=false },
  (p: ReturnType<typeof updatePreview>)=>{ p.target_empty=true },
  (p: ReturnType<typeof updatePreview>)=>{ p.collection_id='invalid' },
  (p: ReturnType<typeof updatePreview>)=>{ p.converted[0]!.collection_item_id=updateItem(1) },
  (p: ReturnType<typeof updatePreview>)=>{ p.converted[0]!.variant_id='1' },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[0]!.is_hidden=true },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[0]!.automatic_rank='2' },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[0]!.collection_item_id=null },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[2]!.is_hidden=true },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[2]!.collection_item_id=updateItem(9) },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[3]!.is_hidden=true },
  (p: ReturnType<typeof updatePreview>)=>{ p.final_order[3]!.automatic_rank='4' },
  (p: ReturnType<typeof updatePreview>)=>{ p.removed[0]!.variant_id='4' },
  (p: ReturnType<typeof updatePreview>)=>{ p.rank_changes[0]!.previous_rank='3' },
  (p: ReturnType<typeof updatePreview>)=>{ p.rank_changes[0]!.next_rank='4' },
  (p: ReturnType<typeof updatePreview>)=>{ p.added[0]!.automatic_rank='3' },
])('reject incoherent classification %#',mutate=>{
  const payload=updatePreview();mutate(payload)
  expect(()=>decodeCollectionUpdatePreview(payload)).toThrow(CollectionUpdateError)
})
test('services only read expected RPC once, no DML or additional read',async()=>{
  const preview=setup(),status=setup(updateStatus())
  await preview.service.previewCollectionUpdate(updateParent)
  await status.service.getCollectionUpdateStatus(updateParent)
  expect(preview.rpc).toHaveBeenCalledExactlyOnceWith('preview_collection_update',{ p_collection_id: updateParent })
  expect(status.rpc).toHaveBeenCalledExactlyOnceWith('get_collection_update_status',{ p_collection_id: updateParent })
  expect(preview.from).not.toHaveBeenCalled();expect(status.from).not.toHaveBeenCalled()
})
test('parent binding and invalid inputs refused',async()=>{
  await expect(setup({ ...updatePreview(),collection_id: updateItem(1) }).service.previewCollectionUpdate(updateParent)).rejects.toHaveProperty('code','unexpected')
  const mock=setup();await expect(mock.service.getCollectionUpdateStatus('invalid')).rejects.toHaveProperty('code','unexpected')
  expect(mock.rpc).not.toHaveBeenCalled()
})
test.each([
  ['42501','collection_update_unavailable','not_authorized'],['PGRST301','jwt','not_authorized'],
  ['23514','order_contract_upgrade_required','incompatible_collection'],['23514','collection_update_ineligible','incompatible_collection'],
  ['23514','collection_update_state_invalid','inconsistent_state'],['40001','collection_structure_conflict','unavailable'],
  ['XX000','private SQL detail','unexpected'],
])('safe error mapping %s/%s',async(code,message,want)=>{
  await expect(setup(null,{ code,message }).service.previewCollectionUpdate(updateParent)).rejects.toMatchObject({ code: want,message: want })
})
test('transport failure differs from valid no update',async()=>{
  const mock=setup();mock.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(mock.service.previewCollectionUpdate(updateParent)).rejects.toHaveProperty('code','unavailable')
  expect(decodeCollectionUpdateStatus({ ...updateStatus(),update_available: false }).updateAvailable).toBe(false)
})
test('public helpers use existing factory and deny missing client',async()=>{
  const mock=setup();vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await previewCollectionUpdate(updateParent)
  mock.rpc.mockResolvedValue({ data:updateStatus(),error:null });await getCollectionUpdateStatus(updateParent)
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(previewCollectionUpdate(updateParent)).rejects.toHaveProperty('code','not_authorized')
  await expect(getCollectionUpdateStatus(updateParent)).rejects.toHaveProperty('code','not_authorized')
})
