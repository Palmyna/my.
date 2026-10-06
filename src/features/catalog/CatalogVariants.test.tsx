import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { expect, test, vi } from 'vitest'
import { catalogCard, catalogPokemon, catalogSet } from '../../test/catalog-fixtures'
import { CatalogVariants } from './CatalogVariants'

function Path() { return <p data-testid="path">{useLocation().pathname}</p> }

test.each([
  { context: 'Pokémon', variants: catalogPokemon.variants, expected: 'Pikachu · EV (SV) · 025', label: 'Holo' },
  { context: 'Extension', variants: catalogSet.variants, set: catalogSet, expected: 'Duo électrique · EV05 (TEF) · 025', label: 'Reverse' },
  { context: 'Carte', variants: catalogCard.variants, card: catalogCard, expected: 'Duo électrique · EV05 (TEF) · 025/165', label: 'Reverse' },
])('$context Cards use exactly two shared presentation rows and keep Detail independent', props => {
  const onDetail = vi.fn()
  const { container } = render(<MemoryRouter><CatalogVariants {...props} view="cards" onDetail={onDetail} /><Path /></MemoryRouter>)
  const row = screen.getAllByRole('listitem')[0]!
  const info = row.querySelector('.catalog-variant-info')!
  expect(info.children).toHaveLength(2)
  expect(info.children[0]).toHaveTextContent(props.expected)
  expect(info.children[1]).toHaveTextContent(props.label)
  expect(row.querySelector('time, .catalog-pokemon-links')).toBeNull()
  expect(container.querySelector('button a, a button, a a')).toBeNull()
  const opener = within(row).getByRole('button', { name: /^Voir le détail/ })
  fireEvent.click(opener)
  expect(onDetail).toHaveBeenCalledExactlyOnceWith(props.variants[0]!.variantId, opener)
  const cardLink = within(row).queryByRole('link', { name: /Pikachu|Duo électrique/ })
  if (cardLink) {
    onDetail.mockClear(); fireEvent.click(cardLink)
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/cards/300')
    expect(onDetail).not.toHaveBeenCalled()
  }
})

test.each([
  { localId: null, setAbbreviationFr: null, setAbbreviation: null, expected: 'Pikachu' },
  { localId: '25', setAbbreviationFr: null, setAbbreviation: null, expected: 'Pikachu · 25' },
  { localId: null, setAbbreviationFr: null, setAbbreviation: 'SV', expected: 'Pikachu · SV' },
])('missing Card fields have no empty separator: $expected', fields => {
  render(<MemoryRouter><CatalogVariants variants={[{ ...catalogPokemon.variants[0]!, ...fields,
    setNameFr: null, setNameSource: null, variantLabel: null }]}
    view="cards" onDetail={vi.fn()} /></MemoryRouter>)
  const info = screen.getByRole('listitem').querySelector('.catalog-variant-info')!
  expect(info.children[0]?.textContent).toBe(fields.expected)
  expect(info.children[1]).toHaveTextContent('Variante indisponible')
})

test('Pokemon Cards retain the existing Extension link when abbreviation metadata is absent', () => {
  render(<MemoryRouter><CatalogVariants variants={[{ ...catalogPokemon.variants[0]!, setAbbreviationFr: null, setAbbreviation: null }]}
    view="cards" onDetail={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Écarlate et Violet' })).toHaveAttribute('href', '/catalog/extensions/50')
  expect(screen.getByRole('listitem').querySelector('.catalog-card-line')).toHaveTextContent('Pikachu · Écarlate et Violet · 025')
})

test('List keeps Extension Pokemon and Card effective dates without repeating reference context', () => {
  const { rerender } = render(<MemoryRouter><CatalogVariants variants={catalogSet.variants} set={catalogSet} view="list" onDetail={vi.fn()} /></MemoryRouter>)
  expect(within(screen.getAllByRole('listitem')[0]!).getByRole('group', { name: 'Pokémon' })).toBeVisible()
  rerender(<MemoryRouter><CatalogVariants variants={catalogCard.variants} card={catalogCard} view="list" onDetail={vi.fn()} /></MemoryRouter>)
  expect(screen.getByText('1 avril 2024')).toHaveAttribute('datetime', '2024-04-01')
  expect(screen.getAllByRole('listitem')[0]!.querySelector('.catalog-card-line')).toBeNull()
})
