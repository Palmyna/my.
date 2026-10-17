import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Writable } from 'node:stream'
import { encryptFile, decryptFile, decryptJson, decryptBytes, bytes } from './secure-files.js'

async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'my-prod7c-crypto-'))
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()), 'my-prod7c-crypto-')))
    await fs.rm(directory, { recursive: true })
  })
  const file = join(directory, 'synthetic.myb'), key = randomBytes(32)
  t.after(() => key.fill(0))
  const plaintext = Buffer.from('SYNTHETIC_AUTH_PASSWORD_TOKEN')
  await encryptFile(bytes(plaintext), file, key)
  return { directory, file, key, plaintext }
}

test('stream and memory readers retain the MYBK0001 format and exact plaintext', async t => {
  const f = await fixture(t), chunks = []
  const encrypted = await fs.readFile(f.file)
  assert.equal(encrypted.subarray(0, 8).toString(), 'MYBK0001')
  assert.equal(encrypted.length, f.plaintext.length + 36)
  assert.ok(!encrypted.includes(f.plaintext))
  await decryptFile(f.file, f.key, new Writable({ write(chunk, _encoding, callback) {
    chunks.push(chunk); callback()
  } }))
  assert.deepEqual(Buffer.concat(chunks), f.plaintext)
  assert.deepEqual(decryptBytes(encrypted, f.key), f.plaintext)
  const json = join(f.directory, 'metadata.myb')
  await encryptFile(bytes(JSON.stringify({ synthetic: true })), json, f.key)
  assert.deepEqual(await decryptJson(json, f.key), { synthetic: true })
})

for (const fault of ['tag', 'key', 'AAD', 'nonce', 'ciphertext', 'truncated', 'format']) {
  test(`reject ${fault} before exposing plaintext`, async t => {
    const f = await fixture(t)
    const encrypted = await fs.readFile(f.file)
    let key = f.key, diagnostic = 'encrypted_file_authentication_failed'
    if (fault === 'tag') encrypted[encrypted.length - 1] ^= 1
    if (fault === 'key') key = randomBytes(32)
    if (fault === 'nonce') encrypted[8] ^= 1
    if (fault === 'ciphertext') encrypted[20] ^= 1
    if (fault === 'AAD') {
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
      cipher.setAAD(Buffer.from('WRONG_CONTEXT'))
      await fs.writeFile(f.file, Buffer.concat([Buffer.from('MYBK0001'), nonce,
        cipher.update(f.plaintext), cipher.final(), cipher.getAuthTag()]))
    } else if (fault === 'truncated') {
      await fs.truncate(f.file, 22); diagnostic = 'encrypted_file_truncated'
    } else {
      if (fault === 'format') { encrypted[0] ^= 1; diagnostic = 'encrypted_file_format_invalid' }
      await fs.writeFile(f.file, encrypted)
    }
    let exposed = 0
    await assert.rejects(decryptFile(f.file, key, new Writable({ write(chunk, _encoding, callback) {
      exposed += chunk.length; callback()
    } })), { message: diagnostic })
    assert.equal(exposed, 0)
  })
}

test('file read and consumer pipeline failures keep separate sanitized diagnostics', async t => {
  const f = await fixture(t)
  await assert.rejects(decryptFile(join(f.directory, 'missing'), f.key), { message: 'encrypted_file_read_failed' })
  for (const code of ['EPIPE', 'EIO']) {
    await assert.rejects(decryptFile(f.file, f.key, new Writable({ write(_chunk, _encoding, callback) {
      callback(Object.assign(new Error('SYNTHETIC_SECRET'), { code }))
    } })), { message: 'encrypted_file_pipeline_failed' })
  }
})
