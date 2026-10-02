import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getCollectionContent } from '../../services/collection-content'
import { saveUserPreferences } from '../../services/view-preferences'
import type { CollectionView } from '../../types/view-preferences'
import type { CollectionContentItem } from '../../types/collection-content'
import { CollectionPage } from './CollectionPage'

vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'recipient' }, isAuthorized: true }) }))
vi.mock('../../services/collections', () => ({
  CollectionsError: class extends Error {},
  getCollectionOverview: vi.fn().mockResolvedValue({ collectionId: 'collection', ownerId: 'real-owner', name: 'Favoris',
    collectionType: 'free', access: 'shared', targetType: null, targetName: null, ownedCount: 0, totalCount: 2 }),
}))
vi.mock('../../services/collection-content', () => ({ getCollectionContent: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({
  getUserPreferences: vi.fn().mockResolvedValue(DEFAULT_USER_PREFERENCES),
  saveUserPreferences: vi.fn().mockImplementation((_viewer, patch: { lastCollectionView: CollectionView }) =>
    Promise.resolve({ ...DEFAULT_USER_PREFERENCES, ...patch })),
  getCollectionViewOverride: vi.fn().mockResolvedValue(null),
}))
afterEach(() => { vi.restoreAllMocks() })

test('selector changes both renderers immediately, preserves search and content query, saves only viewer last choice', async () => {
  const first: CollectionContentItem = { collectionItemId: 'first', variantId: '42', cardNameFr: 'Pikachu',
    setNameFr: 'Extension', setAbbreviationFr: null, setAbbreviation: 'EXT', seriesNameFr: null, seriesNameSource: null,
    localId: '025', variantLabel: null, imageUrl: null, origin: 'manual', owned: false }
  vi.mocked(getCollectionContent).mockResolvedValue([first, { ...first, collectionItemId: 'second', variantId: '43', cardNameFr: 'Évoli' }])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/collections/collection']}><Routes>
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  // Include the real lazy chunk's transform time in the parallel full suite.
  await screen.findByText('Pikachu · EXT · 025', {}, { timeout: 5000 })
  const list = screen.getByRole('button', { name: 'Liste' })
  const cards = screen.getByRole('button', { name: 'Cartes' })
  expect(list).toHaveAttribute('aria-pressed', 'true')
  expect(cards).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Classeur' })).toHaveAttribute('aria-pressed', 'false')
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'pikachu EXT' } })
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  fireEvent.click(cards)
  expect(cards).toHaveAttribute('aria-pressed', 'true')
  expect(list).toHaveAttribute('aria-pressed', 'false')
  expect(search).toHaveValue('pikachu EXT')
  expect(screen.getByRole('listitem').closest('ul')).toHaveClass('collection-card-grid')
  expect(screen.getByRole('listitem')).toHaveTextContent('Pikachu')
  fireEvent.change(search, { target: { value: 'absent' } })
  expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  fireEvent.change(search, { target: { value: 'pikachu EXT' } })
  fireEvent.click(list)
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  expect(search).toHaveValue('pikachu EXT')
  expect(screen.getByRole('listitem')).toHaveTextContent('Pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Classeur' }))
  await screen.findByRole('region', { name: 'Classeur' })
  expect(search).toHaveValue('pikachu EXT')
  expect(screen.getAllByRole('listitem')).toHaveLength(9)
  expect(screen.getByRole('region', { name: 'Classeur' }).querySelectorAll('.is-search-muted')).toHaveLength(1)
  fireEvent.click(list)
  fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
  expect(screen.getAllByRole('listitem').map(row => row.querySelector('.collection-content-name')?.textContent))
    .toEqual(['Pikachu · EXT · 025', 'Évoli · EXT · 025'])
  expect(getCollectionContent).toHaveBeenCalledExactlyOnceWith('collection')
  await waitFor(() => expect(saveUserPreferences).toHaveBeenCalledTimes(4))
  expect(saveUserPreferences).toHaveBeenNthCalledWith(1, 'recipient', { lastCollectionView: 'cards' })
  expect(saveUserPreferences).toHaveBeenNthCalledWith(2, 'recipient', { lastCollectionView: 'list' })
  expect(saveUserPreferences).toHaveBeenNthCalledWith(3, 'recipient', { lastCollectionView: 'binder' })
  expect(saveUserPreferences).toHaveBeenNthCalledWith(4, 'recipient', { lastCollectionView: 'list' })
  expect(client.getQueryData(['user-preferences', 'recipient'])).toEqual(DEFAULT_USER_PREFERENCES)
})
