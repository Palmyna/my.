// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { maintenanceResponse } from './maintenance-page.ts'

it('provides a French accessible document with no resource, script, form or application dependency', async () => {
  const response = maintenanceResponse(new Request('https://my.example/'))
  const document = new DOMParser().parseFromString(await response.text(), 'text/html')
  expect(document.documentElement.lang).toBe('fr')
  expect(document.title).toBe('Maintenance en cours · MY.')
  expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain('width=device-width')
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex')
  expect(document.querySelectorAll('h1')).toHaveLength(1)
  const main = document.querySelector('main')
  expect(main?.getAttribute('aria-labelledby')).toBe(document.querySelector('h1')?.id)
  expect(main?.textContent).toContain('MY. est momentanément indisponible')
  expect(main?.textContent).toContain('Le service reviendra prochainement.')
  expect(document.querySelectorAll('script, link, img, iframe, form, input, button, a')).toHaveLength(0)
  expect(document.querySelector('style')?.textContent).not.toMatch(/@import|url\(|animation/i)
  expect(document.querySelector('.logo')?.getAttribute('aria-hidden')).toBe('true')
})

it('embeds the official logo unchanged; source changes require refreshing the standalone snapshot', async () => {
  const source = readFileSync('src/assets/brand/my-logo.svg', 'utf8')
  const page = await maintenanceResponse(new Request('https://my.example/')).text()
  expect(page.match(/<svg[\s\S]*?<\/svg>/)?.[0]).toBe(source.match(/<svg[\s\S]*?<\/svg>/)?.[0])
})
