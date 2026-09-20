import type { DashboardCollection } from '../../types/collections'

export const collectionColors = [
  { name: 'coral', accent: '#f2a099', surface: '#382829', border: '#79504e' },
  { name: 'amber', accent: '#e8b078', surface: '#362c25', border: '#735a40' },
  { name: 'yellow', accent: '#dfcb83', surface: '#333024', border: '#6c633e' },
  { name: 'green', accent: '#9bcca6', surface: '#26322b', border: '#476c50' },
  { name: 'turquoise', accent: '#88cec5', surface: '#253233', border: '#416b68' },
  { name: 'blue', accent: '#9bbde6', surface: '#282e3b', border: '#4e607c' },
  { name: 'violet', accent: '#c3afe8', surface: '#302b3d', border: '#66547d' },
  { name: 'pink', accent: '#e4a6c6', surface: '#372936', border: '#78526b' },
] as const

export function collectionColor(collection: Pick<DashboardCollection, 'collectionId' | 'collectionType' | 'targetType' | 'targetName'>) {
  // No target ID in the read contract: use the target name when available,
  // otherwise the immutable collection ID. No per-Pokémon color table.
  const identity = collection.collectionType === 'automatic' && collection.targetType && collection.targetName
    ? `${collection.targetType}:${collection.targetName.normalize('NFC').trim().toLocaleLowerCase('fr')}`
    : `collection:${collection.collectionId}`
  let hash = 2166136261
  for (const character of identity) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  return collectionColors[hash % collectionColors.length]!
}
