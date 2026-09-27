import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CollectionContentList } from './CollectionContentList'
import { AddCollectionItemDialog } from './AddCollectionItemDialog'
import { getCollectionContent } from '../../services/collection-content'
import { addManualCollectionItem, removeManualCollectionItem, listCollectionItemOrder, CollectionItemsError, type CollectionItemsErrorCode } from '../../services/collection-items'
import { searchCatalogVariantsForAdd, CatalogSearchError } from '../../services/catalog-search'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionContentItem } from '../../types/collection-content'
import type { CatalogVariantForAdd } from '../../types/catalog-search'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionStructureMutationKey } from './collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { physicalCopiesKey } from '../physical-copies/physical-copies-query'

vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' }, isAuthorized: true }) }))
vi.mock('../../services/collection-content', () => ({ getCollectionContent: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(),
  addManualCollectionItem: vi.fn(), removeManualCollectionItem: vi.fn(), listCollectionItemOrder: vi.fn() }))
vi.mock('../../services/catalog-search', async original => ({ ...await original<typeof import('../../services/catalog-search')>(), searchCatalogVariantsForAdd: vi.fn() }))

const bigId = '9007199254740995'
const variant: CatalogVariantForAdd = { variantId: bigId, imageUrl: null, cardNameFr: 'Pikachu', setNameFr: 'Set exemple', setAbbreviationFr: null, setAbbreviation: 'ASC', localId: '025', variantLabel: 'Reverse' }
const item: CollectionContentItem = { ...variant, collectionItemId: 'c1900000-0000-0000-0000-000000000001', origin: 'manual', owned: true }
const collection: CollectionOverview = { collectionId: 'collection', ownerId: 'owner', name: 'Favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, totalCount: 1, ownedCount: 1 }
const content = vi.mocked(getCollectionContent), add = vi.mocked(addManualCollectionItem), remove = vi.mocked(removeManualCollectionItem)
const search = vi.mocked(searchCatalogVariantsForAdd)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  content.mockReset().mockResolvedValue([item])
  vi.mocked(listCollectionItemOrder).mockReset().mockResolvedValue([item.collectionItemId])
  search.mockReset().mockResolvedValue([variant])
  add.mockReset().mockResolvedValue(item.collectionItemId)
  remove.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })
function setup(overrides: Partial<CollectionOverview> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><CollectionContentList collection={{ ...collection, ...overrides }} viewerId="owner" /></QueryClientProvider>)
  return { client, ...view }
}
const button = (name: string) => screen.getByRole('button', { name })
function openAdd() { const trigger = button('Ajouter une carte'); trigger.focus(); fireEvent.click(trigger); return trigger }
async function selectVariant() {
  openAdd()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Pika' } })
  const result = await screen.findByRole('button', { name: /Pikachu.*ASC.*025.*Reverse/ })
  fireEvent.click(result)
}
async function openRemove() {
  const trigger = await screen.findByRole('button', { name: 'Actions de Pikachu' })
  fireEvent.click(trigger)
  fireEvent.click(button('Retirer de la collection'))
  return trigger
}

