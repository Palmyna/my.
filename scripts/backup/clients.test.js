import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { encryptFile, bytes } from './secure-files.js'
import { inspectArchive } from './clients.js'

const target = { format: 'my-backup-target-v1', environment: 'isolated', client_image: `sha256:${'a'.repeat(64)}` }

async function fixture(t, { code = 0, inputCode = 'EPIPE', stderr = '', startup = false, onInput,
  stdout = 'SYNTHETIC TOC', endCode } = {}) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'my-prod7c-input-'))
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()), 'my-prod7c-input-')))
    await fs.rm(directory, { recursive: true })
  })
  const key = randomBytes(32), file = join(directory, 'large.myb')
  t.after(() => key.fill(0))
  await encryptFile(bytes(Buffer.alloc(8 * 1024 * 1024, 42)), file, key)
  const child = new EventEmitter()
  child.stdout = new PassThrough(); child.stderr = new PassThrough()
  let closed = false, written = 0
  const close = () => {
    if (closed) return
    closed = true
    child.stdout.end(stdout); child.stderr.end(stderr)
    child.emit('close', code)
  }
  child.kill = () => { close(); return true }
  child.stdin = new Writable({ write(chunk, _encoding, callback) {
    written += chunk.length
    Promise.resolve().then(() => onInput?.(file)).then(() => {
      if (inputCode) {
        callback(Object.assign(new Error('SYNTHETIC_SECRET_PIPE'), { code: inputCode }))
        queueMicrotask(close)
      } else callback()
    }, callback)
  }, final(callback) {
    callback(endCode ? Object.assign(new Error('SYNTHETIC_SECRET_END'), { code: endCode }) : undefined)
    queueMicrotask(close)
  } })
  const mock = t.mock.method(childProcess, 'spawn', () => {
    if (startup) queueMicrotask(() => {
      child.stdin.destroy()
      child.emit('error', Object.assign(new Error('SYNTHETIC_SECRET_START'), { code: 'ENOENT' }))
      close()
    })
    return child
  })
  syncBuiltinESMExports()
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports() })
  return { file, key, child, written: () => written }
}

test('list accepts EPIPE only after process success and drains remaining authenticated input', async t => {
  const f = await fixture(t)
  assert.equal(await inspectArchive(target, f.file, f.key, true), 'SYNTHETIC TOC')
  assert.ok(f.written() < 8 * 1024 * 1024)
})

test('destroyed list input still requires successful process completion', async t => {
  const f = await fixture(t, { inputCode: 'ERR_STREAM_DESTROYED' })
  assert.equal(await inspectArchive(target, f.file, f.key, true), 'SYNTHETIC TOC')
})

test('EPIPE during input finalization also requires a successful list process', async t => {
  const f = await fixture(t, { inputCode: null, endCode: 'EPIPE' })
  assert.equal(await inspectArchive(target, f.file, f.key, true), 'SYNTHETIC TOC')
})

for (const fault of ['corrupt', 'truncate', 'read']) {
  test(`successful early list cannot hide a later ${fault} failure`, async t => {
    const f = await fixture(t, { onInput: async file => {
      if (fault === 'truncate') await fs.truncate(file, 128 * 1024)
      if (fault === 'corrupt') {
        const handle = await fs.open(file, 'r+')
        try {
          const position = (await handle.stat()).size - 17, byte = Buffer.alloc(1)
          await handle.read(byte, 0, 1, position); byte[0] ^= 1
          await handle.write(byte, 0, 1, position)
        }
        finally { await handle.close() }
      }
    } })
    if (fault === 'read') {
      const open = fs.open.bind(fs)
      t.mock.method(fs, 'open', async (...args) => {
        const handle = await open(...args), read = handle.read.bind(handle)
        t.mock.method(handle, 'read', async (...readArgs) => {
          if (f.written() > 0 && readArgs[3] >= 128 * 1024) throw new Error('SYNTHETIC_SECRET_READ')
          return read(...readArgs)
        })
        return handle
      })
    }
    await assert.rejects(inspectArchive(target, f.file, f.key, true), {
      message: ({ corrupt: 'encrypted_file_authentication_failed', truncate: 'encrypted_file_truncated',
        read: 'encrypted_file_read_failed' })[fault],
    })
    assert.ok(f.written() > 0)
  })
}

test('full archive inspection rejects early input closure even with process exit zero', async t => {
  const f = await fixture(t)
  await assert.rejects(inspectArchive(target, f.file, f.key), { message: 'postgresql_tool_input_closed_early' })
})

for (const list of [false, true]) {
  test(`nonzero PostgreSQL exit remains a process error (list=${list})`, async t => {
    const f = await fixture(t, { code: 1, stderr: 'SYNTHETIC_SECRET_POSTGRES' })
    await assert.rejects(inspectArchive(target, f.file, f.key, list), { message: 'postgresql_tool_failed_or_warned' })
  })
}

test('stderr with exit zero remains refused', async t => {
  const f = await fixture(t, { stderr: 'SYNTHETIC_SECRET_WARNING' })
  await assert.rejects(inspectArchive(target, f.file, f.key, true), { message: 'postgresql_tool_failed_or_warned' })
})

for (const code of [0, 1]) {
  test(`fully consumed input still requires process success (exit=${code})`, async t => {
    const f = await fixture(t, { code, inputCode: null })
    if (code === 0) assert.equal(await inspectArchive(target, f.file, f.key), '')
    else await assert.rejects(inspectArchive(target, f.file, f.key), { message: 'postgresql_tool_failed_or_warned' })
    assert.equal(f.written(), 8 * 1024 * 1024)
  })
}

test('plaintext, keys and provider diagnostics never enter logs or full-read results', async t => {
  const logs = []
  t.mock.method(console, 'log', (...args) => logs.push(args))
  t.mock.method(console, 'error', (...args) => logs.push(args))
  const f = await fixture(t, { inputCode: null, stdout: 'SYNTHETIC_SECRET_SQL' })
  assert.equal(await inspectArchive(target, f.file, f.key), '')
  assert.deepEqual(logs, [])
})

test('startup failure and abnormal input failure retain distinct sanitized diagnostics', async t => {
  await t.test('startup', async t => {
    const f = await fixture(t, { startup: true })
    await assert.rejects(inspectArchive(target, f.file, f.key, true), { message: 'postgresql_tool_unavailable' })
  })
  await t.test('input', async t => {
    const f = await fixture(t, { inputCode: 'EIO' })
    await assert.rejects(inspectArchive(target, f.file, f.key, true), { message: 'postgresql_tool_input_failed' })
  })
})
