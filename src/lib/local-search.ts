// Shared local filtering only: no ranking, sorting or remote search.
export function normalizeLocalSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}./]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export function localSearchTerms(query: string): string[] {
  return normalizeLocalSearchText(query).split(' ').map(term => term.replace(/^[./]+|[./]+$/g, '')).filter(Boolean)
}
