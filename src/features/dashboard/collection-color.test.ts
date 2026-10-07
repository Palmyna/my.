import { expect, test } from 'vitest'
import type { DashboardCollection } from '../../types/collections'
import { POKEMON_TYPES } from '../../types/pokemon'
import { resolveFunctionalIdentity, resolvePokemonIdentity } from '../../lib/catalog-identity'
import { collectionPresentation } from '../collections/collection-presentation'
import { resolveCollectionIdentity } from './collection-color'

const base: DashboardCollection = { collectionId: 'a', name: 'Arbitrary name', collectionType: 'automatic', access: 'owned',
  targetType: 'pokemon', targetId: '25', targetName: 'Arbitrary target', targetPrimaryType: 'electric', targetSecondaryType: null, ownedCount: 1, totalCount: 3 }
test.each(POKEMON_TYPES)('Catalogue and Collection share the exact identity for %s', type => {
  expect(resolveCollectionIdentity({ ...base, targetPrimaryType: type })).toEqual(resolvePokemonIdentity(type))
})
test('double type, absent metadata and inconsistent target have explicit identities', () => {
  expect(resolveCollectionIdentity({ ...base,targetPrimaryType:'fire',targetSecondaryType:'flying' })).toEqual(resolvePokemonIdentity('fire','flying'))
  expect(resolveCollectionIdentity({ ...base,targetPrimaryType:null })).toEqual(resolvePokemonIdentity(null))
  expect(resolveCollectionIdentity({ ...base,targetType:null })).toEqual(resolvePokemonIdentity(null))
})
test.each(['pokemon','set',null] as const)('shared overrides target %s, including a free collection', targetType => {
  for (const collectionType of ['automatic','free'] as const) {
    const resolved = resolveCollectionIdentity({ ...base, access:'shared', collectionType, targetType, targetPrimaryType:'fire',targetSecondaryType:'flying' })
    expect(resolved).toEqual(resolveFunctionalIdentity('shared'))
    expect(resolved.gradient).not.toContain(resolvePokemonIdentity('fire').primaryAccent)
  }
})
test('free and automatic set resolve functional identities', () => {
  expect(resolveCollectionIdentity({ ...base, collectionType:'free',targetType:null })).toEqual(resolveFunctionalIdentity('free'))
  expect(resolveCollectionIdentity({ ...base,targetType:'set',targetPrimaryType:null })).toEqual(resolveFunctionalIdentity('set'))
})
test('collection IDs and names have no influence; CSS chrome uses both types, progress/FAB primary', () => {
  const collection = { ...base,targetPrimaryType:'fire' as const,targetSecondaryType:'flying' as const }
  const renamed = { ...collection,collectionId:'other',name:'Renamed',targetName:null }
  expect(resolveCollectionIdentity(renamed)).toEqual(resolveCollectionIdentity(collection))
  const identity=resolvePokemonIdentity('fire','flying')
  expect(collectionPresentation(collection).style).toMatchObject({ '--collection-accent':identity.primaryAccent,
    '--collection-secondary':identity.secondaryAccent,'--collection-gradient':identity.gradient,'--collection-border':identity.border })
})
