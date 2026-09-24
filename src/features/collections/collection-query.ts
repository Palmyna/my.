export const collectionOverviewKey = (userId: string | undefined, collectionId: string) => ['collections', 'detail', userId, collectionId] as const
export const collectionItemOrderKey = (userId: string | undefined, collectionId: string) => ['collections', 'item-order', userId, collectionId] as const
// Exact key for future reorder/item mutations; viewer prefix for possession changes.
export const collectionContentKeys = (userId: string | undefined) => ['collections', 'content', userId] as const
export const collectionContentKey = (userId: string | undefined, collectionId: string) => [...collectionContentKeys(userId), collectionId] as const
