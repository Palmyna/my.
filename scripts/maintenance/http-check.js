import { parseArgs } from 'node:util'

// Shared with the generated browser snippet. No dependency or credential input.
export function checkResponse(status, headers, body, method, expected) {
  const get = name => headers.get(name) ?? ''
  const observed = { status, headers: Object.fromEntries(['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control',
    'pragma', 'expires', 'x-robots-tag', 'content-type'].map(name => [name, get(name)])),
    csp_default_none: get('content-security-policy').includes("default-src 'none'") } // Never print CSP nonces or report URLs.
  const closed = status === 503 && /no-store/i.test(get('cache-control')) && /no-cache/i.test(get('cache-control'))
    && /max-age=0/i.test(get('cache-control')) && /must-revalidate/i.test(get('cache-control'))
    && /no-cache/i.test(get('pragma')) && get('expires') === '0'
    && ['noindex', 'nofollow', 'noarchive'].every(token => get('x-robots-tag').includes(token))
    && /text\/html/i.test(get('content-type')) && get('content-security-policy').includes("default-src 'none'")
    && (method === 'HEAD' ? body === '' : body.includes('<title>Maintenance en cours · MY.</title>'))
  const open = status === 200 && (method === 'HEAD' || body.includes('<div id="root">'))
  return { ...observed, verified: expected === 'closed' ? closed : open,
    scope: 'one_authorized_HTTP_response_no_global_propagation_or_backend_proof' }
}

export async function observeHttp(origin, paths, expected) {
  const evidence = []
  for (let index = 0; index < paths.length; index++) {
    // Routes must be public paths without secrets. Never log URL, cookies, auth or body.
    if (!/^\/[a-zA-Z0-9/_.-]*$/.test(paths[index])) throw new Error('public_path_invalid')
    for (const method of ['GET', 'HEAD']) {
      try {
        const response = await fetch(new URL(paths[index], origin), { method, credentials: 'same-origin',
          cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000) })
        const body = method === 'HEAD' ? '' : (await response.text()).slice(0, 100_000)
        evidence.push({ target_index: index, method, ...checkResponse(response.status, response.headers, body, method, expected) })
      } catch { evidence.push({ target_index: index, method, verified: false, diagnostic: 'HTTP_unavailable_or_authentication_or_CSP_required' }) }
    }
  }
  return { expected, evidence, sampled_HTTP_verified: evidence.length > 0 && evidence.every(e => e.verified),
    worldwide_propagation_verified: false, backup_authorized: false }
}

export function browserSnippet(expected) {
  if (!['closed', 'open'].includes(expected)) throw new Error('expected_state_invalid')
  return `// Future authorized use only. Existing Vercel login, same origin; no Authentication bypass.\n` +
    `// Keep a pre-maintenance authorized tab whose CSP permits fetch. Otherwise use Network navigation.\n` +
    `// Add real JS/CSS paths for CLOSED checks; OPEN checks below concern SPA HTML only.\n` +
    `(async () => {\n${checkResponse.toString()}\n${observeHttp.toString()}\n` +
    `console.log(await observeHttp(location.origin, ['/', '/login', '/dashboard', '/index.html'], '${expected}'));\n})();\n`
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ strict: true, allowPositionals: false,
      options: { 'print-browser': { type: 'boolean' }, expect: { type: 'string' } } })
    if (values['print-browser'] !== true || process.argv.slice(2).filter(a => a.startsWith('--')).length !== 2) throw new Error()
    process.stdout.write(browserSnippet(values.expect))
  } catch { console.error('Choisir --print-browser --expect closed|open. Génération hors connexion uniquement.'); process.exitCode = 1 }
}
