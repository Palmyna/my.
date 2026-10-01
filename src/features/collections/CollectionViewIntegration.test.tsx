import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getCollectionContent } from '../../services/collection-content'
import { saveUserPreferences } from '../../services/view-preferences'
import type { CollectionView } from '../../types/view-preferences'
import type { CollectionContentItem } from '../../types/collection-content'
import { availableCollectionViews } from './collection-views'
import { CollectionPage } from './CollectionPage'

const control = vi.hoisted<{ setView: ((view: CollectionView) => Promise<boolean>) | null }>(() => ({ setView: null }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'recipient' }, isAuthorized: true }) }))
vi.mock('./useCollectionView', async original => {
  const actual = await original<typeof import('./useCollectionView')>()
  return { useCollectionView: (id: string) => {
    const state = actual.useCollectionView(id)
    control.setView = state.setCurrentView
    return state
  } }
})
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
}))
afterEach(() => { vi.restoreAllMocks() })

test('page search survives programmatic renderer changes; same ordered content query and viewer save', async () => {
  // Model a future available view only inside this test. No renderer is shipped.
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const first: CollectionContentItem = { collectionItemId: 'first', variantId: '42', cardNameFr: 'Pikachu',
    setNameFr: 'Extension', setAbbreviationFr: null, setAbbreviation: 'EXT', seriesNameFr: null, seriesNameSource: null,
    localId: '025', variantLabel: null, imageUrl: null, origin: 'manual', owned: false }
  vi.mocked(getCollectionContent).mockResolvedValue([first, { ...first, collectionItemId: 'second', variantId: '43', cardNameFr: 'Évoli' }])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/collections/collection']}><Routes>
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  await screen.findByText('Pikachu · EXT · 025')
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'pikachu EXT' } })
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  await act(async () => { expect(await control.setView!('cards')).toBe(true) })
  expect(search).toHaveValue('pikachu EXT')
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  await act(async () => { expect(await control.setView!('list')).toBe(true) })
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  expect(search).toHaveValue('pikachu EXT')
  expect(screen.getByRole('listitem')).toHaveTextContent('Pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
  expect(screen.getAllByRole('listitem').map(row => row.querySelector('.collection-content-name')?.textContent))
    .toEqual(['Pikachu · EXT · 025', 'Évoli · EXT · 025'])
  expect(getCollectionContent).toHaveBeenCalledExactlyOnceWith('collection')
  expect(saveUserPreferences).toHaveBeenNthCalledWith(1, 'recipient', { lastCollectionView: 'cards' })
  expect(saveUserPreferences).toHaveBeenNthCalledWith(2, 'recipient', { lastCollectionView: 'list' })
})
