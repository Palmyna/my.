export interface CollectionContentItem {
  collectionItemId: string
  variantId: string
  origin: 'manual' | 'automatic'
  cardNameFr: string | null
  localId: string | null
  setNameFr: string | null
  imageUrl: string | null
  variantLabel: string | null
  owned: boolean
}
