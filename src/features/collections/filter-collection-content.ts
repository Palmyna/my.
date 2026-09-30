import type { CollectionContentItem } from '../../types/collection-content'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    // Keep meaningful separators in card numbers and set codes: 28/73, SL3.5.
    .replace(/[^\p{L}\p{N}./]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export function filterCollectionContent(items: CollectionContentItem[], query: string): CollectionContentItem[] {
  const terms = normalize(query).split(' ').map(term => term.replace(/^[./]+|[./]+$/g, '')).filter(Boolean)
  if (terms.length === 0) return items
  return items.filter(item => {
    const fields = [item.cardNameFr, item.setNameFr, item.setAbbreviationFr, item.setAbbreviation,
      item.seriesNameFr, item.seriesNameSource, item.localId, item.variantLabel]
      .filter((field): field is string => field !== null).map(normalize)
    return terms.every(term => fields.some(field => field.includes(term)))
  })
}
