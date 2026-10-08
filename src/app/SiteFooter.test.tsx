import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { version } from '../../package.json'
import { SiteFooter } from './SiteFooter'
import source from './SiteFooter.tsx?raw'

test('affiche le copyright MY. avec la version injectée depuis package.json', () => {
  expect(__APP_VERSION__).toBe(version)
  render(<SiteFooter />)
  const footer = screen.getByRole('contentinfo')
  expect(within(footer).getByText('Conditions d’utilisation')).toBeVisible()
  expect(within(footer).getByText(`© 2026 · MY. · v${__APP_VERSION__}`)).toBeVisible()
})

test('ne duplique aucune version littérale dans le composant footer', () => {
  expect(source).not.toMatch(/\bv?\d+\.\d+\.\d+\b/)
})
