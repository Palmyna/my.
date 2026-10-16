import { readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { TLSSocket, checkServerIdentity, type ConnectionOptions } from 'node:tls'
import type pg from 'pg'

type TlsTarget = { ca_file: string; ca_sha256: string; host: string }

// Shared by private operator tools. Never accept URL SSL overrides or fall back
// to another CA, hostname, protocol or plaintext transport.
export function verifiedTlsConfig(target: TlsTarget): ConnectionOptions {
  if (!statSync(target.ca_file).isFile() || statSync(target.ca_file).size > 1_000_000) throw new Error('tls_ca_invalid')
  const ca = readFileSync(target.ca_file)
  if (createHash('sha256').update(ca).digest('hex') !== target.ca_sha256) throw new Error('tls_ca_invalid')
  return { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: target.host,
    checkServerIdentity: (_hostname, certificate) => checkServerIdentity(target.host, certificate) }
}

// Inspect the client leg, including with Supavisor. pg_stat_ssl describes the
// separate PostgreSQL leg and cannot attest the operator's negotiated socket.
export function verifyPostgresTls(client: pg.Client, target: Pick<TlsTarget, 'host'>): void {
  const stream: unknown = (client as unknown as { connection: { stream: unknown } }).connection.stream
  if (!(stream instanceof TLSSocket) || stream.authorized !== true
    || !['TLSv1.2', 'TLSv1.3'].includes(stream.getProtocol() ?? '')
    || checkServerIdentity(target.host, stream.getPeerCertificate()) !== undefined) {
    throw new Error('tls_transport_unverified')
  }
}
