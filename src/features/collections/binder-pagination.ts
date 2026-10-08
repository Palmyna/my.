import { binderSlotCount } from '../../lib/view-preferences'
import type { BinderFormat } from '../../types/view-preferences'

// Slots retain the exact authoritative array order. Null means an empty pocket,
// never an unowned variant or a variant without an image.
export function binderPages<T>(items: readonly T[], format: BinderFormat): (T | null)[][] {
  const slots = binderSlotCount(format)
  return Array.from({ length: Math.ceil(items.length / slots) }, (_, page) =>
    Array.from({ length: slots }, (_, slot) => items[page * slots + slot] ?? null))
}

export function binderOpening(page: number, pageCount: number, spread: boolean): number[] {
  if (pageCount === 0) return []
  const valid = Math.max(1, Math.min(page, pageCount))
  if (!spread || valid === 1) return [valid]
  const left = valid % 2 === 0 ? valid : valid - 1
  return left < pageCount ? [left, left + 1] : [left]
}

export function adjacentBinderPage(page: number, pageCount: number, spread: boolean, direction: -1 | 1): number | null {
  const opening = binderOpening(page, pageCount, spread)
  if (opening.length === 0) return null
  const target = direction === 1 ? opening[opening.length - 1]! + 1 : opening[0]! - 1
  return target >= 1 && target <= pageCount ? target : null
}

export function parseBinderPage(value: string, pageCount: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 && page <= pageCount ? page : null
}

export function binderOccurrencePage(index: number, format: BinderFormat): number {
  return Math.floor(index / binderSlotCount(format)) + 1
}

export function adjacentOccurrence(index: number, count: number, direction: -1 | 1): number | null {
  const target = index + direction
  return target >= 0 && target < count ? target : null
}
