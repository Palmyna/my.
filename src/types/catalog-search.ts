/** One exact catalogue variant, suitable for the 6C.1 manual-add contract. */
export interface CatalogVariantForAdd {
  variantId: string
  imageUrl: string | null
  cardNameFr: string | null
  setNameFr: string | null
  localId: string | null
  variantLabel: string | null
}

export interface CatalogVariantSearchOptions {
  limit?: number
  offset?: number
}
