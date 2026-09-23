export const physicalCopiesKey = (viewerId: string, ownerId: string, variantId: number) =>
  ['physical-copies', viewerId, ownerId, variantId] as const
