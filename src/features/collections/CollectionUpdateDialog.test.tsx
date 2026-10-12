import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CollectionUpdateError, applyCollectionUpdate, decodeCollectionUpdatePreview, decodeCollectionUpdateStatus,
  getCollectionUpdateOperationResult, getCollectionUpdateStatus, previewCollectionUpdate } from '../../services/collection-update'
import { getCollectionContentV2 } from '../../services/collection-content'
import { getCollectionOverview } from '../../services/collections'
import { getVariantDetail } from '../../services/variant-detail'
import { listCollectionItemOrder } from '../../services/collection-items'
import type { CollectionUpdateApplyRequest } from '../../types/collection-update'
import type { CollectionOverview } from '../../types/collections'
import type { VariantDetail } from '../../types/variant-detail'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { updateCurrentItems, updateItem, updateMetadata, updateParent, updatePreview, updateStatus } from '../../test/collection-update'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionUpdatePreviewKey, collectionUpdateStatusKey } from './collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { CollectionActions } from './CollectionActions'
import { CollectionPage } from './CollectionPage'

const viewer = 'a3500000-0000-0000-0000-000000000001'
const original = () => decodeCollectionUpdatePreview(updatePreview())
const fixture = () => ({ orderContractVersion: 2 as 1 | 2, personalRevision: original().token.personalRevision, items: updateCurrentItems() })
const storageKey = 'my.collection.operation.v2:' + JSON.stringify([viewer, updateParent])
const base: CollectionOverview = { collectionId: updateParent, ownerId: viewer, access: 'owned', collectionType: 'automatic', name: 'Actualisation',
  targetType: 'set', targetId: '100', targetName: 'Extension synthétique', targetPrimaryType: null, targetSecondaryType: null, ownedCount: 0, totalCount: 3 }
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'a3500000-0000-0000-0000-000000000001' }, isAuthorized: true }) }))
vi.mock('../../services/collection-update', async source => ({ ...await source<typeof import('../../services/collection-update')>(),
  applyCollectionUpdate: vi.fn(), getCollectionUpdateOperationResult: vi.fn(), getCollectionUpdateStatus: vi.fn(), previewCollectionUpdate: vi.fn() }))
vi.mock('../../services/collection-content', async source => ({ ...await source<typeof import('../../services/collection-content')>(), getCollectionContentV2: vi.fn() }))
vi.mock('../../services/collections', async source => ({ ...await source<typeof import('../../services/collections')>(), getCollectionOverview: vi.fn() }))
vi.mock('../../services/variant-detail', () => ({ getVariantDetail: vi.fn() }))
vi.mock('../../services/collection-items', async source => ({ ...await source<typeof import('../../services/collection-items')>(), listCollectionItemOrder: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn().mockResolvedValue(DEFAULT_USER_PREFERENCES),
  saveUserPreferences: vi.fn().mockImplementation((_id, preferences: unknown) => Promise.resolve(preferences)), getCollectionViewOverride: vi.fn().mockResolvedValue(null) }))
const apply = vi.mocked(applyCollectionUpdate), lookup = vi.mocked(getCollectionUpdateOperationResult), check = vi.mocked(getCollectionUpdateStatus)
const preview = vi.mocked(previewCollectionUpdate), content = vi.mocked(getCollectionContentV2), detail = vi.mocked(getVariantDetail)
const overview = vi.mocked(getCollectionOverview), order = vi.mocked(listCollectionItemOrder)
let current = fixture(), collection = { ...base }
const accepted = (request: CollectionUpdateApplyRequest) => ({ operationId: request.operationId, outcome: 'applied' as const,
  personalRevision: (BigInt(request.token.personalRevision) + 1n).toString(), appliedTargetVersion: request.token.targetVersion,
  createdItems: request.addedVariantIds.map(variantId => ({ variantId, collectionItemId: updateItem(9) })) })
