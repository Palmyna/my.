import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

// SCRAM verifier only reaches administrative SQL, never a plaintext password.
// Used exclusively by opt-in Local or disposable PostgreSQL tests.
export function scramVerifier(password: string): string {
  const salt = randomBytes(16), salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const stored = createHash('sha256').update(clientKey).digest('base64')
  const server = createHmac('sha256', salted).update('Server Key').digest('base64')
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`
}
