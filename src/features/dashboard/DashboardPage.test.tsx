import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { listDashboardCollections } from '../../services/collections'
import type { DashboardCollection } from '../../types/collections'
import { DashboardPage } from './DashboardPage'
import { resolveCollectionIdentity } from './collection-color'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true, passwordChanged: false }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', () => ({ listDashboardCollections: vi.fn() }))
const load = vi.mocked(listDashboardCollections)
const free: DashboardCollection = { collectionId: 'private-id', name: 'Mes favoris', collectionType: 'free', access: 'owned', targetType: null, targetId: null, targetName: null, targetPrimaryType: null, targetSecondaryType: null, ownedCount: 0, totalCount: 0 }
const pokemon: DashboardCollection = { ...free, collectionId: 'pokemon-id', name: 'Éclairs', collectionType: 'automatic', targetType: 'pokemon', targetId: '25', targetName: 'Pikachu', targetPrimaryType: 'electric', ownedCount: 82, totalCount: 120 }
const shared: DashboardCollection = { ...pokemon, collectionId: 'set-id', name: 'Souvenirs', targetType: 'set', targetId: '73', targetName: 'Légendes Brillantes', targetPrimaryType: null, access: 'shared', ownedCount: 3, totalCount: 4 }

beforeEach(() => {
  auth.user = { id: 'owner' }; auth.isAuthorized = true; auth.passwordChanged = false
  load.mockReset().mockResolvedValue([])
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}

test('charge une seule fois et présente une seule grille de skeletons', async () => {
  let finish!: (data: DashboardCollection[]) => void
  load.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { rerender } = setup()
  expect(screen.getByRole('status')).toHaveTextContent('Chargement des collections')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Collections')
  expect(document.querySelectorAll('.collection-grid')).toHaveLength(1)
  expect(document.querySelectorAll('.collection-skeleton')).toHaveLength(4)
  expect(document.querySelector('.dashboard-total')).not.toBeInTheDocument()
  expect(screen.queryByText('Aucune collection pour le moment.')).not.toBeInTheDocument()
  rerender()
  expect(load).toHaveBeenCalledOnce()
  await act(async () => {
    finish([free])
    await Promise.resolve()
  })
  expect(await screen.findByRole('article', { name: free.name })).toBeVisible()
  expect(document.querySelector('.dashboard-total')).toHaveTextContent(/^1 collection$/)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test.each([
  { collection:free,accent:'#E22B35',secondary:'#E22B35' },
  { collection:pokemon,accent:'#E2C84A',secondary:'#E2C84A' },
  { collection:{...pokemon,targetPrimaryType:'fire' as const,targetSecondaryType:'flying' as const},accent:'#E58A4A',secondary:'#77BDD7' },
  { collection:{...pokemon,targetType:'set' as const, targetId: '73',targetPrimaryType:null},accent:'#44C7B7',secondary:'#44C7B7' },
  { collection:{...pokemon,access:'shared' as const},accent:'#6366F1',secondary:'#6366F1' },
  { collection:shared,accent:'#6366F1',secondary:'#6366F1' },
  { collection:{...pokemon,targetPrimaryType:null},accent:'#8FA8BD',secondary:'#8FA8BD' },
])('semantic tile $accent/$secondary keeps explicit type/access and progress', async ({collection,accent,secondary}) => {
  load.mockResolvedValue([collection]);setup()
  const tile=await screen.findByRole('article',{name:collection.name})
  expect(tile).toHaveStyle({'--collection-accent':accent,'--collection-secondary':secondary})
  expect(tile.querySelector('.collection-progress-track span')?.getAttribute('style')).not.toContain('gradient')
  expect(within(tile).getByText(collection.access==='shared'?'Partagée':'Personnelle')).toBeVisible()
  expect(within(tile).getByText(collection.collectionType==='free'?'Personnalisée':collection.targetType==='set'?'Automatique · Extension':'Automatique · Pokémon')).toBeVisible()
})

test('réunit les accès dans l’ordre serveur, affiche types, cibles et progression métier', async () => {
  load.mockResolvedValue([free, shared, pokemon])
  setup()
  await screen.findByRole('article', { name: pokemon.name })
  expect(screen.getAllByRole('list')).toHaveLength(1)
  expect(within(screen.getByRole('list', { name: 'Collections' })).getAllByRole('article')).toHaveLength(3)
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([free.name, shared.name, pokemon.name])
  expect(document.querySelector('.dashboard-total')).toHaveTextContent(/^3 collections$/)
  expect(screen.queryByText('Vos collections, leur progression et celles partagées avec vous.')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Mes collections' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Collections partagées avec moi' })).not.toBeInTheDocument()
  const owned = within(screen.getByRole('article', { name: pokemon.name }))
  const received = within(screen.getByRole('article', { name: shared.name }))
  expect(screen.getByText('Personnalisée')).toBeVisible()
  expect(screen.getAllByText('Personnelle')).toHaveLength(2)
  expect(owned.getByText('Automatique · Pokémon')).toBeVisible()
  expect(owned.getByText('Pikachu')).toBeVisible()
  expect(owned.getByText('82 / 120')).toBeVisible()
  expect(owned.getByText('68 %')).toBeVisible()
  expect(received.getByText('Automatique · Extension')).toBeVisible()
  expect(received.getByText('Légendes Brillantes')).toBeVisible()
  expect(received.getByText('Partagée')).toHaveTextContent('Partagée · Lecture seule')
  expect(received.getByText('3 / 4')).toBeVisible()
  expect(received.getByText('75 %')).toBeVisible()
  for (const entry of [free, shared, pokemon]) {
    const tile = screen.getByRole('article', { name: entry.name })
    const color = resolveCollectionIdentity(entry)
    expect(tile.style.getPropertyValue('--collection-accent')).toBe(color.primaryAccent)
    expect(tile.style.getPropertyValue('--collection-surface')).toBe(color.surface)
    expect(tile).not.toHaveAttribute('tabindex')
  }
  expect(screen.getByRole('button', { name: 'Créer une collection personnalisée' })).toBeVisible()
  for (const tile of screen.getAllByRole('article')) {
    expect(within(tile).queryByRole('button')).not.toBeInTheDocument()
    expect(tile.querySelector('a a')).toBeNull()
    expect(within(tile).getAllByRole('link')).toHaveLength(1)
  }
  expect(screen.getByRole('link', { name: free.name })).toHaveAttribute('href', `/collections/${free.collectionId}`)
  expect(screen.getByRole('link', { name: shared.name })).toHaveAttribute('href', `/collections/${shared.collectionId}`)
  for (const value of ['free', 'pokemon', 'set', free.collectionId, shared.collectionId]) expect(screen.queryByText(value, { exact: true })).not.toBeInTheDocument()
})

test('rend 0 / 0 neutre et tolère une cible absente sans inventer de valeur', async () => {
  load.mockResolvedValue([{ ...pokemon, targetName: null, targetPrimaryType: null, targetSecondaryType: null, ownedCount: 0, totalCount: 0 }])
  setup()
  const tile = within(await screen.findByRole('article'))
  expect(tile.getByText('0 / 0')).toBeVisible()
  expect(tile.getByText('Collection vide')).toBeVisible()
  expect(tile.queryByText(/NaN|Infinity|0 %|null|undefined|Pikachu/)).not.toBeInTheDocument()
  expect(tile.getByText('Automatique · Pokémon')).toBeVisible()
})

test.each([{ data: [] }, { data: [free] }, { data: [shared] }])('état vide uniquement global : $data', async ({ data }) => {
  load.mockResolvedValue(data)
  setup()
  if (!data.length) {
    expect(await screen.findByText('Aucune collection pour le moment.')).toBeVisible()
    expect(document.querySelectorAll('.dashboard-empty')).toHaveLength(1)
    expect(document.querySelector('.dashboard-total')).toHaveTextContent(/^0 collections$/)
  } else {
    expect(await screen.findByRole('article', { name: data[0]!.name })).toBeVisible()
    expect(document.querySelector('.dashboard-empty')).not.toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(1)
  }
})

test('ne répète pas une cible identique au nom et conserve la progression complète', async () => {
  load.mockResolvedValue([{ ...pokemon, name: 'Pikachu', ownedCount: 120 }])
  setup()
  const tile = within(await screen.findByRole('article'))
  expect(tile.getAllByText('Pikachu')).toHaveLength(1)
  expect(tile.getByText('120 / 120')).toBeVisible()
  expect(tile.getByText('100 %')).toBeVisible()
})

test('masque les erreurs brutes et relance uniquement sur Réessayer', async () => {
  load.mockRejectedValueOnce(new Error('private SQL details')).mockResolvedValueOnce([free])
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les collections')
  expect(screen.queryByText(/private SQL/)).not.toBeInTheDocument()
  expect(screen.queryByText('Aucune collection pour le moment.')).not.toBeInTheDocument()
  expect(document.querySelector('.dashboard-total')).not.toBeInTheDocument()
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
  await screen.findByText('Aucune collection pour le moment.')
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
