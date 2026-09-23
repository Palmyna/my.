export const collectionOverviewKey = (userId: string | undefined, collectionId: string) => ['collections', 'detail', userId, collectionId] as const
export const collectionItemOrderKey = (userId: string | undefined, collectionId: string) => ['collections', 'item-order', userId, collectionId] as const
