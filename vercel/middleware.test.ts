import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import middleware from '../middleware.ts'

const connection = 'https://global-config.vercel.com/ecfg_prod1_test?token=synthetic-read-token'
const fetchConfig = vi.fn<typeof fetch>()

function setState(value: unknown) {
  fetchConfig.mockResolvedValue(new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('GLOBAL_CONFIG', connection)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubGlobal('fetch', fetchConfig)
  fetchConfig.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.useRealTimers())

describe('Production maintenance through the actual Global Config SDK', () => {
  it('continues the original request only for the boolean false', async () => {
    setState(false)
    const response = await middleware(new Request('https://my.example/collections/123?view=binder'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.has('x-middleware-rewrite')).toBe(false)
    expect(response.headers.has('location')).toBe(false)
    expect(response.headers.has('cache-control')).toBe(false)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(await response.text()).toBe('')
    expect(fetchConfig).toHaveBeenCalledOnce()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns an autonomous 503 without caching or indexing', async () => {
    setState(true)
    const response = await middleware(new Request('https://my.example/dashboard'))
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('MY. est momentanément indisponible')
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store, no-cache, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.has('x-middleware-next')).toBe(false)
    expect(response.headers.has('x-middleware-rewrite')).toBe(false)
    expect(response.headers.has('location')).toBe(false)
    expect(response.headers.has('retry-after')).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    '/', '/login', '/mfa/verify', '/dashboard', '/catalog/pokemon/25', '/collections/123',
    '/index.html', '/assets/index-hash.js', '/assets/style-hash.css', '/favicon.ico',
    '/robots.txt', '/api/example', '/.well-known/example', '/_vercel/example',
    '/missing.html', '/dashboard/', '/%61ssets/index.js', '//assets/index.js',
    '/dashboard?maintenance=false&bypass=true',
  ])('closes %s before any continuation or SPA rewrite', async (path) => {
    setState(true)
    const request = new Request(`https://my.example${path}`, {
      headers: {
        cookie: 'maintenance=false; operator=true',
        authorization: 'Bearer synthetic-operator',
        'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware',
        'x-middleware-next': '1',
        'x-vercel-protection-bypass': 'synthetic-bypass',
        range: 'bytes=0-200',
        'if-none-match': 'old-app-etag',
      },
    })
    const response = await middleware(request)
    expect(response.status).toBe(503)
    expect(response.headers.has('x-middleware-next')).toBe(false)
    expect(response.headers.has('x-middleware-rewrite')).toBe(false)
    expect(await response.text()).not.toContain('synthetic-operator')
  })

  it.each(['GET', 'HEAD', 'POST', 'OPTIONS'])('closes %s; HEAD has no body', async (method) => {
    setState(true)
    const response = await middleware(new Request('https://my.example/assets/app.js', { method }))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.text()
    if (method === 'HEAD') expect(body).toBe('')
    else expect(body).toContain('MY. est momentanément indisponible')
  })

  it.each([null, 'false', 'true', 0, 1, [], {}, { enabled: false }])('closes invalid state %j', async (value) => {
    setState(value)
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    expect(console.error).toHaveBeenCalledWith('[MY. maintenance] state_invalid')
  })

  it('closes an absent key', async () => {
    fetchConfig.mockResolvedValue(new Response(null, {
      status: 404,
      headers: { 'x-edge-config-digest': 'synthetic-digest' },
    }))
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
  })

  it.each([401, 404, 429, 500, 503])('closes an unavailable store (HTTP %i)', async (status) => {
    fetchConfig.mockResolvedValue(new Response(null, { status }))
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    expect(console.error).toHaveBeenCalledWith('[MY. maintenance] config_unavailable')
  })

  it.each([undefined, '', 'invalid-connection'])('closes missing/invalid connection %s', async (value) => {
    vi.stubEnv('GLOBAL_CONFIG', value)
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    expect(fetchConfig).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'Production', 'custom'])('closes unknown environment %s', async (value) => {
    vi.stubEnv('VERCEL_ENV', value)
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    expect(fetchConfig).not.toHaveBeenCalled()
  })

  it('closes network errors without exposing SDK errors or credentials', async () => {
    fetchConfig.mockRejectedValue(new Error(connection))
    const response = await middleware(new Request('https://my.example/'))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain(connection)
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[MY. maintenance] config_unavailable')
  })

  it('closes malformed JSON', async () => {
    fetchConfig.mockResolvedValue(new Response('not-json'))
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
  })

  it('reads the origin per request with no stale-if-error or development cache', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    setState(false)
    await middleware(new Request('https://my.example/'))
    await middleware(new Request('https://my.example/'))
    expect(fetchConfig).toHaveBeenCalledTimes(2)
    for (const [url, options] of fetchConfig.mock.calls) {
      expect(url).toEqual(expect.stringContaining('/item/maintenance_production?'))
      expect(url).not.toEqual(expect.stringContaining('synthetic-read-token'))
      expect(options?.cache).toBe('no-store')
      const headers = new Headers(options?.headers)
      expect(headers.get('x-edge-config-min-updated-at')).toBe(String(Number.MAX_SAFE_INTEGER))
      expect(headers.has('cache-control')).toBe(false)
    }
  })

  it('keeps closed on a read error after an earlier open response', async () => {
    setState(false)
    expect((await middleware(new Request('https://my.example/'))).headers.get('x-middleware-next')).toBe('1')
    fetchConfig.mockResolvedValue(new Response(null, { status: 503 }))
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
  })

  it('observes persistent changes across requests without a build or a reopening timer', async () => {
    vi.useFakeTimers()
    setState(false)
    expect((await middleware(new Request('https://my.example/'))).headers.get('x-middleware-next')).toBe('1')
    setState(true)
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000)
    expect((await middleware(new Request('https://my.example/'))).status).toBe(503)
    setState(false)
    expect((await middleware(new Request('https://my.example/'))).headers.get('x-middleware-next')).toBe('1')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns 503 after 3 seconds; a late false cannot reopen that response', async () => {
    vi.useFakeTimers()
    let finishRead: ((response: Response) => void) | undefined
    fetchConfig.mockImplementation(() => new Promise<Response>((resolve) => { finishRead = resolve }))
    const pending = middleware(new Request('https://my.example/'))
    await vi.advanceTimersByTimeAsync(3_000)
    const response = await pending
    expect(response.status).toBe(503)
    expect(console.error).toHaveBeenCalledWith('[MY. maintenance] config_unavailable')
    finishRead?.(new Response('false'))
    await vi.advanceTimersByTimeAsync(0)
    expect(response.status).toBe(503)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Preview and development isolation', () => {
  it('leaves an unconnected Preview unchanged, without reading Production or Supabase', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('GLOBAL_CONFIG', undefined)
    const response = await middleware(new Request('https://preview.example/login'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(fetchConfig).not.toHaveBeenCalled()
  })

  it.each([true, false, null])('uses only the Preview key when connected: %j', async (state) => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VITE_SUPABASE_URL', undefined)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined)
    setState(state)
    const response = await middleware(new Request('https://preview.example/login'))
    expect(response.status).toBe(state === false ? 200 : 503)
    expect(fetchConfig.mock.calls[0]?.[0]).toEqual(expect.stringContaining('/item/maintenance_preview?'))
  })

  it('leaves vercel dev unchanged without a remote read', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    setState(true)
    expect((await middleware(new Request('http://localhost/login'))).headers.get('x-middleware-next')).toBe('1')
    expect(fetchConfig).not.toHaveBeenCalled()
  })
})

it('configures middleware on all requests and preserves the existing SPA fallback', () => {
  const deployment: unknown = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  expect(deployment).toEqual({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    proxy: { entrypoint: 'middleware.ts' },
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  })
})
