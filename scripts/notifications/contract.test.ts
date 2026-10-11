import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import pg from 'pg'
import { publicationSchema, publicationCanonical, publicationHash } from './contract.ts'
import { parseCommand, publisherConfig, safeError } from './publish.ts'

const example: unknown = JSON.parse(readFileSync(new URL('./examples/announcement.json', import.meta.url), 'utf8'))
const p = publicationSchema.parse(example)
describe('notification publication contract', () => {
  test('strict examples, ordinary and changelog', () => {
    expect(publicationSchema.parse(example)).toEqual(p)
    expect(publicationSchema.parse(JSON.parse(readFileSync(new URL('./examples/changelog.json', import.meta.url), 'utf8')))).toMatchObject({ category: 'changelog', app_version: '0.8.16' })
  })
  test.each([
    { publication_key: 'Évil' }, { publication_key: 'x'.repeat(121) }, { category: 'unknown' }, { published_at: '2020-01-01' },
    { title: '\u00a0\t\n' }, { title: 'x'.repeat(201) }, { body: 'x'.repeat(20001) }, { title: 'Two\nlines' },
    { body: '<script>alert(1)</script>' }, { body: '<img onerror=alert(1)>' }, { body: 'https://evil.invalid' },
    { body: '//evil.invalid' }, { body: 'javascript:alert(1)' }, { body: 'data:text/html,evil' }, { body: 'www.evil.invalid' },
    { body: '\u0000' }, { body: '\ud800' }, { action: { kind: 'unknown' } }, { action: { kind: 'notification_content', url: '/evil' } },
    { action: { kind: 'collection_preview', collection_id: 'x' } }, { category: 'changelog' }, { app_version: '01.2.3' },
    { app_version: '1.0.0-01' }, { requires_action: true }, { include_new_users: true }, { include_new_users: 'true' },
    { publication_context: { reason: 'Test', include_new_users_justification: null, secret: 'x' } },
    { publication_context: { reason: '  ', include_new_users_justification: null } },
    { publication_context: { reason: 'Test', include_new_users_justification: 'Unneeded' } },
    { expires_at: 'infinity' }, { expires_at: '2027-02-29T00:00:00Z' }, { expires_at: '2027-01-01T00:00:00.1234567Z' },
    { expires_at: '9999-12-31T23:59:59-01:00' }, { expires_at: '0001-01-01T00:00:00+01:00' },
  ])('reject invalid or malicious payload %j', delta => {
    expect(publicationSchema.safeParse({ ...p, ...delta }).success).toBe(false)
  })
  test('normalization, Unicode code points, LF, NFC, timezone and exact microseconds', () => {
    const normalized = publicationSchema.parse({ ...p, title: ' \u00a0Cafe\u0301 😀\u3000', body: ' \r\nOne\rTwo\r\nThree\t ', expires_at: '2030-01-01T01:02:03.123456+01:00' })
    expect(normalized).toMatchObject({ title: 'Café 😀', body: 'One\nTwo\nThree', expires_at: '2030-01-01T00:02:03.123456Z' })
    expect(publicationSchema.safeParse({ ...p, title: '😀'.repeat(200) }).success).toBe(true)
    expect(publicationSchema.safeParse({ ...p, title: '😀'.repeat(201) }).success).toBe(false)
    expect(publicationHash(normalized)).toBe(publicationHash(publicationSchema.parse({ ...normalized, body: '\nOne\r\nTwo\nThree  ' })))
    expect(publicationHash(normalized)).not.toBe(publicationHash({ ...normalized, body: 'Changed' }))
    expect(publicationCanonical(normalized)).toBe(JSON.stringify(['my.notification.publication.v1', p.publication_key, 'announcement', 'Café 😀', 'One\nTwo\nThree', null, 'notification_content', false, false, '2030-01-01T00:02:03.123456Z', p.publication_context.reason, null]))
  })
  test('hash independent of input object ordering and changes with every business field', () => {
    expect(publicationHash(publicationSchema.parse(Object.fromEntries(Object.entries(p).reverse())))).toBe(publicationHash(p))
    const changes = [{ publication_key: 'other' }, { category: 'changelog', app_version: '0.8.16' }, { title: 'Other' }, { body: 'Other' },
      { app_version: '0.8.16' }, { action: null }, { include_new_users: true, publication_context: { ...p.publication_context, include_new_users_justification: 'Current' } },
      { expires_at: '2030-01-01T00:00:00Z' }, { publication_context: { ...p.publication_context, reason: 'Other' } }]
    for (const change of changes) expect(publicationHash(publicationSchema.parse({ ...p, ...change }))).not.toBe(publicationHash(p))
  })
})
describe('terminal modes and secret hygiene', () => {
  test('valid modes', () => {
    expect(parseCommand(['--file', 'a.json', '--validate'])).toEqual({ mode: 'validate', file: 'a.json' })
    expect(parseCommand(['--file', 'a.json', '--apply', '--environment', 'local'])).toEqual({ mode: 'apply', file: 'a.json' })
    expect(parseCommand(['--withdraw', 'key', '--environment', 'local'])).toEqual({ mode: 'withdraw', key: 'key' })
  })
  test.each([[], ['--file', 'a'], ['--file', 'a', '--apply'], ['--withdraw', 'key'], ['--validate'],
    ['--file', 'a', '--apply', '--validate'], ['--file', 'a', '--validate', '--environment', 'local'],
    ['--file', 'a', '--withdraw', 'key', '--environment', 'local'], ['--withdraw', 'key', '--apply', '--environment', 'local'],
    ['--file', 'a', '--apply', '--environment', 'cloud'], ['--file', 'a', '--validate', '--validate'], ['--file', 'a', '--file', 'b', '--validate'],
    ['--unknown', 'postgres://operator:secret@evil.invalid'],
  ].map(args => [args]))('refuse incoherent arguments %j', args => expect(() => parseCommand(args)).toThrow())
  test.each([undefined, 'postgres://postgres:secret@127.0.0.1:55322/postgres', 'postgres://my_notification_publisher:secret@remote.invalid:55322/postgres',
    'postgres://my_notification_publisher:secret@127.0.0.1:55322/postgres?sslmode=no-verify', 'postgres://my_notification_publisher@127.0.0.1:55322/postgres'])('reject unsafe connection without echoing it', connection => {
    expect(() => publisherConfig(connection)).toThrow()
    try { publisherConfig(connection) } catch (error) { expect(safeError(error)).not.toContain('secret') }
  })
  test('raw driver and process errors never printed', () => {
    expect(safeError(new Error('postgres://operator:secret@host/path'))).not.toContain('operator:secret')
    const error = new pg.DatabaseError('publication_key_conflict', 0, 'error'); error.code = '23505'
    expect(safeError(error)).toContain('publication_key_conflict')
    expect(publisherConfig('postgres://my_notification_publisher:placeholder@127.0.0.1:55322/postgres').ssl).toBe(false)
  })
  test('actual CLI validation works with no PostgreSQL or environment, bad arguments sanitized', () => {
    const stdout = execFileSync(process.execPath, ['scripts/notifications/publish.ts', '--file', 'scripts/notifications/examples/announcement.json', '--validate'],
      { encoding: 'utf8', env: { ...process.env, MY_NOTIFICATION_DATABASE_URL: '' }, windowsHide: true })
    expect(JSON.parse(stdout)).toMatchObject({ outcome: 'validated', content_hash: publicationHash(p) })
    const failed = spawnSync(process.execPath, ['scripts/notifications/publish.ts', '--url', 'postgres://operator:secret@host/path'], { encoding: 'utf8', windowsHide: true })
    expect(failed.status).toBe(1); expect(failed.stderr).not.toContain('operator:secret')
  })
})
