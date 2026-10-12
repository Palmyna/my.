export interface CollectionContentItem {
  collectionItemId: string
  variantId: string
  sourceCardId: string
  setId: string
  origin: 'manual' | 'automatic'
  cardNameFr: string | null
  localId: string | null
  setNameFr: string | null
  setAbbreviationFr: string | null
  setAbbreviation: string | null
  seriesNameFr: string | null
  seriesNameSource: string | null
  imageUrl: string | null
  variantLabel: string | null
  owned: boolean
}

export interface CollectionContentItemV2 extends CollectionContentItem {
  isHidden: boolean
}

export type PersonalRevision = string
export interface CollectionContent {
  orderContractVersion: 1 | 2
  personalRevision: PersonalRevision
  items: CollectionContentItemV2[]
}
