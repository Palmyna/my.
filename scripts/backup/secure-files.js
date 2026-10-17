import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable, Writable } from 'node:stream'
import { execFileSync } from 'node:child_process'
import { requireBackup, BackupError } from './contract.js'

const magic = Buffer.from('MYBK0001')
export function encryptionKey(value = process.env.MY_BACKUP_KEY) {
  requireBackup(typeof value === 'string' && /^[a-zA-Z0-9+/]{43}=$/.test(value), 'encryption_key_required')
  const key = Buffer.from(value, 'base64')
  requireBackup(key.length === 32 && key.toString('base64') === value, 'encryption_key_invalid')
  return key
}
export async function restrictDirectory(directory) {
  if (process.platform === 'win32') {
    try {
      const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).match(/S-1-5-[0-9-]+/)[0]
      execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
        { windowsHide: true, stdio: 'pipe' })
    } catch { throw new BackupError('restrictive_ACL_failed') }
  } else await fs.chmod(directory, 0o700)
}
// Verify existing operator files without repairing or concealing a permissive
// ACL. Paths travel on stdin, never through an interpolated shell command.
export async function verifyPrivatePaths(paths) {
  if (process.platform === 'win32') {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $paths=ConvertFrom-Json ([Console]::In.ReadToEnd()); foreach($p in $paths) { $acl=Get-Acl -LiteralPath $p; foreach($r in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) { if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @($sid,'S-1-5-18')) { exit 1 } } }"],
      { input: JSON.stringify(paths), timeout: 15_000, maxBuffer: 1_048_576,
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch { throw new BackupError('operator_storage_permissions_unverified') }
  } else {
    for (const path of paths) requireBackup(((await fs.stat(path)).mode & 0o077) === 0, 'operator_storage_permissions_unverified')
  }
}
export const bytes = value => Readable.from([Buffer.isBuffer(value) ? value : Buffer.from(value)])
export const discard = () => new Writable({ write(_chunk, _encoding, done) { done() } })
export async function encryptFile(input, filename, key) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(magic)
  await fs.writeFile(filename, Buffer.concat([magic, nonce]), { flag:'wx', mode:0o600 })
  await pipeline(input, cipher, createWriteStream(filename, { flags:'a' }))
  await fs.appendFile(filename,cipher.getAuthTag())
  const handle = await fs.open(filename, 'r+')
  try { await handle.sync() } finally { await handle.close() }
}
async function decryptStream(filename, key, output) {
  let handle, failure
  try {
    let size
    const header = Buffer.alloc(20), tag = Buffer.alloc(16)
    try {
      handle = await fs.open(filename, 'r')
      size = (await handle.stat()).size
    } catch { throw new BackupError('encrypted_file_read_failed') }
    requireBackup(size > 36, 'encrypted_file_truncated')
    let headerRead, tagRead
    try {
      headerRead = (await handle.read(header, 0, 20, 0)).bytesRead
      tagRead = (await handle.read(tag, 0, 16, size - 16)).bytesRead
    } catch { throw new BackupError('encrypted_file_read_failed') }
    requireBackup(headerRead === 20 && tagRead === 16, 'encrypted_file_truncated')
    requireBackup(header.subarray(0, 8).equals(magic), 'encrypted_file_format_invalid')
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8))
    decipher.setAAD(magic)
    decipher.setAuthTag(tag)
    // Keep read, crypto and consumer errors at their own boundaries. A pipeline
    // can destroy a Decipher stream with a consumer's EPIPE; that is not GCM failure.
    await pipeline(async function* () {
      const buffer = Buffer.alloc(64 * 1024)
      for (let position = 20; position < size - 16;) {
        let read
        try { read = await handle.read(buffer, 0, Math.min(buffer.length, size - 16 - position), position) }
        catch { throw new BackupError('encrypted_file_read_failed') }
        requireBackup(read.bytesRead > 0, 'encrypted_file_truncated')
        position += read.bytesRead
        let plaintext
        try { plaintext = decipher.update(buffer.subarray(0, read.bytesRead)) }
        catch { throw new BackupError('encrypted_file_authentication_failed') }
        yield plaintext
      }
      let final
      try { final = decipher.final() }
      catch { throw new BackupError('encrypted_file_authentication_failed') }
      yield final
    }, output)
  } catch (error) {
    failure = error instanceof BackupError ? error : new BackupError('encrypted_file_pipeline_failed')
  } finally {
    if (handle) try { await handle.close() }
    catch { failure ??= new BackupError('encrypted_file_read_failed') }
  }
  if (failure) throw failure
}
export async function decryptFile(filename, key, output = discard()) {
  // Authenticate before exposing plaintext to a consumer. No plaintext file is created.
  await decryptStream(filename, key, discard())
  await decryptStream(filename, key, output)
}
export async function decryptJson(filename, key) {
  const chunks = []
  let length = 0
  const output = new Writable({ write(chunk, _encoding, done) {
    length += chunk.length
    if (length > 32 * 1024 * 1024) return done(new Error('limit'))
    chunks.push(chunk); done()
  } })
  await decryptFile(filename, key, output)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new BackupError('encrypted_json_invalid') }
}
export async function fileHash(filename) {
  const hash = createHash('sha256')
  let size = 0
  await pipeline(createReadStream(filename), new Writable({ write(chunk, _encoding, done) {
    hash.update(chunk); size += chunk.length; done()
  } }))
  return { sha256: hash.digest('hex'), bytes: size }
}
export function hashBytes(value) { return createHash('sha256').update(value).digest('hex') }
export function decryptBytes(ciphertext,key) {
  try {
    requireBackup(ciphertext.length>36&&ciphertext.subarray(0,8).equals(magic),'encrypted_file_format_invalid')
    const decipher=createDecipheriv('aes-256-gcm',key,ciphertext.subarray(8,20))
    decipher.setAAD(magic);decipher.setAuthTag(ciphertext.subarray(-16))
    // No plaintext reaches a consumer until final() has validated the tag.
    return Buffer.concat([decipher.update(ciphertext.subarray(20,-16)),decipher.final()])
  } catch {throw new BackupError('encrypted_file_authentication_failed')}
}
