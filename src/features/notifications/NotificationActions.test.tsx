import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Link, MemoryRouter, Route, RouterProvider, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { AuthenticatedLayout } from '../../app/AuthenticatedLayout'
import { CollectionPage } from '../collections/CollectionPage'
import { decodeNotificationCenter, getNotificationCenter, getNotificationContent, getNotificationUnreadCount,
  markNotificationRead, processAnnouncementNotification } from '../../services/notifications'
import { CollectionsError, getCollectionOverview } from '../../services/collections'
import { getCollectionContentV2 } from '../../services/collection-content'
import { CollectionUpdateError, applyCollectionUpdate, decodeCollectionUpdatePreview, decodeCollectionUpdateStatus,
  getCollectionUpdateOperationResult, getCollectionUpdateStatus, previewCollectionUpdate } from '../../services/collection-update'
import { listCollectionItemOrder } from '../../services/collection-items'
import { getVariantDetail } from '../../services/variant-detail'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionUpdateApplyRequest } from '../../types/collection-update'
import type { NotificationContent, NotificationItem } from '../../types/notifications'
import { announcementNotificationRow, collectionNotificationRow } from '../../test/notifications'
import { updateCurrentItems, updateItem, updateMetadata, updateParent, updatePreview, updateStatus } from '../../test/collection-update'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { notificationCenterKey, notificationContentKey, notificationUnreadCountKey } from './notification-query'

const viewer = 'a3500000-0000-0000-0000-000000000001'
const auth = vi.hoisted(() => ({ viewer: 'a3500000-0000-0000-0000-000000000001', authorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: auth.viewer }, isAuthorized: auth.authorized, actions: { signOut: vi.fn() } }) }))
vi.mock('../../services/notifications', async original => ({ ...await original<object>(), getNotificationCenter: vi.fn(),
  getNotificationContent: vi.fn(), getNotificationUnreadCount: vi.fn(), markNotificationRead: vi.fn(), processAnnouncementNotification: vi.fn() }))
vi.mock('../../services/collections', async original => ({ ...await original<object>(), getCollectionOverview: vi.fn() }))
vi.mock('../../services/collection-content', async original => ({ ...await original<object>(), getCollectionContentV2: vi.fn() }))
vi.mock('../../services/collection-update', async original => ({ ...await original<object>(), getCollectionUpdateStatus: vi.fn(),
  previewCollectionUpdate: vi.fn(), applyCollectionUpdate: vi.fn(), getCollectionUpdateOperationResult: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<object>(), listCollectionItemOrder: vi.fn() }))
vi.mock('../../services/variant-detail', () => ({ getVariantDetail: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn().mockImplementation(() => Promise.resolve(DEFAULT_USER_PREFERENCES)), saveUserPreferences: vi.fn(),
  getCollectionViewOverride: vi.fn().mockResolvedValue(null) }))
const base: CollectionOverview = { collectionId: updateParent, ownerId: viewer, access: 'owned', name: 'Collection synthétique',
  collectionType: 'automatic', targetType: 'set', targetId: '100', targetName: 'Extension synthétique', targetPrimaryType: null,
  targetSecondaryType: null, ownedCount: 0, totalCount: 3 }
