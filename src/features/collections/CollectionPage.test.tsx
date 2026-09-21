import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { CollectionsError, getCollectionOverview } from '../../services/collections'
import type { DashboardCollection } from '../../types/collections'
import { collectionColor } from '../dashboard/collection-color'
import { CollectionPage } from './CollectionPage'
import { collectionOverviewKey } from './collection-query'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/collections')>(), getCollectionOverview: vi.fn(),
}))
const get = vi.mocked(getCollectionOverview)
const id = 'c1200000-0000-0000-0000-000000000001'
const base: DashboardCollection = { collectionId: id, name: 'Mes favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 0 }
beforeEach(() => { auth.user = { id: 'owner' }; get.mockReset().mockResolvedValue(base) })
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/collections/${id}`]}><Routes>
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
    <Route path="/dashboard" element={<h1>Dashboard</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}

test('charge indépendamment du Dashboard et conserve un h1 stable sans voler le focus', async () => {
  let finish!: (data: DashboardCollection) => void
  get.mockReturnValue(new Promise(resolve => { finish = resolve }))
  setup()
  const h1 = screen.getByRole('heading', { level: 1 })
  const back = screen.getByRole('link', { name: 'Retour au Dashboard' })
  expect(screen.getByRole('status')).toHaveTextContent('Chargement de la collection')
  expect(get).toHaveBeenCalledExactlyOnceWith(id)
  back.focus()
  await act(async () => { finish(base); await Promise.resolve() })
  expect(await screen.findByRole('heading', { name: base.name })).toBe(h1)
  expect(back).toHaveFocus()
  expect(document.title).toBe('Mes favoris — MY.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test.each([
  { ...base },
  { ...base, collectionType: 'automatic' as const, targetType: 'pokemon' as const, targetName: 'Pikachu', ownedCount: 82, totalCount: 120 },
  { ...base, collectionType: 'automatic' as const, targetType: 'set' as const, targetName: 'Légendes Brillantes', access: 'shared' as const, ownedCount: 3, totalCount: 4 },
  { ...base, collectionType: 'automatic' as const, targetType: 'pokemon' as const, targetName: null },
])('identité, progression et accès depuis le contrat $collectionType/$targetType/$access', async collection => {
  get.mockResolvedValue(collection)
  setup()
  const title = await screen.findByRole('heading', { name: collection.name })
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByText(collection.collectionType === 'free' ? 'Personnalisée' : collection.targetType === 'pokemon' ? 'Automatique · Pokémon' : 'Automatique · Extension')).toBeVisible()
  if (collection.targetName) expect(screen.getByText(collection.targetName)).toBeVisible()
  expect(screen.getByText(`${collection.ownedCount} / ${collection.totalCount}`)).toBeVisible()
  expect(screen.queryByText('Votre collection')).not.toBeInTheDocument()
  if (collection.access === 'shared') expect(screen.getByText('Partagée · Lecture seule')).toBeVisible()
  else expect(screen.queryByText('Partagée · Lecture seule')).not.toBeInTheDocument()
  expect(screen.getByText(collection.totalCount ? `${Math.round(collection.ownedCount / collection.totalCount * 100)} %` : 'Collection vide')).toBeVisible()
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  if (!collection.totalCount) expect(screen.queryByText('0 %')).not.toBeInTheDocument()
  expect(title.closest('.collection-overview')).toHaveStyle({ '--collection-accent': collectionColor(collection).accent })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  for (const raw of ['free', 'pokemon', 'set', id]) expect(screen.queryByText(raw, { exact: true })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Retour au Dashboard' }))
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test.each(['collection_unavailable', 'not_authorized'] as const)('indisponibilité sûre : %s', async code => {
  get.mockRejectedValue(new CollectionsError(code))
  setup()
  expect(await screen.findByRole('heading', { name: 'Collection indisponible' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('Cette collection n’existe pas ou vous n’y avez plus accès.')
  expect(screen.queryByText(code)).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Retour au Dashboard' })).toHaveAttribute('href', '/dashboard')
  expect(get).toHaveBeenCalledOnce()
})

test('erreur temporaire assainie avec retry explicite', async () => {
  get.mockRejectedValueOnce(new Error('Supabase private payload')).mockResolvedValueOnce(base)
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la collection')
  expect(screen.queryByText(/Supabase private/)).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(await screen.findByRole('heading', { name: base.name })).toBeVisible()
  expect(get).toHaveBeenCalledTimes(2)
})

test('masque la donnée en cache quand une relecture révèle un partage retiré', async () => {
  get.mockResolvedValueOnce({ ...base, access: 'shared' }).mockRejectedValueOnce(new CollectionsError('collection_unavailable'))
  const { client } = setup()
  await screen.findByRole('heading', { name: base.name })
  await act(async () => { await client.invalidateQueries({ queryKey: collectionOverviewKey('owner', id), exact: true }) })
  expect(await screen.findByRole('heading', { name: 'Collection indisponible' })).toBeVisible()
  expect(screen.queryByText(base.name)).not.toBeInTheDocument()
  expect(screen.queryByText('0 / 0')).not.toBeInTheDocument()
})

test('le cache reste isolé par utilisateur', async () => {
  get.mockResolvedValueOnce(base).mockReturnValueOnce(new Promise(() => {}))
  const { rerender } = setup()
  await screen.findByRole('heading', { name: base.name })
  auth.user = { id: 'other' }; rerender()
  expect(screen.queryByText(base.name)).not.toBeInTheDocument()
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('status')).toBeVisible()
})
