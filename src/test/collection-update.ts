import type { CollectionContentItemV2 } from '../types/collection-content'
import type { CatalogVariantForAdd } from '../types/catalog-search'
export const updateParent = 'c3500000-0000-0000-0000-000000000001'
export const updateItem = (n: number) => `d3500000-0000-0000-0000-${String(n).padStart(12,'0')}`
export const updateToken = () => ({ contract_version: 1,applied_target_version: '9007199254740997',target_version: '9007199254740998',
  target_hash: 'a'.repeat(64),personal_revision: '9007199254740999',plan_hash: 'b'.repeat(64) })
export const updateStatus = () => ({ collection_id: updateParent,order_contract_version: 2,applied_target_version: '9007199254740997',
  target_version: '9007199254740998',target_hash: 'a'.repeat(64),update_available: true })
export const updatePreview = () => ({ collection_id: updateParent,token: updateToken(),update_available: true,target_empty: false,
  added: [{ variant_id: '9007199254740997',automatic_rank: '2' }],
  removed: [{ collection_item_id: updateItem(2),variant_id: '2',automatic_rank: '2' }],
  converted: [{ collection_item_id: updateItem(3),variant_id: '3',automatic_rank: '1' }],
  rank_changes: [{ collection_item_id: updateItem(1),variant_id: '1',previous_rank: '1',next_rank: '3' }],
  final_order: [
    { collection_item_id: updateItem(3),variant_id: '3',origin: 'automatic',automatic_rank: '1',is_hidden: false },
    { collection_item_id: updateItem(1),variant_id: '1',origin: 'automatic',automatic_rank: '3',is_hidden: true },
    { collection_item_id: null,variant_id: '9007199254740997',origin: 'automatic',automatic_rank: '2',is_hidden: false },
    { collection_item_id: updateItem(4),variant_id: '4',origin: 'manual',automatic_rank: null,is_hidden: false },
  ] })
export function updateMetadata(): Map<string,CatalogVariantForAdd> {
  return new Map(['1','2','3','4','9007199254740997'].map((id,index) => [id,{ variantId: id,cardNameFr: ['Alpha','Bêta','Gamma','Delta','Évoli'][index]!,
    localId: `${index+1}/100`,setNameFr: 'Extension synthétique',setAbbreviationFr: 'TEST',setAbbreviation: 'TST',variantLabel: 'Holo Cosmos',imageUrl: null }]))
}
export function updateCurrentItems(): CollectionContentItemV2[] {
  const metadata=updateMetadata()
  return ['1','2','3','4'].map((id,index) => ({ ...metadata.get(id)!,collectionItemId: updateItem(index+1),
    sourceCardId: id,setId: '100',origin: index<2 ? 'automatic' : 'manual',isHidden: index===0,
    owned: false,seriesNameFr: null,seriesNameSource: null }))
}
