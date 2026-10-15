import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { parseCommand, safeDiagnostic } from './cli.js'
import { connectionConfig, MaintenanceError } from './database.js'
import { browserSnippet, checkResponse, observeHttp } from './http-check.js'

const target = ['--environment', 'local', '--project', 'my-local']
const expected = ['--expect-system-id', '7512345678901234567', '--expect-revision', '9007199254740997']
test('binding exact decimals; reopening requires explicit operator consent', () => {
  assert.equal(parseCommand(['--command', 'close', ...target, ...expected]).revision, '9007199254740997')
  assert.throws(() => parseCommand(['--command', 'reopen', ...target, ...expected]), MaintenanceError)
  assert.equal(parseCommand(['--command', 'reopen', ...target, ...expected, '--authorize-reopen']).command, 'reopen')
  for (const args of [
    ['--command', 'close', ...target], ['--command', 'preflight', ...target, '--environment', 'cloud'],
    ['--command', 'close', ...target, ...expected, '--authorize-reopen'],
    ['--command', 'close', ...target, ...expected, '--timeout-ms', 'Infinity'],
    ['--command', 'preflight', ...target, '--unknown'], ['--command', 'preflight', '--environment', 'cloud', '--project', 'my-local'],
  ]) assert.throws(() => parseCommand(args), MaintenanceError)
})
test('remote, query options, fragments and service identities rejected before connecting', () => {
  for (const url of ['postgresql://service_role:secret@127.0.0.1:55322/postgres',
    'postgresql://postgres:secret@db.example.com:55322/postgres', 'postgresql://postgres:secret@127.0.0.1:55322/other',
    'postgresql://postgres:secret@127.0.0.1:55322/postgres?sslmode=no-verify',
    'postgresql://postgres:secret@127.0.0.1:55322/postgres#secret', 'invalid-secret']) {
    assert.throws(() => connectionConfig(url), { message: 'target_or_operator_invalid' })
  }
})
test('error outputs contain only fixed diagnostics', () => {
  const error = Object.assign(new Error('postgresql://secret@host private SQL personal data'), { code: '57014' })
  assert.equal(safeDiagnostic(error), 'statement_timeout_state_unknown')
  assert.equal(safeDiagnostic(new Error('token secret')), 'connection_or_command_failed_state_unknown')
})
test('HTTP Authentication, generic 503, cached success and missing headers never attest maintenance', () => {
  const headers = new Headers({ 'cache-control': 'no-store, no-cache, max-age=0, must-revalidate',
    'pragma': 'no-cache', 'expires': '0', 'x-robots-tag': 'noindex, nofollow, noarchive', 'content-type': 'text/html',
    'content-security-policy': "default-src 'none'" })
  assert.equal(checkResponse(503, headers, '<title>Maintenance en cours · MY.</title>', 'GET', 'closed').verified, true)
  assert.equal(checkResponse(503, headers, '', 'HEAD', 'closed').verified, true)
  for (const [status, body] of [[401, 'MY. maintenance'], [302, 'login'], [503, 'Vercel unavailable'], [200, '<div id="root">'], [304, '']]) {
    assert.equal(checkResponse(status, headers, body, 'GET', 'closed').verified, false)
  }
  assert.equal(checkResponse(503, new Headers(), 'MY. maintenance', 'GET', 'closed').verified, false)
  assert.equal(checkResponse(200, headers, 'Vercel login', 'GET', 'open').verified, false)
  assert.equal(checkResponse(200, headers, '<div id="root">', 'GET', 'open').verified, true)
  headers.set('content-security-policy', "default-src 'none'; report-uri https://example.invalid?token=secret; script-src 'nonce-secret'")
  assert.ok(!JSON.stringify(checkResponse(503, headers, '', 'HEAD', 'closed')).includes('secret'))
  assert.ok(!browserSnippet('closed').includes('protection-bypass'))
  assert.ok(browserSnippet('closed').includes('backup_authorized: false'))
})
test('generated browser check runs with ordinary same-origin authentication and reports unavailable targets', async () => {
  const results = []
  const calls = []
  await runInNewContext(browserSnippet('open'), { URL, AbortSignal,
    location: { origin: 'https://example.invalid' }, console: { log: result => results.push(result) },
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (url.pathname === '/login') throw Error('secret network message')
      return new Response('<div id="root">', { status: 200 })
    } })
  assert.equal(results[0].sampled_HTTP_verified, false)
  assert.equal(results[0].worldwide_propagation_verified, false)
  assert.equal(results[0].backup_authorized, false)
  assert.ok(!JSON.stringify(results).includes('secret'))
  assert.equal(calls.length, 8)
  assert.ok(calls.every(c => c.options.credentials === 'same-origin' && c.options.redirect === 'manual' && !c.options.headers))
  await assert.rejects(observeHttp('http://127.0.0.1', ['/secret?token=secret'], 'closed'), { message: 'public_path_invalid' })
})
