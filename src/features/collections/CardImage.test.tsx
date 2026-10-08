import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import cardPlaceholder from '../../assets/placeholders/card-placeholder.webp'
import { CardImage } from './CardImage'

test('null image and network error share the WebP; placeholder failure cannot loop', () => {
  const { rerender } = render(<CardImage url={null} name="Pikachu" />)
  const fallback = screen.getByRole('img', { name: 'Image indisponible' })
  expect(fallback).toHaveAttribute('src', cardPlaceholder)
  fireEvent.error(fallback)
  expect(fallback).toHaveAttribute('src', cardPlaceholder)
  rerender(<CardImage url="/remote.webp" name="Pikachu" />)
  fireEvent.error(screen.getByRole('img', { name: 'Pikachu' }))
  expect(screen.getByRole('img', { name: 'Image indisponible' })).toHaveAttribute('src', cardPlaceholder)
  rerender(<CardImage url="/replacement.webp" name="Pikachu" />)
  expect(screen.getByRole('img', { name: 'Pikachu' })).toHaveAttribute('src', '/replacement.webp')
})
