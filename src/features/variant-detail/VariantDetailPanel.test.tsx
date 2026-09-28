import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { getVariantDetail, VariantDetailError } from '../../services/variant-detail'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, updatePhysicalCopy, type PhysicalCopy } from '../../services/physical-copies'
import type { VariantDetail } from '../../types/variant-detail'
import { VariantDetailPanel } from './VariantDetailPanel'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/variant-detail', async original => ({ ...await original<typeof import('../../services/variant-detail')>(), getVariantDetail: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(),
  listPhysicalCopies: vi.fn(), createPhysicalCopy: vi.fn(), updatePhysicalCopy: vi.fn(), deletePhysicalCopy: vi.fn() }))

const variantId = '9007199254740995'
const detail: VariantDetail = { variantId, cardNameFr: 'Pikachu', imageUrl: 'https://example.test/card.webp', localId: '025',
  setNameFr: 'Écarlate et Violet', setNameSource: 'Scarlet & Violet', setAbbreviationFr: 'EV', setAbbreviation: 'SV',
  seriesNameFr: 'Série FR', seriesNameSource: 'Source series', rarity: 'Rare', category: 'Pokémon',
  variantLabel: 'Holo spéciale', variantType: 'holo', variantSubtype: null, variantSize: 'standard', variantFoil: 'cosmos',
  variantStamps: ['staff', 'promo'], effectiveReleaseDate: '2026-01-01', dateOrigin: 'override' }
const get = vi.mocked(getVariantDetail), list = vi.mocked(listPhysicalCopies)
const create = vi.mocked(createPhysicalCopy), update = vi.mocked(updatePhysicalCopy), remove = vi.mocked(deletePhysicalCopy)
let rows: PhysicalCopy[]
const fixture = (id: string, name: string | null = null, note: string | null = null): PhysicalCopy => ({ id, name, note, created_at: '2026-09-28T00:00:00Z' })
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.user.id = 'owner'; auth.isAuthorized = true; rows = []
  get.mockReset().mockResolvedValue(detail)
  list.mockReset().mockImplementation(() => Promise.resolve([...rows]))
  create.mockReset().mockImplementation((_id, name, note = '') => { rows.push(fixture(`copy-${rows.length}`, name.trim() || null, note.trim() ? note : null)); return Promise.resolve() })
  update.mockReset().mockImplementation((id, name, note) => { rows = rows.map(copy => copy.id === id ? { ...copy, name: name.trim() || null, note: note.trim() ? note : null } : copy); return Promise.resolve() })
  remove.mockReset().mockImplementation(id => { rows = rows.filter(copy => copy.id !== id); return Promise.resolve() })
})
function Harness({ id = variantId, readOnly = false }: { id?: string; readOnly?: boolean }) {
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  return <><button onClick={event => setOpener(event.currentTarget)}>Ouvrir</button>
    {opener && <VariantDetailPanel variantId={id} ownerId="owner" readOnly={readOnly} opener={opener} onClose={() => setOpener(null)} />}</>
}
function setup(readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const tree = (id = variantId) => <QueryClientProvider client={client}><Harness id={id} readOnly={readOnly} /></QueryClientProvider>
  const view = render(tree())
  const opener = screen.getByRole('button', { name: 'Ouvrir' }); opener.focus(); fireEvent.click(opener)
  return { client, opener, rerender: (id?: string) => view.rerender(tree(id)) }
}
const close = () => fireEvent.click(screen.getByRole('button', { name: 'Fermer le détail' }))
const cancel = () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
async function copyAction(label: string, action: 'Modifier' | 'Supprimer') {
  fireEvent.click(await screen.findByRole('button', { name: `Actions de ${label}` }))
  fireEvent.click(screen.getByRole('button', { name: action }))
}

test('catalogue metadata, French date, omissions, image and safe unavailable fallback', async () => {
  setup(); await screen.findByRole('heading', { name: 'Pikachu' })
  expect(get).toHaveBeenCalledExactlyOnceWith(variantId)
  for (const value of ['Écarlate et Violet (Scarlet & Violet)', 'EV (SV)', 'Série FR', '025', 'Rare', 'Pokémon', '1 janvier 2026', 'holo', 'cosmos', 'staff, promo']) {
    expect(screen.getByText(value, { selector: 'dd' })).toBeVisible()
  }
  expect(screen.getByRole('img', { name: 'Pikachu' })).toHaveAttribute('src', detail.imageUrl)
  fireEvent.error(screen.getByRole('img', { name: 'Pikachu' }))
  expect(screen.getByRole('img', { name: 'Image indisponible' })).toBeVisible()
  for (const text of ['Sous-type', 'Taille', 'Source series', 'override', variantId, 'variant_id', 'date_origin']) expect(screen.queryByText(text)).not.toBeInTheDocument()
  await screen.findByText('Manquante'); expect(screen.getByText('Aucun exemplaire.')).toBeVisible()
})

test('null fields, equal and source-only values are rendered without invented fallbacks', async () => {
  get.mockResolvedValue({ ...detail, cardNameFr: null, imageUrl: null, localId: null, setNameFr: null, setNameSource: 'Source',
    setAbbreviationFr: 'SV', setAbbreviation: 'SV', seriesNameFr: null, seriesNameSource: 'Source series', rarity: null,
    category: null, variantLabel: null, variantType: null, variantFoil: null, variantSize: 'jumbo', variantStamps: [], effectiveReleaseDate: null })
  setup(); await screen.findByRole('heading', { name: 'Nom indisponible' })
  expect(screen.getByText('Source', { selector: 'dd' })).toBeVisible()
  expect(screen.getByText('SV', { selector: 'dd' })).toBeVisible()
  expect(screen.getByText('Source series')).toBeVisible(); expect(screen.getByText('jumbo')).toBeVisible()
  for (const text of ['Numéro', 'Rareté', 'Catégorie', 'Date de sortie', 'Version', 'Type', 'Finition', 'Stamps']) expect(screen.queryByText(text)).not.toBeInTheDocument()
})