function commit(request: CollectionUpdateApplyRequest) {
  const metadata = updateMetadata()
  current = { orderContractVersion: 2, personalRevision: accepted(request).personalRevision, items: original().finalOrder.map(entry => ({
    ...metadata.get(entry.variantId)!, collectionItemId: entry.collectionItemId ?? updateItem(9), sourceCardId: entry.variantId, setId: '100',
    origin: entry.origin, isHidden: entry.isHidden, owned: false, seriesNameFr: null, seriesNameSource: null,
  })) }
  collection = { ...base, totalCount: 3 }
  check.mockResolvedValue({ ...decodeCollectionUpdateStatus(updateStatus()), updateAvailable: false })
  return accepted(request)
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  sessionStorage.clear(); current = fixture(); collection = { ...base }
  check.mockReset().mockResolvedValue(decodeCollectionUpdateStatus(updateStatus()))
  preview.mockReset().mockImplementation(() => Promise.resolve(original()))
  content.mockReset().mockImplementation(() => Promise.resolve(current))
  overview.mockReset().mockImplementation(() => Promise.resolve(collection))
  order.mockReset().mockImplementation(() => Promise.resolve(current.items.map(item => item.collectionItemId)))
  lookup.mockReset().mockResolvedValue(null)
  apply.mockReset().mockImplementation((_id, request) => Promise.resolve(commit(request)))
  detail.mockReset().mockImplementation(id => Promise.resolve({ ...updateMetadata().get(String(id))!, variantId: String(id), sourceCardId: '1', setId: '100',
    pokemon: [], rarity: null, category: null, setNameSource: null, seriesNameFr: null, seriesNameSource: null, variantType: null, variantSubtype: null,
    variantSize: null, variantFoil: null, variantStamps: [], effectiveReleaseDate: null, dateOrigin: 'unknown' } satisfies VariantDetail))
})
function Observers() {
  useQuery({ queryKey: collectionContentKey(viewer, updateParent), queryFn: () => getCollectionContentV2(updateParent) })
  useQuery({ queryKey: collectionOverviewKey(viewer, updateParent), queryFn: () => getCollectionOverview(updateParent) })
  useQuery({ queryKey: collectionItemOrderKey(viewer, updateParent), queryFn: () => listCollectionItemOrder(updateParent) })
  useQuery({ queryKey: dashboardCollectionsKey(viewer), queryFn: () => Promise.resolve([collection]) })
  return null
}
function setup(page = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/collections/${updateParent}`]}>
    {page ? <Routes><Route path="/collections/:collectionId" element={<CollectionPage />} /></Routes>
      : <><Observers /><CollectionActions collection={collection} userId={viewer} unavailable={unavailable} /></>}
  </MemoryRouter></QueryClientProvider>)
  return { ...result, client }
}
const unavailable = vi.fn()
async function open() {
  const trigger = await screen.findByRole('button', { name: 'Actions de la collection' })
  trigger.focus(); fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les mises à jour' }))
  return trigger
}
async function ready() { return screen.findByRole('button', { name: 'Mettre à jour la collection' }) }
const success = () => screen.findByText('Opération confirmée. Votre collection a été mise à jour et son contenu relu.')

test.each(['free', 'shared', 'wrong owner'] as const)('%s sans point d’accès ni consultation', async kind => {
  collection = { ...base, collectionType: kind === 'free' ? 'free' : 'automatic', access: kind === 'shared' ? 'shared' : 'owned', ownerId: kind === 'wrong owner' ? updateItem(5) : viewer }
  setup(); await waitFor(() => expect(content).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: 'Actions de la collection' }))
  expect(screen.queryByRole('button', { name: 'Vérifier les mises à jour' })).not.toBeInTheDocument()
  expect(check).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled()
})
test('consultation uniquement au clic, métadonnées exactes, plan complet incluant masquées et manuels', async () => {
  const { client } = setup(); await waitFor(() => expect(content).toHaveBeenCalled())
  expect(check).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled(); expect(detail).not.toHaveBeenCalled()
  await open(); await ready()
  expect(check).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledOnce(); expect(detail).toHaveBeenCalledExactlyOnceWith('9007199254740997')
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getAllByText(/Évoli · TEST/)).toHaveLength(2)
  expect(within(dialog).getByText('Carte existante conservée · Masquée')).toBeInTheDocument()
  expect(within(dialog).getByText(/Vos exemplaires et notes sont conservés/)).toBeVisible()
  expect(client.getQueryData(collectionUpdatePreviewKey(viewer, updateParent))).toEqual(original())
  expect(apply).not.toHaveBeenCalled()
})
test.each(['current', 'legacy', 'preview no delta'] as const)('%s sans application', async state => {
  if (state !== 'preview no delta') check.mockResolvedValue({ ...decodeCollectionUpdateStatus(updateStatus()), updateAvailable: state !== 'current', orderContractVersion: state === 'legacy' ? 1 : 2 })
  else preview.mockResolvedValue({ ...original(), updateAvailable: false })
  setup(); await open(); await screen.findByText(state === 'legacy' ? /ancien contrat/ : state === 'current' ? /Votre collection est à jour/ : /Aucun changement structurel utile/)
  expect(screen.queryByRole('button', { name: 'Mettre à jour la collection' })).not.toBeInTheDocument()
  if (state !== 'preview no delta') expect(preview).not.toHaveBeenCalled()
  expect(apply).not.toHaveBeenCalled()
})
test('chargements distincts, erreur de consultation et réessai explicite', async () => {
  let finish!: () => void
  check.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(decodeCollectionUpdateStatus(updateStatus())) }))
  preview.mockRejectedValueOnce(new CollectionUpdateError('unavailable'))
  setup(); await open(); expect(screen.getByText('Vérification des mises à jour…')).toBeVisible()
  await act(async () => { finish(); await Promise.resolve() })
  await screen.findByRole('button', { name: 'Réessayer la consultation' })
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer la consultation' })); await ready()
  expect(check).toHaveBeenCalledTimes(2)
})
test('confirmation unique, verrouillage, doubles clics, succès après relectures et invalidations sans consultation', async () => {
  const { client } = setup(); const invalidations = vi.spyOn(client, 'invalidateQueries')
  const trigger = await open(), button = await ready()
  let finish!: () => void
  apply.mockImplementationOnce((_id, request) => new Promise(resolve => { finish = () => resolve(commit(request)) }))
  fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(apply).toHaveBeenCalledOnce())
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })); expect(screen.getByRole('dialog')).toBeVisible()
  await act(async () => { finish(); await Promise.resolve() }); await success()
  expect(content.mock.calls.length).toBeGreaterThan(2); expect(overview.mock.calls.length).toBeGreaterThan(1); expect(order.mock.calls.length).toBeGreaterThan(1)
  for (const key of [collectionContentKey(viewer, updateParent), collectionItemOrderKey(viewer, updateParent), collectionOverviewKey(viewer, updateParent), dashboardCollectionsKey(viewer)]) {
    expect(invalidations).toHaveBeenCalledWith({ queryKey: key, exact: true })
  }
  for (const key of [collectionUpdateStatusKey(viewer, updateParent), collectionUpdatePreviewKey(viewer, updateParent)]) {
    expect(invalidations).toHaveBeenCalledWith({ queryKey: key, exact: true, refetchType: 'none' })
  }
  expect(check).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); expect(trigger).toHaveFocus()
  await open(); await screen.findByText(/Votre collection est à jour/); expect(apply).toHaveBeenCalledOnce()
})
test('aperçu invalidé encore affiché : nouveau consentement requis sans writer', async () => {
  const { client } = setup(); await open(); await ready()
  await act(() => client.invalidateQueries({ queryKey: collectionUpdatePreviewKey(viewer, updateParent), refetchType: 'none' }))
  await screen.findByRole('button', { name: 'Consulter un nouvel aperçu' })
  expect(screen.queryByRole('button', { name: 'Mettre à jour la collection' })).not.toBeInTheDocument()
  expect(preview).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled()
})
test.each(['same', 'revision', 'error'] as const)('relecture du contenu : consentement suspendu sans fausse alerte, résultat %s', async result => {
  const view = setup(); await open(); await ready()
  const staleMessage = 'La collection ou le catalogue a changé depuis l’aperçu. Consultez un nouvel aperçu avant de confirmer.'
  const heading = within(screen.getByRole('dialog')).getByRole('heading', { name: 'Vérifier les mises à jour' })
  act(() => heading.focus())
  let finish!: (value: ReturnType<typeof fixture>) => void, fail!: (error: Error) => void
  content.mockImplementation(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
  let reread!: Promise<void>
  try {
    await act(async () => {
      reread = view.client.refetchQueries({ queryKey: collectionContentKey(viewer, updateParent), exact: true })
      await Promise.resolve()
    })
    await waitFor(() => expect(view.client.getQueryState(collectionContentKey(viewer, updateParent))?.fetchStatus).toBe('fetching'))
    expect(screen.queryByText(staleMessage)).toBeNull()
    expect(screen.getByRole('button', { name: 'Mettre à jour la collection' })).toBeDisabled()
    expect(heading).toHaveFocus(); expect(apply).not.toHaveBeenCalled()
    await act(async () => {
      if (result === 'error') fail(new Error('Synthetic reread failed'))
      else finish(result === 'revision' ? { ...current, personalRevision: (BigInt(current.personalRevision) + 1n).toString() } : current)
      await reread
    })
    if (result === 'same') {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Mettre à jour la collection' })).toBeEnabled())
      expect(screen.queryByText(staleMessage)).toBeNull(); expect(heading).toHaveFocus()
    } else {
      await screen.findByRole('button', { name: 'Consulter un nouvel aperçu' })
      expect(screen.queryByRole('button', { name: 'Mettre à jour la collection' })).toBeNull()
    }
    expect(apply).not.toHaveBeenCalled()
  } finally { view.unmount(); view.client.clear() }
})
test('preview_stale conserve ancien aperçu, nouvelle lecture échouée, puis remplacement et clic neuf', async () => {
  apply.mockRejectedValueOnce(new CollectionUpdateError('preview_stale'))
  setup(); await open(); fireEvent.click(await ready())
  await screen.findByRole('button', { name: 'Consulter un nouvel aperçu' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Consulter un nouvel aperçu' })).toBeEnabled())
  check.mockRejectedValueOnce(new CollectionUpdateError('unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Consulter un nouvel aperçu' }))
  await screen.findByRole('button', { name: 'Réessayer la consultation' })
  expect(screen.getByText('Ordre complet proposé (4 cartes)')).toBeInTheDocument()
  expect(apply).toHaveBeenCalledOnce()
  const next = original(); next.token.personalRevision = (BigInt(current.personalRevision) + 1n).toString(); next.token.planHash = 'c'.repeat(64)
  current = { ...current, personalRevision: next.token.personalRevision }; preview.mockResolvedValue(next)
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer la consultation' })); await ready()
  expect(apply).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour la collection' })); await success()
  expect(apply.mock.calls[1]![1].token).toEqual(next.token)
})
test('résultat incertain puis navigation/reload : reprise accessible sans aperçu ni nouveau token', async () => {
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain'))
  const mounted = setup(); await open(); fireEvent.click(await ready())
  await screen.findByRole('button', { name: 'Reprendre l’opération enregistrée' })
  const request = structuredClone(apply.mock.calls[0]![1]); expect(sessionStorage.getItem(storageKey)).toContain(request.operationId)
  mounted.unmount(); mounted.client.clear()
  setup(); await open(); await screen.findByRole('button', { name: 'Vérifier le résultat' })
  expect(check).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier le résultat' }))
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce()); expect(apply).toHaveBeenCalledOnce()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reprendre l’opération enregistrée' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’opération enregistrée' })); await success()
  expect(apply.mock.calls[1]![1]).toEqual(request); expect(lookup.mock.calls.every(call => JSON.stringify(call[1]) === JSON.stringify(request))).toBe(true)
})
test('reçu historique récupéré après reload sans second writer', async () => {
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain'))
  const mounted = setup(); await open(); fireEvent.click(await ready()); await screen.findByRole('button', { name: 'Vérifier le résultat' })
  const request = apply.mock.calls[0]![1]; commit(request); lookup.mockResolvedValue(accepted(request))
  mounted.unmount(); setup(); await open(); fireEvent.click(await screen.findByRole('button', { name: 'Vérifier le résultat' })); await success()
  expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0)
})
test('écriture confirmée, relecture échouée puis reload : relecture seule, jamais second writer', async () => {
  const mounted = setup(); await open(); await ready()
  content.mockRejectedValue(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour la collection' }))
  await screen.findByText('L’écriture est confirmée. La relecture de la collection reste à terminer.')
  expect(screen.queryByRole('button', { name: 'Reprendre l’opération enregistrée' })).not.toBeInTheDocument()
  expect(JSON.parse(sessionStorage.getItem(storageKey)!) as unknown).toMatchObject({ confirmed: true })
  mounted.unmount(); content.mockImplementation(() => Promise.resolve(current)); setup(); await open()
  fireEvent.click(await screen.findByRole('button', { name: 'Vérifier le résultat' })); await success()
  expect(apply).toHaveBeenCalledOnce(); expect(lookup).not.toHaveBeenCalled()
})
test('dialogue : focus initial, summary inclus dans Tab, Échap, annulation, scroll et retour déclencheur', async () => {
  setup(); const trigger = await open(); await ready()
  const modal = screen.getByRole('dialog'), summary = screen.getByText('Ordre complet proposé (4 cartes)')
  expect(document.body.style.overflow).toBe('hidden')
  const last = screen.getByRole('button', { name: 'Mettre à jour la collection' })
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(summary).toHaveFocus()
  fireEvent.keyDown(summary, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus()
  fireEvent(modal, new Event('cancel', { cancelable: true })); expect(trigger).toHaveFocus(); expect(document.body.style.overflow).toBe('')
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(trigger).toHaveFocus(); expect(apply).not.toHaveBeenCalled()
})
test('collection inaccessible pendant consultation', async () => {
  unavailable.mockClear(); check.mockRejectedValueOnce(new CollectionUpdateError('not_authorized'))
  setup(); await open(); await waitFor(() => expect(unavailable).toHaveBeenCalledOnce()); expect(preview).not.toHaveBeenCalled()
})
test('vues Liste, Cartes, Classeur reçoivent la séquence autoritative après application', async () => {
  setup(true); await screen.findByRole('button', { name: 'Liste' }); await open(); fireEvent.click(await ready()); await success()
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  for (const view of ['Liste', 'Cartes', 'Classeur']) {
    fireEvent.click(screen.getByRole('button', { name: view }))
    await waitFor(() => expect(screen.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true'))
    if (view === 'Classeur') {
      await screen.findByRole('button', { name: /Voir le détail de Évoli/ })
      expect(screen.queryByRole('button', { name: /Voir le détail de Bêta|Voir le détail de Alpha/ })).not.toBeInTheDocument()
    } else {
      await waitFor(() => expect(document.querySelector('.collection-content')?.textContent).toContain('Évoli'))
      expect(document.querySelector('.collection-content')?.textContent).not.toContain('Bêta')
      expect(document.querySelector('.collection-content')?.textContent).not.toContain('Alpha')
    }
  }
})
test.each(['success', 'error'] as const)('45 ajouts, %s : pages ciblées, pool de quatre et plan complet conservé', async scenario => {
  const proposed = original()
  proposed.added = Array.from({ length: 45 }, (_, n) => ({ variantId: String(n + 100), automaticRank: String(n + 1) }))
  proposed.removed = []; proposed.converted = []; proposed.rankChanges = []
  proposed.finalOrder = proposed.added.map(item => ({ ...item, collectionItemId: null, origin: 'automatic', isHidden: false }))
  current.items = []; preview.mockResolvedValue(proposed)
  let concurrent = 0, maximum = 0
  const reader = detail.getMockImplementation()!
  detail.mockImplementation(async id => {
    concurrent++; maximum = Math.max(maximum, concurrent)
    await Promise.resolve()
    const result = await reader(id)
    concurrent--
    if (scenario === 'error' && String(id) === '121') throw new Error('Unavailable metadata page')
    return { ...result, cardNameFr: 'Variante ' + String(id) }
  })
  const { client } = setup(); await open(); await ready()
  expect(detail).toHaveBeenCalledTimes(20); expect(maximum).toBeLessThanOrEqual(4)
  expect(client.getQueryData(collectionUpdatePreviewKey(viewer, updateParent))).toEqual(proposed)
  fireEvent.click(screen.getAllByRole('button', { name: 'Voir la suite (20 / 45)' })[0]!)
  if (scenario === 'error') {
    await screen.findByRole('button', { name: 'Réessayer la consultation' })
    expect(screen.queryByRole('button', { name: 'Mettre à jour la collection' })).not.toBeInTheDocument()
  } else {
    await screen.findByRole('button', { name: 'Voir la suite (40 / 45)' })
    expect(detail).toHaveBeenCalledTimes(40)
  }
  expect(maximum).toBeLessThanOrEqual(4); expect(screen.queryByText('Variante 144')).not.toBeInTheDocument()
  expect(apply).not.toHaveBeenCalled()
})
