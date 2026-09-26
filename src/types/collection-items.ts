export type ItemDestination = { placement: 'start' | 'end' }
  | { placement: 'before' | 'after'; anchorId: string }
export type ItemMove = { itemId: string; destination: ItemDestination }
export type ReorderAvailability = { enabled: true } | { enabled: false; reason: string }