const original = () => decodeCollectionUpdatePreview(updatePreview())
function announcement(kind: 'announcement' | 'changelog' = 'announcement', n = 1): NotificationContent {
  const item = decodeNotificationCenter({ items: [announcementNotificationRow(kind, n)], unread_count: '1', next_cursor: null }).items[0]!
  if (item.kind === 'collection_update') throw new Error('Invalid fixture')
  return { ...item, title: `${kind} ${n}`, body: 'Première ligne\n\n<script>texte brut</script>\nDernière ligne' }
}
function collectionNotification(revision = original().token.targetVersion): NotificationItem {
  return decodeNotificationCenter({ items: [{ ...collectionNotificationRow(), notification_key: `collection:${updateParent}`,
    collection_id: updateParent, applied_target_version: '1', target_version: revision, revision,
    action: { kind: 'collection_preview', collection_id: updateParent } }], unread_count: '1', next_cursor: null }).items[0]!
}
let items: NotificationItem[], current = { orderContractVersion: 2 as const, personalRevision: original().token.personalRevision, items: updateCurrentItems() }
const clients: QueryClient[] = []
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.viewer = viewer; auth.authorized = true; sessionStorage.clear()
  items = [collectionNotification(), announcement(), announcement('changelog', 2)]
  current = { orderContractVersion: 2, personalRevision: original().token.personalRevision, items: updateCurrentItems() }
  vi.mocked(getNotificationCenter).mockReset().mockImplementation(() => Promise.resolve({ items: [...items], unreadCount: '37', nextCursor: null }))
  vi.mocked(getNotificationUnreadCount).mockReset().mockResolvedValue({ unreadCount: '37' })
  vi.mocked(getNotificationContent).mockReset().mockImplementation(id => Promise.resolve(items.find(item => item.kind !== 'collection_update' && item.announcementId === id) as NotificationContent ?? null))
  vi.mocked(markNotificationRead).mockReset().mockImplementation(request => {
    items = items.map(item => item.notificationKey === request.notificationKey && item.revision === request.observedRevision ? { ...item, state: 'read' } : item)
    return Promise.resolve({ outcome: 'recorded' })
  })
  vi.mocked(processAnnouncementNotification).mockReset().mockImplementation(request => {
    expect(document.querySelector('.notification-body')).toHaveTextContent('Première ligne')
    items = items.filter(item => item.kind === 'collection_update' || item.announcementId !== request.announcementId)
    return Promise.resolve({ outcome: 'recorded' })
  })
  vi.mocked(getCollectionOverview).mockReset().mockResolvedValue(base)
  vi.mocked(getCollectionContentV2).mockReset().mockImplementation(() => Promise.resolve(current))
  vi.mocked(listCollectionItemOrder).mockReset().mockImplementation(() => Promise.resolve(current.items.map(item => item.collectionItemId)))
  vi.mocked(getCollectionUpdateStatus).mockReset().mockResolvedValue(decodeCollectionUpdateStatus(updateStatus()))
  vi.mocked(previewCollectionUpdate).mockReset().mockImplementation(() => Promise.resolve(original()))
  vi.mocked(getCollectionUpdateOperationResult).mockReset().mockResolvedValue(null)
  vi.mocked(applyCollectionUpdate).mockReset().mockImplementation((_id, request) => Promise.resolve(commit(request)))
  vi.mocked(getVariantDetail).mockReset().mockResolvedValue({ ...updateMetadata().get('9007199254740997')!, variantId: '9007199254740997', sourceCardId: '1', setId: '100',
    pokemon: [], rarity: null, category: null, setNameSource: null, seriesNameFr: null, seriesNameSource: null, variantType: null, variantSubtype: null,
    variantSize: null, variantFoil: null, variantStamps: [], effectiveReleaseDate: null, dateOrigin: 'unknown' })
})
afterEach(() => { for (const client of clients.splice(0)) client.clear(); sessionStorage.clear() })
function commit(request: CollectionUpdateApplyRequest) {
  const result = { operationId: request.operationId, outcome: 'applied' as const, personalRevision: (BigInt(request.token.personalRevision) + 1n).toString(),
    appliedTargetVersion: request.token.targetVersion, createdItems: request.addedVariantIds.map(variantId => ({ variantId, collectionItemId: updateItem(9) })) }
  current = { ...current, personalRevision: result.personalRevision }
  items = items.filter(item => item.kind !== 'collection_update')
  return result
}
function Probe() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="Emplacement">{location.pathname}|{location.key}</output><button onClick={() => void navigate(-1)}>Historique précédent</button>
    <button onClick={() => void navigate(1)}>Historique suivant</button></>
}
function setup(path = '/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const tree = () => <StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<AuthenticatedLayout />}>
      <Route path="/dashboard" element={<h1>Dashboard</h1>} />
      <Route path="/collections/:collectionId" element={<CollectionPage />} />
    </Route>
  </Routes><Probe /><Link to="/dashboard">Quitter la collection</Link></MemoryRouter></QueryClientProvider></StrictMode>
  const view = render(tree())
  return { client, ...view, update: () => view.rerender(tree()) }
}
const bell = () => screen.getByRole('button', { name: /^Notifications —/ })
async function panel() {
  fireEvent.click(bell())
  return screen.findByRole('list', { name: 'Notifications actives' })
}
async function readAnnouncement(index = 0) {
  const list = await panel()
  const button = within(list).getAllByRole('button', { name: 'Lire' })[index]!
  fireEvent.click(button)
  return button
}
async function openUpdate(source: 'bell' | 'menu' = 'bell') {
  if (source === 'bell') { await panel(); fireEvent.click(screen.getByRole('button', { name: 'Voir la mise à jour' })) }
  else { fireEvent.click(await screen.findByRole('button', { name: 'Actions de la collection' })); fireEvent.click(screen.getByRole('button', { name: 'Vérifier les mises à jour' })) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test.each(['collection_update', 'announcement', 'changelog'] as const)('lecture manuelle %s : clé/révision affichée, aucun contenu ni traitement', async kind => {
  setup(); const list = await panel()
  const row = [...list.children].find(element => element.textContent?.includes(kind === 'collection_update' ? 'Actualisation de collection' : kind === 'announcement' ? 'Annonce' : 'Changelog'))!
  const item = items.find(item => item.kind === kind)!
  vi.mocked(getNotificationUnreadCount).mockResolvedValue({ unreadCount: '31' })
  const marker = within(row as HTMLElement).getByRole('button', { name: 'Marquer comme lue' })
  act(() => marker.focus()); fireEvent.click(marker)
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledExactlyOnceWith({ notificationKey: item.notificationKey, observedRevision: item.revision }))
  await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications — 31 non lues'))
  await waitFor(() => expect(within(row as HTMLElement).queryByRole('button', { name: 'Marquer comme lue' })).toBeNull())
  expect(within(row as HTMLElement).getByRole('button', { name: kind === 'collection_update' ? 'Voir la mise à jour' : 'Lire' })).toHaveFocus()
  expect(getNotificationCenter).toHaveBeenCalledTimes(2)
  expect(getNotificationContent).not.toHaveBeenCalled(); expect(processAnnouncementNotification).not.toHaveBeenCalled(); expect(previewCollectionUpdate).not.toHaveBeenCalled()
})
test('lecture échouée : double clic bloqué et reprise de la révision originale après changement du centre', async () => {
  const pending = deferred<{ outcome: 'recorded' }>()
  vi.mocked(markNotificationRead).mockImplementationOnce(() => pending.promise).mockRejectedValueOnce(new Error('Suivi indisponible'))
  setup(); await panel()
  const button = screen.getAllByRole('button', { name: 'Marquer comme lue' })[0]!
  fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'Voir la mise à jour' })).toBeDisabled()
  await act(async () => { pending.resolve({ outcome: 'recorded' }); await Promise.resolve() })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button); await screen.findByRole('button', { name: 'Réessayer le marquage' })
  const observed = vi.mocked(markNotificationRead).mock.calls[1]![0]
  items[0] = collectionNotification('9007199254740999')
  fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
  await waitFor(() => expect(getNotificationCenter).toHaveBeenCalledTimes(3))
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer le marquage' }))
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(3))
  expect(vi.mocked(markNotificationRead).mock.calls[2]![0]).toEqual(observed)
})
test.each(['announcement', 'changelog'] as const)('%s : texte brut présenté puis hash exact traité une fois sous StrictMode, compteur/centre relus', async kind => {
  const content = announcement(kind); items = [content]
  const process = vi.mocked(processAnnouncementNotification).getMockImplementation()!
  vi.mocked(processAnnouncementNotification).mockImplementation(request => {
    vi.mocked(getNotificationUnreadCount).mockResolvedValue({ unreadCount: '12' })
    return process(request)
  })
  setup(); await readAnnouncement()
  await screen.findByText('Consultation enregistrée.')
  expect(document.querySelector('.notification-body')?.textContent).toBe(content.body)
  expect(document.querySelector('.notification-body script')).toBeNull()
  expect(processAnnouncementNotification).toHaveBeenCalledExactlyOnceWith({ announcementId: content.announcementId, observedHash: content.revision })
  await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications — 12 non lues'))
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Notifications actives' })).toBeNull())
  expect(screen.getByRole('dialog', { name: content.title })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Notifications' })).toHaveFocus())
})
test.each(['close', 'navigation', 'viewer', 'logout'] as const)('chargement de contenu annulé par %s : aucune écriture ni réponse privée tardive', async action => {
  const pending = deferred<NotificationContent | null>(), content = announcement()
  vi.mocked(getNotificationContent).mockReturnValueOnce(pending.promise)
  const view = setup(); await readAnnouncement()
  await screen.findByText('Chargement du contenu…')
  expect(processAnnouncementNotification).not.toHaveBeenCalled()
  if (action === 'close') fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  if (action === 'navigation') fireEvent.click(screen.getByRole('link', { name: 'Quitter la collection' }))
  if (action === 'viewer' || action === 'logout') { auth.viewer = 'bob'; auth.authorized = action !== 'logout'; items = []; view.update() }
  await act(async () => { pending.resolve(content); await Promise.resolve() })
  expect(document.querySelector('.notification-body')).toBeNull(); expect(processAnnouncementNotification).not.toHaveBeenCalled()
  expect(view.client.getQueryData(notificationContentKey(viewer, content.announcementId))).toBeUndefined()
})
test('contenu long : titre/version complets, retours conservés et dialogue autorise la coupure des chaînes', async () => {
  const content = { ...announcement('changelog'), title: 'W'.repeat(200), appVersion: `0.8.19+${'w'.repeat(57)}`,
    body: `Première ligne\n\n${'W'.repeat(19_900)}\nDernière ligne` }
  items = [content]
  setup(); await readAnnouncement(); await screen.findByText('Consultation enregistrée.')
  const dialog = screen.getByRole('dialog', { name: content.title })
  expect(within(dialog).getByRole('heading', { name: content.title })).toHaveTextContent(content.title)
  expect(within(dialog).getByText(`Changelog · Version ${content.appVersion}`)).toBeInTheDocument()
  expect(dialog.querySelector('.notification-body')?.textContent).toBe(content.body)
  // jsdom verifies the actual stylesheet; browser measurements prove geometry.
  expect(getComputedStyle(dialog).overflowWrap).toBe('anywhere')
  expect(getComputedStyle(dialog.querySelector('.notification-body')!).whiteSpace).toBe('pre-wrap')
  expect(processAnnouncementNotification).toHaveBeenCalledExactlyOnceWith({ announcementId: content.announcementId, observedHash: content.revision })
})
test('erreur de contenu, nouvel essai puis erreur de suivi : reprise explicite avec hash consulté', async () => {
  const content = announcement(); items = [content]
  vi.mocked(getNotificationContent).mockRejectedValueOnce(new Error('Contenu inaccessible'))
  vi.mocked(processAnnouncementNotification).mockRejectedValueOnce(new Error('Suivi inaccessible'))
  setup(); await readAnnouncement(); await screen.findByRole('button', { name: 'Réessayer la consultation' })
  expect(processAnnouncementNotification).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer la consultation' }))
  await screen.findByRole('button', { name: 'Réessayer le suivi' })
  expect(getNotificationCenter).toHaveBeenCalledOnce()
  items = [{ ...content, revision: 'b'.repeat(64) }]
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer le suivi' }))
  await screen.findByText('Consultation enregistrée.')
  expect(vi.mocked(processAnnouncementNotification).mock.calls.map(call => call[0].observedHash)).toEqual([content.revision, content.revision])
})
test('contenu en cache préchargé : attend la consultation fraîche réussie, fermeture sans traitement', async () => {
  const content = announcement(), pending = deferred<NotificationContent | null>()
  vi.mocked(getNotificationContent).mockReturnValueOnce(pending.promise)
  const view = setup(); view.client.setQueryData(notificationContentKey(viewer, content.announcementId), content)
  await readAnnouncement(); expect(document.querySelector('.notification-body')).toBeNull()
  expect(processAnnouncementNotification).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  await act(async () => { pending.resolve(content); await Promise.resolve() })
  expect(processAnnouncementNotification).not.toHaveBeenCalled()
})
test.each(['unavailable', 'obsolete', 'requires action'] as const)('%s conserve un comportement sûr', async scenario => {
  const content = announcement(); items = [scenario === 'requires action' ? { ...content, requiresAction: true } : content]
  if (scenario === 'unavailable') vi.mocked(getNotificationContent).mockResolvedValue(null)
  if (scenario === 'obsolete') vi.mocked(processAnnouncementNotification).mockImplementation(() => { items = []; return Promise.resolve({ outcome: 'obsolete' }) })
  setup(); await readAnnouncement()
  await screen.findByText(scenario === 'unavailable' ? /retiré, a expiré/ : scenario === 'obsolete' ? /notification n’est plus active/ : /validation n’est pas disponible/)
  expect(processAnnouncementNotification).toHaveBeenCalledTimes(scenario === 'obsolete' ? 1 : 0)
  expect(screen.queryByRole('button', { name: /Valider|Action effectuée/ })).toBeNull()
  if (scenario !== 'requires action') await waitFor(() => expect(getNotificationCenter).toHaveBeenCalledTimes(2))
})
test('dialogue : focus, Tab/Shift+Tab, Escape natif et retour à Lire si la ligne demeure', async () => {
  items = [{ ...announcement(), requiresAction: true }]
  setup(); const opener = await readAnnouncement(); await screen.findByText(/validation n’est pas disponible/)
  const dialog = screen.getByRole('dialog', { name: 'announcement 1' }), close = within(dialog).getByRole('button', { name: 'Fermer' })
  expect(within(dialog).getByRole('heading', { name: 'announcement 1' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true }); expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Tab' }); expect(close).toHaveFocus()
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
  await waitFor(() => expect(opener).toHaveFocus())
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
})
test.each(['/dashboard', `/collections/${updateParent}`])('notification collection depuis %s : droits relus, aperçu seul et intention consommée', async path => {
  setup(path)
  if (path !== '/dashboard') await screen.findByRole('button', { name: 'Actions de la collection' })
  const location = screen.getByLabelText('Emplacement').textContent
  const reads = vi.mocked(getCollectionOverview).mock.calls.length
  await openUpdate(); await screen.findByRole('button', { name: 'Mettre à jour la collection' })
  expect(getCollectionOverview).toHaveBeenCalledTimes(reads + 1)
  expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull()
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledExactlyOnceWith({ notificationKey: `collection:${updateParent}`, observedRevision: original().token.targetVersion }))
  expect(applyCollectionUpdate).not.toHaveBeenCalled()
  if (path !== '/dashboard') expect(screen.getByLabelText('Emplacement')).toHaveTextContent(location)
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  if (path === '/dashboard') {
    fireEvent.click(screen.getByRole('button', { name: 'Historique précédent' })); fireEvent.click(screen.getByRole('button', { name: 'Historique suivant' }))
    await screen.findByRole('button', { name: 'Actions de la collection' })
  }
  expect(screen.queryByRole('dialog', { name: 'Vérifier les mises à jour' })).toBeNull()
  expect(previewCollectionUpdate).toHaveBeenCalledOnce()
})
test.each([false, true])('routeur de données : intention survit à la transition, navigation remplacée ne la ressuscite pas (%s)', async superseded => {
  const navigation = deferred<null>()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ path: '*', loader: ({ request }) => new URL(request.url).pathname === '/dashboard' ? null : navigation.promise,
    element: <Routes><Route element={<AuthenticatedLayout />}>
    <Route path="/dashboard" element={<h1>Dashboard</h1>} />
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
  </Route></Routes> }], { initialEntries: ['/dashboard'] })
  const view = render(<StrictMode><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></StrictMode>)
  try {
    await screen.findByRole('button', { name: /^Notifications —/ })
    await openUpdate()
    expect(router.state.navigation.state).toBe('loading')
    expect(previewCollectionUpdate).not.toHaveBeenCalled()
    if (superseded) await act(() => router.navigate('/dashboard'))
    await act(() => { navigation.resolve(null); return navigation.promise })
    if (superseded) {
      await act(() => router.navigate(`/collections/${updateParent}`))
      await screen.findByRole('button', { name: 'Actions de la collection' })
      expect(screen.queryByRole('dialog', { name: 'Vérifier les mises à jour' })).toBeNull()
      expect(previewCollectionUpdate).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled()
      return
    }
    await screen.findByRole('button', { name: 'Mettre à jour la collection' })
    expect(router.state.location.pathname).toBe(`/collections/${updateParent}`)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledExactlyOnceWith({ notificationKey: `collection:${updateParent}`, observedRevision: original().token.targetVersion }))
    expect(applyCollectionUpdate).not.toHaveBeenCalled()
  } finally { view.unmount(); router.dispose() }
})
test.each(['deleted', 'revoked', 'shared'] as const)('collection %s : aucun aperçu ni acquittement', async scenario => {
  if (scenario === 'shared') vi.mocked(getCollectionOverview).mockResolvedValue({ ...base, access: 'shared', ownerId: 'bob' })
  else vi.mocked(getCollectionOverview).mockRejectedValue(new CollectionsError(scenario === 'deleted' ? 'collection_unavailable' : 'not_authorized'))
  setup(); await openUpdate()
  await screen.findByText(scenario === 'shared' ? 'Partagée · Lecture seule' : /n’existe pas ou vous n’y avez plus accès/)
  expect(previewCollectionUpdate).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled()
})
test('droits collection répondant après changement de viewer : intention annulée, aucun aperçu', async () => {
  const pending = deferred<CollectionOverview>()
  vi.mocked(getCollectionOverview).mockReturnValue(pending.promise)
  const view = setup(); await openUpdate()
  await screen.findByText('Chargement de la collection…')
  auth.viewer = 'bob'; items = []; view.update()
  await act(async () => { pending.resolve(base); await Promise.resolve() })
  expect(previewCollectionUpdate).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled()
})
test.each(['error', 'legacy', 'close before preview'] as const)('aperçu %s : sans acquittement', async scenario => {
  const pending = deferred<ReturnType<typeof original>>()
  if (scenario === 'error') vi.mocked(previewCollectionUpdate).mockRejectedValue(new CollectionUpdateError('unavailable'))
  if (scenario === 'legacy') vi.mocked(getCollectionUpdateStatus).mockResolvedValue({ ...decodeCollectionUpdateStatus(updateStatus()), orderContractVersion: 1 })
  if (scenario === 'close before preview') vi.mocked(previewCollectionUpdate).mockReturnValue(pending.promise)
  setup(); await openUpdate()
  if (scenario === 'close before preview') {
    await screen.findByText('Chargement de l’aperçu…'); fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await act(async () => { pending.resolve(original()); await Promise.resolve() })
  } else await screen.findByText(scenario === 'legacy' ? /ancien contrat/ : /Impossible de consulter les mises à jour/)
  expect(markNotificationRead).not.toHaveBeenCalled(); expect(applyCollectionUpdate).not.toHaveBeenCalled()
})
test('version 2 réellement présentée pendant arrivée de 3 : seule 2 acquittée, 3 demeure non lue', async () => {
  items = [collectionNotification('2')]
  const proposed = { ...original(), token: { ...original().token, appliedTargetVersion: '1', targetVersion: '2' } }
  const pending = deferred<ReturnType<typeof original>>()
  vi.mocked(previewCollectionUpdate).mockReturnValue(pending.promise)
  setup(); await openUpdate(); await screen.findByText('Chargement de l’aperçu…')
  items = [collectionNotification('3')]
  await act(async () => { pending.resolve(proposed); await Promise.resolve() })
  await screen.findByRole('button', { name: 'Mettre à jour la collection' })
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledExactlyOnceWith({ notificationKey: `collection:${updateParent}`, observedRevision: '2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); const list = await panel()
  expect(within(list).getByText('Non lue')).toBeVisible(); expect(applyCollectionUpdate).not.toHaveBeenCalled()
})
test.each(['refused', 'obsolete'] as const)('acquittement %s : centre actualisé, consentement 8F disponible', async scenario => {
  if (scenario === 'refused') vi.mocked(markNotificationRead).mockRejectedValueOnce(new Error('Refus'))
  else vi.mocked(markNotificationRead).mockResolvedValue({ outcome: 'obsolete' })
  setup(); await openUpdate(); const apply = await screen.findByRole('button', { name: 'Mettre à jour la collection' })
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledOnce())
  await waitFor(() => expect(vi.mocked(getNotificationUnreadCount).mock.calls.length).toBeGreaterThanOrEqual(2))
  expect(apply).toBeEnabled()
  if (scenario === 'refused') {
    const retry = await screen.findByRole('button', { name: 'Réessayer le suivi' }); fireEvent.click(retry)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2))
    expect(vi.mocked(markNotificationRead).mock.calls[0]).toEqual(vi.mocked(markNotificationRead).mock.calls[1])
  }
  fireEvent.click(apply); await screen.findByText(/Opération confirmée/)
})
test.each(['bell', 'menu'] as const)('application depuis %s : compteur et panneau ouvert relus après confirmation autoritative', async source => {
  const pending = deferred<ReturnType<typeof commit>>()
  vi.mocked(applyCollectionUpdate).mockReturnValueOnce(pending.promise)
  setup(source === 'menu' ? `/collections/${updateParent}` : '/dashboard')
  await openUpdate(source); await screen.findByRole('button', { name: 'Mettre à jour la collection' })
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour la collection' }))
  await waitFor(() => expect(applyCollectionUpdate).toHaveBeenCalledOnce())
  // jsdom allows opening the head consumer while the native modal is pending.
  await panel(); const centers = vi.mocked(getNotificationCenter).mock.calls.length, counts = vi.mocked(getNotificationUnreadCount).mock.calls.length
  vi.mocked(getNotificationUnreadCount).mockResolvedValue({ unreadCount: '8' })
  await act(async () => { pending.resolve(commit(vi.mocked(applyCollectionUpdate).mock.calls[0]![1])); await Promise.resolve() })
  await screen.findByText(/Opération confirmée/)
  await waitFor(() => expect(getNotificationCenter).toHaveBeenCalledTimes(centers + 1))
  await waitFor(() => expect(getNotificationUnreadCount).toHaveBeenCalledTimes(counts + 1))
  expect(bell()).toHaveAccessibleName('Notifications — 8 non lues')
  expect(screen.queryByRole('button', { name: 'Voir la mise à jour' })).toBeNull()
  expect(processAnnouncementNotification).not.toHaveBeenCalled(); expect(applyCollectionUpdate).toHaveBeenCalledOnce()
})
test('application incertaine puis reçu : mêmes requête/token, rafraîchissement après relectures, aucun second writer', async () => {
  vi.mocked(applyCollectionUpdate).mockImplementationOnce((_id, request) => { commit(request); return Promise.reject(new CollectionUpdateError('operation_uncertain')) })
  setup(`/collections/${updateParent}`); await openUpdate('menu')
  fireEvent.click(await screen.findByRole('button', { name: 'Mettre à jour la collection' }))
  await screen.findByRole('button', { name: 'Vérifier le résultat' })
  const request = vi.mocked(applyCollectionUpdate).mock.calls[0]![1]
  const counts = vi.mocked(getNotificationUnreadCount).mock.calls.length
  vi.mocked(getCollectionUpdateOperationResult).mockResolvedValue({ operationId: request.operationId, outcome: 'applied',
    personalRevision: current.personalRevision, appliedTargetVersion: request.token.targetVersion, createdItems: [{ variantId: request.addedVariantIds[0]!, collectionItemId: updateItem(9) }] })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Vérifier le résultat' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier le résultat' }))
  await screen.findByText(/Opération confirmée/)
  expect(getCollectionUpdateOperationResult).toHaveBeenCalledExactlyOnceWith(updateParent, request)
  expect(applyCollectionUpdate).toHaveBeenCalledOnce()
  await waitFor(() => expect(getNotificationUnreadCount).toHaveBeenCalledTimes(counts + 1))
  expect(sessionStorage.length).toBe(0)
})
test('traitement retire événement paginé : nouvelle tête remplace pages/curseur ; réponse tardive de suite annulée', async () => {
  const first = announcement(), second = announcement('announcement', 2), third = announcement('announcement', 3)
  const cursor = { updatedAt: first.updatedAt, notificationKey: first.notificationKey }
  const more = deferred<{ items: NotificationItem[]; unreadCount: string; nextCursor: null }>()
  vi.mocked(getNotificationCenter).mockResolvedValueOnce({ items: [first], unreadCount: '37', nextCursor: cursor })
    .mockReturnValueOnce(more.promise).mockResolvedValue({ items: [second, third], unreadCount: '36', nextCursor: null })
  setup(); await panel(); fireEvent.click(screen.getByRole('button', { name: 'Afficher la suite' }))
  await waitFor(() => expect(getNotificationCenter).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Lire' })); await screen.findByText('Consultation enregistrée.')
  await waitFor(() => expect(getNotificationCenter).toHaveBeenCalledTimes(3))
  await act(async () => { more.resolve({ items: [first, third], unreadCount: '37', nextCursor: null }); await Promise.resolve() })
  const list = screen.getByRole('list', { name: 'Notifications actives' })
  expect(within(list).queryByRole('heading', { name: first.title })).toBeNull()
  expect(list.children).toHaveLength(2); expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
})
test('mutation terminant sous un autre viewer : aucune relecture ni cache de l’ancien compte', async () => {
  const pending = deferred<{ outcome: 'recorded' }>()
  vi.mocked(processAnnouncementNotification).mockReturnValueOnce(pending.promise)
  const view = setup(); await readAnnouncement(); await waitFor(() => expect(processAnnouncementNotification).toHaveBeenCalledOnce())
  auth.viewer = 'bob'; items = []; view.update(); await waitFor(() => expect(bell()).toBeVisible())
  const counts = vi.mocked(getNotificationUnreadCount).mock.calls.length
  await act(async () => { pending.resolve({ outcome: 'recorded' }); await Promise.resolve() })
  expect(getNotificationUnreadCount).toHaveBeenCalledTimes(counts)
  expect(view.client.getQueryState(notificationCenterKey(viewer))).toBeUndefined()
  expect(view.client.getQueryState(notificationUnreadCountKey(viewer))).toBeUndefined()
})
test('changement de viewer avant dispatch du marquage : aucune écriture sous la nouvelle session', async () => {
  const view = setup(); await panel()
  act(() => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Marquer comme lue' })[0]!)
    auth.viewer = 'bob'; items = []; view.update()
  })
  await act(async () => { await Promise.resolve() })
  expect(markNotificationRead).not.toHaveBeenCalled()
})
test('changement de viewer avant dispatch de la reprise annonce : hash ancien jamais envoyé sous la nouvelle session', async () => {
  vi.mocked(processAnnouncementNotification).mockRejectedValueOnce(new Error('Suivi indisponible'))
  const view = setup(); await readAnnouncement(); await screen.findByRole('button', { name: 'Réessayer le suivi' })
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le suivi' }))
    auth.viewer = 'bob'; items = []; view.update()
  })
  await act(async () => { await Promise.resolve() })
  expect(processAnnouncementNotification).toHaveBeenCalledOnce()
})
