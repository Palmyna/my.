import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { listDashboardCollections } from '../../services/collections'
import type { DashboardCollection } from '../../types/collections'
import { DashboardPage } from './DashboardPage'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true, passwordChanged: false }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', () => ({ listDashboardCollections: vi.fn() }))
const load = vi.mocked(listDashboardCollections)
const free: DashboardCollection = { collectionId: 'private-id', name: 'Mes favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 0 }
const pokemon: DashboardCollection = { ...free, collectionId: 'pokemon-id', name: 'Éclairs', collectionType: 'automatic', targetType: 'pokemon', targetName: 'Pikachu', ownedCount: 82, totalCount: 120 }
const shared: DashboardCollection = { ...pokemon, collectionId: 'set-id', name: 'Souvenirs', targetType: 'set', targetName: 'Légendes Brillantes', access: 'shared', ownedCount: 3, totalCount: 4 }

beforeEach(() => {
  auth.user = { id: 'owner' }; auth.isAuthorized = true; auth.passwordChanged = false
  load.mockReset().mockResolvedValue([])
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  const tree = () => <QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}

test('charge par le service une seule fois et présente les skeletons dans les deux sections', async () => {
  let finish!: (data: DashboardCollection[]) => void
  load.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { rerender } = setup()
  expect(screen.getByRole('status')).toHaveTextContent('Chargement des collections')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard')
  expect(document.querySelectorAll('.collection-skeleton')).toHaveLength(6)
  expect(screen.queryByText(/Vous n’avez pas encore/)).not.toBeInTheDocument()
  rerender()
  expect(load).toHaveBeenCalledOnce()
  await act(async () => {
    finish([free])
    await Promise.resolve()
  })
  expect(await screen.findByRole('article', { name: free.name })).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('sépare les accès, affiche types, cibles, compteurs serveur et pourcentages', async () => {
  load.mockResolvedValue([free, shared, pokemon])
  setup()
  await screen.findByRole('article', { name: pokemon.name })
  const owned = within(screen.getByRole('region', { name: 'Mes collections' }))
  const received = within(screen.getByRole('region', { name: 'Collections partagées avec moi' }))
  expect(owned.getAllByRole('article')).toHaveLength(2)
  expect(owned.getByText('Libre')).toBeVisible()
  expect(owned.getByText('Automatique · Pokémon')).toBeVisible()
  expect(owned.getByText('Pikachu')).toBeVisible()
  expect(owned.getByText('82 / 120')).toBeVisible()
  expect(owned.getByText('68 %')).toBeVisible()
  expect(received.getAllByRole('article')).toHaveLength(1)
  expect(received.getByText('Automatique · Extension')).toBeVisible()
  expect(received.getByText('Légendes Brillantes')).toBeVisible()
  expect(received.getByText('Partagée · Lecture seule')).toBeVisible()
  expect(received.getByText('3 / 4')).toBeVisible()
  expect(received.getByText('75 %')).toBeVisible()
  for (const tile of screen.getAllByRole('article')) {
    expect(tile.className).toMatch(/collection-color-/)
    expect(tile.style.getPropertyValue('--collection-accent')).not.toBe('')
    expect(tile.style.getPropertyValue('--collection-surface')).not.toBe('')
    expect(tile).not.toHaveAttribute('tabindex')
  }
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  for (const value of ['pokemon', 'set', free.collectionId, shared.collectionId]) expect(screen.queryByText(value, { exact: true })).not.toBeInTheDocument()
})

test('rend 0 / 0 neutre et tolère une cible absente sans inventer de valeur', async () => {
  load.mockResolvedValue([{ ...pokemon, targetName: null, ownedCount: 0, totalCount: 0 }])
  setup()
  const tile = within(await screen.findByRole('article'))
  expect(tile.getByText('0 / 0')).toBeVisible()
  expect(tile.getByText('Collection vide')).toBeVisible()
  expect(tile.queryByText(/NaN|Infinity|0 %|null|undefined|Pikachu/)).not.toBeInTheDocument()
  expect(tile.getByText('Automatique · Pokémon')).toBeVisible()
})

test.each([{ data: [] }, { data: [free] }, { data: [shared] }])('affiche les états vides indépendamment : $data', async ({ data }) => {
  load.mockResolvedValue(data)
  setup()
  if (!data.some(entry => entry.access === 'owned')) expect(await screen.findByText('Vous n’avez pas encore de collection.')).toBeVisible()
  else expect(await screen.findByRole('article', { name: free.name })).toBeVisible()
  if (!data.some(entry => entry.access === 'shared')) expect(await screen.findByText('Aucune collection ne vous est partagée pour le moment.')).toBeVisible()
  else expect(await screen.findByRole('article', { name: shared.name })).toBeVisible()
})

test('masque les erreurs brutes et relance uniquement sur Réessayer', async () => {
  load.mockRejectedValueOnce(new Error('private SQL details')).mockResolvedValueOnce([free])
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les collections')
  expect(screen.queryByText(/private SQL/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Vous n’avez pas encore/)).not.toBeInTheDocument()
  expect(load).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(await screen.findByRole('article', { name: free.name })).toBeVisible()
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('conserve le feedback mot de passe pendant le chargement et après', async () => {
  auth.passwordChanged = true
  setup()
  expect(screen.getByText('Mot de passe modifié. Vous êtes connecté.')).toHaveAttribute('role', 'status')
  await screen.findByText('Vous n’avez pas encore de collection.')
  expect(screen.getByRole('status')).toHaveTextContent('Mot de passe modifié')
})

test('isole le cache par compte sans montrer les collections du précédent', async () => {
  load.mockResolvedValueOnce([free]).mockReturnValueOnce(new Promise(() => {}))
  const { rerender } = setup()
  await screen.findByRole('article', { name: free.name })
  auth.user = { id: 'other-owner' }
  rerender()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Chargement')
  expect(load).toHaveBeenCalledTimes(2)
})