test.each(['free', 'automatic'] as const)('owner add remains available in empty %s collection; fresh modal and focus', async collectionType => {
  content.mockResolvedValue([])
  setup({ collectionType })
  await screen.findByText('Cette collection ne contient encore aucune carte.')
  const trigger = openAdd()
  expect(screen.getByRole('searchbox')).toHaveFocus()
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(search).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ancien' } })
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(trigger).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  openAdd(); expect(screen.getByRole('searchbox')).toHaveValue('')
  fireEvent.click(button('Annuler')); expect(trigger).toHaveFocus()
})
test('shared has no add, remove or reorder; auto/perso remain readable', async () => {
  content.mockResolvedValue([item, { ...item, collectionItemId: 'auto', variantId: '2', origin: 'automatic' }])
  setup({ access: 'shared', collectionType: 'automatic', ownerId: 'real-owner' })
  await screen.findByText('Perso'); expect(screen.getByText('Auto')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Ajouter|Actions de|Déplacer|Retirer/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /Consulter les exemplaires/ })).toHaveLength(2)
})
test('only manual rows have menu; origin labels only in automatic collections', async () => {
  content.mockResolvedValue([item, { ...item, collectionItemId: 'auto', variantId: '2', origin: 'automatic', cardNameFr: 'Évoli' }])
  const view = setup({ collectionType: 'automatic' })
  await screen.findByText('Perso'); expect(screen.getByText('Auto')).toBeVisible()
  expect(screen.getAllByRole('button', { name: /Actions de/ })).toHaveLength(1)
  view.unmount(); setup(); await screen.findByText('Pikachu · ASC · 025')
  expect(screen.queryByText('Auto')).not.toBeInTheDocument(); expect(screen.queryByText('Perso')).not.toBeInTheDocument()
})
test('300ms debounce, no request for empty/useless input, single character accepted', async () => {
  vi.useFakeTimers()
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><AddCollectionItemDialog viewerId="owner" opener={null} busy={false} error={null}
    onAdd={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>)
  await act(() => vi.advanceTimersByTimeAsync(500))
  expect(search).not.toHaveBeenCalled()
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: '  ! -- ' } })
  await act(() => vi.advanceTimersByTimeAsync(500)); expect(search).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'P' } })
  await act(() => vi.advanceTimersByTimeAsync(299)); expect(search).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(search).toHaveBeenCalledExactlyOnceWith('P', { limit: 20, offset: 0 })
})
test('new query clears old results/errors and ignores stale response; offset resets', async () => {
  let finish!: (rows: CatalogVariantForAdd[]) => void
  search.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue([variant])
  setup(); openAdd(); const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'Ancien' } })
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  fireEvent.change(input, { target: { value: 'Nouveau' } })
  await screen.findByRole('button', { name: /Pikachu.*Reverse/ })
  await act(async () => { finish([{ ...variant, cardNameFr: 'Obsolète' }]); await Promise.resolve() })
  expect(screen.queryByText('Obsolète')).not.toBeInTheDocument()
  expect(search).toHaveBeenLastCalledWith('Nouveau', { limit: 20, offset: 0 })
  fireEvent.change(input, { target: { value: 'Encore' } })
  expect(screen.queryByRole('button', { name: /Pikachu.*Reverse/ })).not.toBeInTheDocument()
})
test('pages of 20 accumulate, deduplicate variantId and restart at offset zero', async () => {
  const page = Array.from({ length: 20 }, (_, i) => ({ ...variant, variantId: String(i), cardNameFr: `Carte ${i}` }))
  search.mockResolvedValueOnce(page).mockResolvedValueOnce([page[0]!, { ...variant, cardNameFr: 'Dernière' }]).mockResolvedValueOnce([])
  setup(); openAdd()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Carte' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }))
  await screen.findByRole('button', { name: /Dernière/ })
  expect(search).toHaveBeenLastCalledWith('Carte', { limit: 20, offset: 20 })
  expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(21)
  expect(screen.queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Autre' } })
  await screen.findByText('Aucune variante trouvée.')
  expect(search).toHaveBeenLastCalledWith('Autre', { limit: 20, offset: 0 })
})
test.each(['unexpected', 'not_authorized', 'invalid_query'] as const)('search %s is safe, retry works, changing query removes alert', async code => {
  search.mockRejectedValueOnce(new CatalogSearchError(code)).mockResolvedValue([])
  setup(); openAdd(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'X' } })
  await screen.findByRole('alert')
  fireEvent.click(button('Réessayer la recherche')); await screen.findByText('Aucune variante trouvée.')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Y' } })
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
test.each(['end', 'start'] as const)('selection only, default Fin, %s add exact BIGINT, targeted invalidations and focus', async placement => {
  const { client } = setup()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const copiesKey = physicalCopiesKey('owner', 'owner', bigId)
  client.setQueryData(copiesKey, [{ id: 'copy', name: 'Conservé' }])
  client.setQueryData(collectionContentKey('someone-else', 'collection'), [item])
  await selectVariant()
  expect(add).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: 'Fin' })).toBeChecked()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  if (placement === 'start') fireEvent.click(screen.getByRole('radio', { name: 'Début' }))
  fireEvent.click(button('Ajouter à la collection'))
  await screen.findByText('Carte ajoutée à la collection.')
  await waitFor(() => expect(button('Ajouter une carte')).toHaveFocus())
  expect(add).toHaveBeenCalledExactlyOnceWith('collection', bigId, placement)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const key of [collectionContentKey('owner', 'collection'), collectionItemOrderKey('owner', 'collection'), collectionOverviewKey('owner', 'collection'), dashboardCollectionsKey('owner')]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key, exact: true })
  }
  expect(invalidate).toHaveBeenCalledTimes(4)
  expect(client.getQueryData(copiesKey)).toEqual([{ id: 'copy', name: 'Conservé' }])
  expect(client.getQueryState(copiesKey)?.isInvalidated).toBe(false)
  expect(client.getQueryState(collectionContentKey('someone-else', 'collection'))?.isInvalidated).toBe(false)
})
test.each<[CollectionItemsErrorCode, string]>([
  ['already_present', 'Cette variante est déjà présente dans cette collection.'],
  ['manual_variant_unavailable', 'Cette variante n’est plus disponible pour être ajoutée.'],
  ['manual_item_invalid_placement', 'Cette position n’est pas disponible'],
  ['not_authorized', 'Votre session ou vos droits'], ['collection_action_unavailable', 'Cette collection n’est plus disponible'],
  ['collection_structure_conflict', 'La collection a changé'], ['manual_item_unexpected', 'La modification n’a pas pu être confirmée'],
])('add error %s keeps selection, refreshes authority, allows return', async (code, message) => {
  add.mockRejectedValue(new CollectionItemsError(code))
  const { client } = setup(); const invalidate = vi.spyOn(client, 'invalidateQueries')
  await selectVariant(); fireEvent.click(button('Ajouter à la collection'))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('radio', { name: 'Fin' })).toBeChecked()
  expect(invalidate).toHaveBeenCalledTimes(4)
  fireEvent.click(button('Retour aux résultats'))
  expect(screen.getByRole('searchbox')).toHaveFocus()
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  fireEvent.click(button('Annuler'))
})
test('pending add blocks double submission, Escape, cancellation and reorder', async () => {
  let finish!: (id: string) => void
  add.mockReturnValue(new Promise(resolve => { finish = resolve }))
  setup(); await selectVariant()
  const submit = button('Ajouter à la collection')
  fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(submit).toBeDisabled())
  expect(button('Déplacer Pikachu')).toHaveAttribute('aria-disabled', 'true')
  expect(button('Annuler')).toBeDisabled()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); expect(screen.getByRole('dialog')).toBeVisible()
  expect(add).toHaveBeenCalledTimes(1)
  await act(async () => { finish(item.collectionItemId); await Promise.resolve() })
})
test('in-flight reorder blocks opening add/remove', async () => {
  const { client } = setup(); await screen.findByText('Pikachu · ASC · 025')
  let finish!: () => void
  const mutation = client.getMutationCache().build(client, { mutationKey: collectionStructureMutationKey('owner', 'collection'),
    mutationFn: () => new Promise<void>(resolve => { finish = resolve }) })
  let operation!: Promise<unknown>
  await act(async () => { operation = mutation.execute(undefined); await Promise.resolve() })
  await waitFor(() => expect(button('Ajouter une carte')).toHaveAttribute('aria-disabled', 'true'))
  fireEvent.click(button('Ajouter une carte')); fireEvent.click(button('Actions de Pikachu'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retirer de la collection' })).not.toBeInTheDocument()
  await act(async () => { finish(); await operation })
})
test('native dialog Tab loop excludes hidden results and returns to input after confirmation', async () => {
  setup(); await selectVariant()
  const submit = button('Ajouter à la collection'), end = screen.getByRole('radio', { name: 'Fin' })
  submit.focus(); fireEvent.keyDown(submit, { key: 'Tab' }); expect(end).toHaveFocus()
  fireEvent.keyDown(end, { key: 'Tab', shiftKey: true }); expect(submit).toHaveFocus()
  fireEvent.click(button('Retour aux résultats')); expect(screen.getByRole('searchbox')).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Tab', shiftKey: true })
  expect(button('Annuler')).toHaveFocus()
})
test('next-page failure preserves loaded results, retry uses same offset, loading prevents repeated fetches', async () => {
  const page = Array.from({ length: 20 }, (_, i) => ({ ...variant, variantId: String(i), cardNameFr: `Carte ${i}` }))
  let fail!: (error: Error) => void
  search.mockResolvedValueOnce(page).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject })).mockResolvedValueOnce([variant])
  setup(); openAdd(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Carte' } })
  const more = await screen.findByRole('button', { name: 'Afficher plus' }); fireEvent.click(more)
  await waitFor(() => expect(more).toBeDisabled())
  expect(screen.getByText('Recherche en cours…')).toHaveAttribute('role', 'status')
  await act(async () => { fail(new Error('private network')); await Promise.resolve() })
  await screen.findByRole('alert')
  expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(20)
  fireEvent.click(button('Réessayer la recherche')); await screen.findByRole('button', { name: /Pikachu.*Reverse/ })
  expect(search.mock.calls.slice(1)).toEqual([['Carte', { limit: 20, offset: 20 }], ['Carte', { limit: 20, offset: 20 }]])
})
test('broken result image falls back without preventing selection', async () => {
  search.mockResolvedValue([{ ...variant, imageUrl: 'https://example.test/card.png' }])
  setup(); openAdd(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Pika' } })
  const result = await screen.findByRole('button', { name: /Pikachu.*Reverse/ })
  fireEvent.error(within(result).getByRole('img', { name: 'Pikachu' }))
  expect(within(result).getByRole('img', { name: 'Image indisponible' })).toBeVisible()
  fireEvent.click(result); expect(screen.getByRole('radio', { name: 'Fin' })).toBeChecked()
})
test.each([
  ['Pikachu', 'HER', 'ASC', '28', 'Reverse', 'Pikachu · HER (ASC) · 28'],
  ['Pikachu', null, 'ASC', '28', 'Reverse', 'Pikachu · ASC · 28'],
  ['Pikachu', 'HER', null, '28', 'Reverse', 'Pikachu · HER · 28'],
  ['Pikachu', 'ASC', 'ASC', '28', 'Reverse', 'Pikachu · ASC · 28'],
  ['Pikachu', null, 'SLG', '28/73', 'Holo', 'Pikachu · SLG · 28/73'],
  ['Pikachu', null, null, '028', null, 'Pikachu · 028'],
  ['Pikachu', null, 'ASC', null, null, 'Pikachu · ASC'],
  [null, null, null, null, null, 'Nom indisponible'],
])('compact search summary: %s / %s / %s / %s / %s', async (cardNameFr, setAbbreviationFr, setAbbreviation, localId, variantLabel, title) => {
  search.mockResolvedValue([{ ...variant, cardNameFr, setAbbreviationFr, setAbbreviation, localId, variantLabel }])
  setup(); openAdd(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Pikachu ASC' } })
  const result = await screen.findByRole('button', { name: accessibleName => accessibleName.includes(title) })
  expect(result.querySelector('.collection-content-name')).toHaveTextContent(title)
  expect(within(result).queryByText('Set exemple')).not.toBeInTheDocument()
  expect(result.querySelector('.collection-content-info')?.children).toHaveLength(variantLabel ? 2 : 1)
  if (variantLabel) expect(result.querySelector('.collection-content-variant')).toHaveTextContent(variantLabel)
  expect(add).not.toHaveBeenCalled()
  fireEvent.click(result); expect(screen.getByRole('radio', { name: 'Fin' })).toBeChecked()
})
test('pending removal prevents double submit and cancel, keeps physical-copy cache untouched', async () => {
  let finish!: () => void
  remove.mockReturnValue(new Promise(resolve => { finish = resolve }))
  setup(); await openRemove()
  const submit = button('Retirer'); fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(submit).toBeDisabled())
  expect(button('Annuler')).toBeDisabled()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBeVisible(); expect(remove).toHaveBeenCalledTimes(1)
  await act(async () => { finish(); await Promise.resolve() })
})
test('remove confirmation protects physical copies; exact item id, invalidations and focus after removed row', async () => {
  const { client } = setup()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const copiesKey = physicalCopiesKey('owner', 'owner', bigId)
  client.setQueryData(copiesKey, ['unchanged'])
  await openRemove()
  expect(screen.getByRole('dialog', { name: 'Retirer cette carte de la collection ?' })).toBeVisible()
  expect(screen.getByText('La variante sera retirée de cette collection. Vos exemplaires physiques seront conservés.')).toBeVisible()
  expect(button('Annuler')).toHaveFocus()
  content.mockResolvedValue([])
  fireEvent.click(button('Retirer'))
  await screen.findByText('Cette collection ne contient encore aucune carte.')
  await waitFor(() => expect(button('Ajouter une carte')).toHaveFocus())
  expect(remove).toHaveBeenCalledExactlyOnceWith('collection', item.collectionItemId)
  expect(invalidate).toHaveBeenCalledTimes(4)
  expect(client.getQueryData(copiesKey)).toEqual(['unchanged'])
  expect(client.getQueryState(copiesKey)?.isInvalidated).toBe(false)
})
test.each<[CollectionItemsErrorCode, string]>([
  ['manual_item_unavailable', 'Cette carte n’est plus disponible'],
  ['automatic_item_removal_forbidden', 'Un élément automatique ne peut pas être retiré'],
  ['collection_action_unavailable', 'Cette collection n’est plus disponible'],
  ['not_authorized', 'Votre session ou vos droits'],
  ['collection_structure_conflict', 'La collection a changé'],
  ['manual_item_unexpected', 'La modification n’a pas pu être confirmée'],
])('remove error %s safe, keeps dialog and allows cancellation', async (code, message) => {
  remove.mockRejectedValue(new CollectionItemsError(code))
  setup(); const trigger = await openRemove()
  fireEvent.click(button('Retirer'))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.click(button('Annuler')); expect(trigger).toHaveFocus()
})