test('loading can close, errors retry explicitly; variant_unavailable has no invented cause', async () => {
  let loaded!: (value: VariantDetail) => void
  get.mockReturnValueOnce(new Promise(resolve => { loaded = resolve }))
  const { opener } = setup()
  expect(screen.getByText('Chargement de la version…')).toBeVisible(); close(); expect(opener).toHaveFocus()
  await act(() => { loaded(detail); return Promise.resolve() })
  get.mockRejectedValueOnce(new Error('private server details'))
  fireEvent.click(opener)
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les informations de cette version.')
  expect(get).toHaveBeenCalledTimes(2)
  get.mockRejectedValueOnce(new VariantDetailError('variant_unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  await screen.findByText('Cette version n’est pas disponible.')
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  await screen.findByRole('heading', { name: 'Pikachu' })
  expect(get).toHaveBeenCalledTimes(4)
  close(); expect(opener).toHaveFocus()
})

test('Escape, focus trap and body scroll restoration', async () => {
  document.body.style.overflow = 'auto'
  const { opener } = setup(); await screen.findByText('Aucun exemplaire.')
  expect(document.body.style.overflow).toBe('hidden')
  const dialog = screen.getByRole('dialog')
  const first = within(dialog).getByRole('button', { name: 'Fermer le détail' })
  const last = within(dialog).getByRole('button', { name: 'Ajouter un exemplaire' })
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus()
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus()
  cancel(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus()
  expect(document.body.style.overflow).toBe('auto'); document.body.style.overflow = ''
})

test('changing variant or reader never displays old catalogue or copies; auth loss hides panel', async () => {
  rows = [fixture('secret', 'Ancien exemplaire')]
  const { rerender } = setup(); await screen.findByText('Ancien exemplaire')
  get.mockReturnValue(new Promise(() => {}))
  list.mockReturnValue(new Promise(() => {}))
  rerender('42')
  expect(screen.queryByRole('heading', { name: 'Pikachu' })).not.toBeInTheDocument()
  expect(screen.queryByText('Ancien exemplaire')).not.toBeInTheDocument()
  expect(get).toHaveBeenLastCalledWith('42')
  auth.user.id = 'recipient'; rerender()
  expect(screen.queryByRole('heading', { name: 'Pikachu' })).not.toBeInTheDocument()
  auth.isAuthorized = false; rerender(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('inline creation, edit and confirmed deletion keep notes and derive possession from refetched rows', async () => {
  const { client } = setup(); await screen.findByText('Manquante')
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemplaire' }))
  const note = '  Recto intact\n📝 Verso  '
  fireEvent.change(screen.getByRole('textbox', { name: 'État / note (facultatif)' }), { target: { value: note } })
  // Mutation success alone cannot create possession: hold the authoritative reread.
  let refreshed!: (rows: PhysicalCopy[]) => void
  list.mockImplementationOnce(() => new Promise(resolve => { refreshed = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith(variantId, '', note))
  expect(screen.getByText('Manquante')).toBeVisible()
  get.mockRejectedValueOnce(new Error('background catalogue failure'))
  await act(async () => { await client.refetchQueries({ queryKey: ['variant-detail', 'owner', variantId] }) })
  expect(screen.getByRole('textbox', { name: 'État / note (facultatif)' })).toHaveValue(note)
  close(); cancel(); expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!); expect(create).toHaveBeenCalledTimes(1)
  await act(() => { refreshed([...rows]); return Promise.resolve() })
  await screen.findByText('Possédée'); await screen.findByText('Exemplaire 1')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Exemplaire 1' }))
  expect(screen.getByText(/Recto intact/).textContent).toBe(note)
  await copyAction('Exemplaire 1', 'Modifier')
  expect(screen.getByRole('textbox', { name: 'État / note (facultatif)' })).toHaveValue(note)
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom (facultatif)' }), { target: { value: 'Cadeau' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await screen.findByText('Cadeau'); expect(update).toHaveBeenCalledExactlyOnceWith('copy-0', 'Cadeau', note)
  await copyAction('Cadeau', 'Supprimer'); expect(remove).not.toHaveBeenCalled()
  expect(screen.getByText(/La carte restera dans vos collections/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  await screen.findByText('Manquante'); await screen.findByText('Aucun exemplaire.')
  expect(remove).toHaveBeenCalledExactlyOnceWith('copy-0')
})

test.each([false, true])('multiple copies; readOnly=%s enforces actual owner, names and notes', async readOnly => {
  if (readOnly) auth.user.id = 'recipient'
  rows = [fixture('a'), fixture('b', 'Cadeau', 'Note du propriétaire'), fixture('c')]
  setup(readOnly); await screen.findByText('Possédée')
  expect(list).toHaveBeenCalledExactlyOnceWith('owner', variantId)
  for (const name of ['Exemplaire 1', 'Cadeau', 'Exemplaire 3']) expect(screen.getByText(name)).toBeVisible()
  expect(screen.getByRole('heading', { name: readOnly ? 'Exemplaires' : 'Mes exemplaires' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Cadeau' }))
  expect(screen.getByText('Note du propriétaire')).toBeVisible()
  expect(screen.queryAllByRole('button', { name: /Actions de/ })).toHaveLength(readOnly ? 0 : 3)
  if (readOnly) expect(screen.queryByRole('button', { name: /Ajouter|Modifier|Supprimer/ })).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})
