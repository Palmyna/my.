import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as catalogIdentity from '../../lib/catalog-identity'
import * as collectionIdentity from '../dashboard/collection-color'
import { GlobalSearchError, searchGlobalNavigation } from '../../services/global-search'
import type { GlobalNavigationSuggestion } from '../../types/global-search'
import { GlobalSearch } from './GlobalSearch'

vi.mock('../../services/global-search', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/global-search')>(), searchGlobalNavigation: vi.fn(),
}))
const search = vi.mocked(searchGlobalNavigation)
const suggestions: GlobalNavigationSuggestion[] = [
  { kind: 'pokemon', pokemonId: '25', nameFr: 'Pikachu', dexNumber: 25, primaryType: 'electric', secondaryType: null },
  { kind: 'set', setId: '73', nameFr: 'Légendes Brillantes', nameSource: 'Shining Legends', abbreviationFr: 'SL3.5', abbreviation: 'SLG', logoUrl: null },
  { kind: 'collection', collectionId: '00000000-0000-0000-0000-000000000001', name: 'Mes favoris', access: 'owned',
    collectionType: 'free', targetType: null, targetName: null, targetPrimaryType: null, targetSecondaryType: null },
  { kind: 'collection', collectionId: '00000000-0000-0000-0000-000000000002', name: 'Pikachu partagé', access: 'shared',
    collectionType: 'automatic', targetType: 'pokemon', targetName: 'Pikachu', targetPrimaryType: 'electric', targetSecondaryType: null },
  { kind: 'card', sourceCardId: '9007199254740995', nameFr: 'Pikachu', localId: '028', setNameFr: 'Légendes Brillantes',
    setAbbreviationFr: 'SL3.5', setAbbreviation: 'SLG', imageUrl: null, pokemon: [] },
]
function Path() { return <p data-testid="path">{useLocation().pathname}</p> }
function setup(viewerId = 'alice') {
  const client = new QueryClient()
  const ui = (viewer: string) => <StrictMode><QueryClientProvider client={client}><MemoryRouter>
    <GlobalSearch key={viewer} viewerId={viewer} /><button>Extérieur</button><Path />
  </MemoryRouter></QueryClientProvider></StrictMode>
  const rendered = render(ui(viewerId))
  return { ...rendered, client, viewer: (viewer: string) => rendered.rerender(ui(viewer)) }
}
const input = () => screen.getByRole('searchbox', { name: 'Rechercher sur MY.' })
function type(query: string) { fireEvent.change(input(), { target: { value: query } }) }
async function advance(ms = 300) {
  await act(() => vi.advanceTimersByTimeAsync(ms))
  // Query starts after React commits ready; drain its batched notification.
  await act(() => vi.advanceTimersByTimeAsync(0))
}
async function results() { type('Pikachu'); await advance(301); return within(screen.getByRole('list')).getAllByRole('link') }
function deferred() {
  let resolve!: (rows: GlobalNavigationSuggestion[]) => void
  return { promise: new Promise<GlobalNavigationSuggestion[]>(done => { resolve = done }), resolve: (rows: GlobalNavigationSuggestion[]) => resolve(rows) }
}
beforeEach(() => { vi.useFakeTimers(); search.mockReset().mockResolvedValue(suggestions) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

test.each(['', 'a', 'ab', '😀😀'])('aucun appel ni popup sous trois caractères Unicode : %s', async value => {
  setup(); type(value); await advance(1000)
  expect(search).not.toHaveBeenCalled()
  expect(input()).not.toHaveAttribute('aria-controls')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
test('300 ms exacts, délai annulé par nouvelle saisie et query brute transmise', async () => {
  setup(); type('Pik'); await advance(299)
  expect(search).not.toHaveBeenCalled()
  type(' Pikachu '); await advance(299)
  expect(search).not.toHaveBeenCalled()
  await advance(1)
  expect(search).toHaveBeenCalledExactlyOnceWith(' Pikachu ')
})
test('trois caractères hors BMP atteignent le seuil Unicode', async () => {
  setup(); type('😀😀😀'); await advance(300)
  expect(search).toHaveBeenCalledExactlyOnceWith('😀😀😀')
})
test.each(['a', '😀'])('limite à 200 caractères Unicode sans couper les caractères %s', async char => {
  setup(); type(char.repeat(201)); expect(input()).toHaveValue(char.repeat(200))
  await advance(300); expect(search).toHaveBeenCalledExactlyOnceWith(char.repeat(200))
})
test('chargement dès debounce puis requête, sans résultats actifs', async () => {
  const pending = deferred(); search.mockReturnValue(pending.promise)
  setup(); type('Pikachu')
  expect(screen.getByRole('status')).toHaveTextContent('Recherche en cours…')
  await advance(300)
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  await act(() => { pending.resolve(suggestions); return Promise.resolve() }); await advance(1)
  expect(screen.getByRole('list')).toBeInTheDocument()
})
test('quatre catégories, ordre serveur, données compactes et identité partagée prioritaire', async () => {
  const pokemon = vi.spyOn(catalogIdentity, 'resolvePokemonIdentity')
  const functional = vi.spyOn(catalogIdentity, 'resolveFunctionalIdentity')
  const collection = vi.spyOn(collectionIdentity, 'resolveCollectionIdentity')
  setup(); const links = await results()
  expect(links.map(link => within(link).getByText(/^(Pokémon|Extension|Collection|Carte)$/).textContent))
    .toEqual(['Pokémon', 'Extension', 'Collection', 'Collection', 'Carte'])
  expect(links[0]).toHaveTextContent('Pikachu#0025Pokémon')
  expect(links[1]).toHaveTextContent('Légendes BrillantesSL3.5 (SLG)Extension')
  expect(links[2]).toHaveTextContent('Mes favorisPersonnaliséeCollection')
  expect(links[3]).toHaveTextContent('Partagée · Lecture seule')
  expect(links[4]).toHaveTextContent('028 · Légendes Brillantes · SL3.5 (SLG)')
  expect(pokemon).toHaveBeenCalledWith('electric', null)
  expect(functional).toHaveBeenCalledWith('set')
  expect(collection).toHaveBeenCalledWith(suggestions[2])
  expect(collection).toHaveBeenCalledWith(suggestions[3])
  expect(links[3]?.style.getPropertyValue('--search-accent')).toBe(catalogIdentity.resolveFunctionalIdentity('shared').primaryAccent)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
test('fallback Extension source et cible collection automatique depuis payload uniquement', async () => {
  search.mockResolvedValue([{ ...suggestions[1] as Extract<GlobalNavigationSuggestion, { kind: 'set' }>, nameFr: null },
    { ...suggestions[3] as Extract<GlobalNavigationSuggestion, { kind: 'collection' }>, access: 'owned' }])
  setup(); const links = await results()
  expect(links[0]).toHaveTextContent('Shining Legends')
  expect(links[1]).toHaveTextContent('Pokémon · Pikachu')
})
test('aucun résultat conserve texte et popup, texte utilisateur rendu sans HTML', async () => {
  search.mockResolvedValue([]); setup(); type('<img>'); await advance(301)
  expect(screen.getByRole('status')).toHaveTextContent('Aucun résultat pour « <img> »')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(input()).toHaveAttribute('aria-controls')
})
test.each([new Error('PostgreSQL secret'), new GlobalSearchError('not_authorized'), new GlobalSearchError('invalid_query')])('erreur assainie, sans retry ni effacement : %s', async error => {
    search.mockRejectedValue(error); setup(); type('Pikachu'); await advance(301)
    expect(screen.getByRole('alert')).not.toHaveTextContent('PostgreSQL secret')
    if (error instanceof GlobalSearchError && error.code === 'not_authorized') expect(screen.getByRole('alert')).toHaveTextContent('Reconnectez-vous')
    expect(input()).toHaveValue('Pikachu'); await advance(10_000)
    expect(search).toHaveBeenCalledOnce()
    search.mockResolvedValue(suggestions); type('Raichu'); await advance(301)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
test('retire ancienne liste dès frappe, ignore réponses tardives même A → B → A', async () => {
  setup(); await results()
  const old = deferred(), current = deferred()
  search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  type('Raichu'); expect(screen.queryByRole('list')).not.toBeInTheDocument()
  await advance(300); type('Pikachu'); await advance(300)
  await act(() => {
    old.resolve([{ ...suggestions[0] as Extract<GlobalNavigationSuggestion, { kind: 'pokemon' }>, nameFr: 'Ancienne réponse' }])
    return Promise.resolve()
  })
  await advance(1)
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  await act(() => { current.resolve(suggestions); return Promise.resolve() }); await advance(1)
  expect(screen.queryByText('Ancienne réponse')).not.toBeInTheDocument()
  expect(screen.getByRole('list')).toBeInTheDocument()
})
test.each([0, 1, 2, 3, 4])('activation explicite %s : route exacte, fermeture et effacement', async index => {
  setup(); const links = await results()
  const routes = ['/catalog/pokemon/25', '/catalog/extensions/73', '/collections/00000000-0000-0000-0000-000000000001',
    '/collections/00000000-0000-0000-0000-000000000002', '/catalog/cards/9007199254740995']
  expect(links[index]).toHaveAttribute('href', routes[index])
  fireEvent.click(links[index]!)
  expect(screen.getByTestId('path')).toHaveTextContent(routes[index]!)
  expect(input()).toHaveValue(''); expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
test('ordre Tab natif, focus interne conservé, Escape restitue champ et réouverture fraîche sans appel', async () => {
  setup(); const links = await results()
  act(() => input().focus())
  const tab = createEvent.keyDown(input(), { key: 'Tab' }); fireEvent(input(), tab)
  expect(tab.defaultPrevented).toBe(false)
  expect(Array.from(screen.getByRole('search').querySelectorAll('input, a'))).toEqual([input(), ...links])
  for (const link of links) { act(() => link.focus()); expect(link).toHaveFocus(); expect(screen.getByRole('list')).toBeInTheDocument() }
  const reverse = createEvent.keyDown(links[1]!, { key: 'Tab', shiftKey: true }); fireEvent(links[1]!, reverse)
  expect(reverse.defaultPrevented).toBe(false)
  act(() => links[0]!.focus()); fireEvent.keyDown(links[0]!, { key: 'Escape' })
  expect(input()).toHaveFocus(); expect(screen.queryByRole('list')).not.toBeInTheDocument()
  act(() => input().blur()); act(() => input().focus())
  expect(screen.getByRole('list')).toBeInTheDocument(); expect(search).toHaveBeenCalledOnce()
})
test('réouverture périmée recharge sans garder anciens liens actifs', async () => {
  setup(); await results(); fireEvent.keyDown(document, { key: 'Escape' }); await advance(30_001)
  const pending = deferred(); search.mockReturnValue(pending.promise)
  act(() => input().blur()); act(() => input().focus())
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Recherche en cours…')
  expect(search).toHaveBeenCalledTimes(2)
})
test('Enter ferme focus clavier seulement, conserve suggestions sans navigation', async () => {
  setup(); await results(); act(() => input().focus()); fireEvent.keyDown(input(), { key: 'Enter' })
  expect(input()).not.toHaveFocus(); expect(input()).toHaveValue('Pikachu')
  expect(screen.getByRole('list')).toBeInTheDocument(); expect(screen.getByTestId('path')).toHaveTextContent('/')
})
test('clic extérieur ferme sans déplacer focus de destination', async () => {
  setup(); await results(); const outside = screen.getByRole('button', { name: 'Extérieur' })
  fireEvent.pointerDown(outside); act(() => outside.focus())
  expect(outside).toHaveFocus(); expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
test('viewer isolé, anciens caches collectés, timer nettoyé au démontage', async () => {
  const { client, viewer, unmount } = setup(); await results()
  type('Raichu'); await advance(301)
  expect(client.getQueryCache().findAll({ queryKey: ['global-search', 'alice'] })).toHaveLength(1)
  viewer('bob'); expect(input()).toHaveValue(''); expect(screen.queryByRole('list')).not.toBeInTheDocument()
  type('Pikachu'); await advance(301)
  expect(client.getQueryCache().findAll({ queryKey: ['global-search', 'alice'] })).toHaveLength(0)
  expect(client.getQueryCache().findAll({ queryKey: ['global-search', 'bob'] })).toHaveLength(1)
  type('Nouvelle'); unmount(); await advance(300)
  expect(search).toHaveBeenCalledTimes(3)
})
