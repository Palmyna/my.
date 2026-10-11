export interface CollectionUpdateStatus {
  collectionId: string
  orderContractVersion: 1 | 2
  appliedTargetVersion: string
  targetVersion: string
  targetHash: string
  updateAvailable: boolean
}
export interface CollectionUpdateToken {
  contractVersion: 1
  appliedTargetVersion: string
  targetVersion: string
  targetHash: string
  personalRevision: string
  planHash: string
}
export interface CollectionUpdateAddition { variantId: string; automaticRank: string }
export interface CollectionUpdateExisting extends CollectionUpdateAddition { collectionItemId: string }
export interface CollectionUpdateRankChange {
  collectionItemId: string
  variantId: string
  previousRank: string
  nextRank: string
}
export interface CollectionUpdateFinalItem {
  collectionItemId: string | null
  variantId: string
  origin: 'manual' | 'automatic'
  automaticRank: string | null
  isHidden: boolean
}
export interface CollectionUpdatePreview {
  collectionId: string
  token: CollectionUpdateToken
  updateAvailable: boolean
  targetEmpty: boolean
  added: CollectionUpdateAddition[]
  removed: CollectionUpdateExisting[]
  converted: CollectionUpdateExisting[]
  rankChanges: CollectionUpdateRankChange[]
  finalOrder: CollectionUpdateFinalItem[]
}
