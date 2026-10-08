/** Exact stored typography; empty values count as unavailable. */
export function formatFrSource(fr: string | null, source: string | null): string | null {
  return fr && source && fr !== source ? `${fr} (${source})` : fr || source || null
}
