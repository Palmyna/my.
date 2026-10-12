import { readFileSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { z } from 'zod'
import { assertLocalUrl } from '../catalog/database.ts'
import { publicationKey, publicationSchema, publicationHash, publishedResult, withdrawnResult } from './contract.ts'
import type { Publication } from './contract.ts'

export class NotificationCliError extends Error {}
type Command = { mode: 'validate' | 'apply'; file: string } | { mode: 'withdraw'; key: string }
export function parseCommand(args: string[]): Command {
  let values: { file?: string; validate?: boolean; apply?: boolean; withdraw?: string; environment?: string }
  try {
    values = parseArgs({ args, options: { file: { type: 'string' }, validate: { type: 'boolean' }, apply: { type: 'boolean' },
      withdraw: { type: 'string' }, environment: { type: 'string' } }, strict: true, allowPositionals: false }).values
  } catch { throw new NotificationCliError('Arguments invalides.') }
  const modes = Number(values.validate === true) + Number(values.apply === true) + Number(values.withdraw !== undefined)
  if (modes !== 1 || (values.withdraw !== undefined ? values.file !== undefined : !values.file)
    || (values.validate ? values.environment !== undefined : values.environment !== 'local')
    || args.filter(arg => ['--file', '--validate', '--apply', '--withdraw', '--environment'].includes(arg.split('=')[0]!)).length
      !== new Set(args.filter(arg => arg.startsWith('--')).map(arg => arg.split('=')[0])).size) {
    throw new NotificationCliError('Choisir --file avec --validate, --file avec --apply --environment local, ou --withdraw avec --environment local. Local seul autorisé.')
  }
  if (values.withdraw !== undefined) {
    const parsed = publicationKey.safeParse(values.withdraw)
    if (!parsed.success) throw new NotificationCliError('Clé de publication invalide.')
    return { mode: 'withdraw', key: parsed.data }
  }
  return { mode: values.validate ? 'validate' : 'apply', file: values.file! }
}

export function readPublication(file: string): Publication {
  let raw: unknown
  try {
    if (!statSync(file).isFile() || statSync(file).size > 1_000_000) throw new Error()
    raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch { throw new NotificationCliError('Fichier JSON illisible ou trop volumineux (1 Mo maximum).') }
  const parsed = publicationSchema.safeParse(raw)
  if (!parsed.success) throw new NotificationCliError('Contrat JSON invalide. Vérifier champs, texte brut, version, expiration, action et justification. requires_action=true non supporté.')
  return parsed.data
}

export function publisherConfig(connection: string | undefined): pg.ClientConfig {
  try {
    if (!connection) throw new Error()
    assertLocalUrl(connection)
    const url = new URL(connection)
    if (decodeURIComponent(url.username) !== 'my_notification_publisher' || !url.password) throw new Error()
  } catch { throw new NotificationCliError('MY_NOTIFICATION_DATABASE_URL doit cibler le rôle my_notification_publisher sur Supabase Local, port 55322, base postgres, sans paramètres URL.') }
  // Remote connections remain disabled. Future support must require verified
  // TLS and must reject URL options overriding rejectUnauthorized/CA settings.
  return { connectionString: connection, ssl: false, connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000, application_name: 'my-notification-publisher' }
}

const expectedRole = z.strictObject({ session_user: z.literal('my_notification_publisher'), current_user: z.literal('my_notification_publisher'),
  rolsuper: z.literal(false), rolcreatedb: z.literal(false), rolcreaterole: z.literal(false), rolreplication: z.literal(false),
  rolbypassrls: z.literal(false), rolinherit: z.literal(false), member: z.literal(false) })
export async function connectPublisher(connection = process.env.MY_NOTIFICATION_DATABASE_URL): Promise<pg.Client> {
  const client = new pg.Client(publisherConfig(connection))
  // Asynchronous driver errors also use a fixed message, never raw Error/logs.
  client.on('error', () => undefined)
  try {
    await client.connect()
    const identity = await client.query(`select session_user::text,current_user::text,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
      r.rolreplication,r.rolbypassrls,r.rolinherit,exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid) member
      from pg_catalog.pg_roles r where r.rolname=current_user`)
    if (!expectedRole.safeParse(identity.rows[0]).success) throw new NotificationCliError('Identité ou permissions du rôle PostgreSQL invalides.')
    return client
  } catch (error) { await client.end().catch(() => undefined); throw error }
}

export async function publish(client: pg.Client, publication: Publication) {
  const result = await client.query<{ result: unknown }>('select private.publish_notification_announcement($1::jsonb) result', [JSON.stringify(publication)])
  const parsed = publishedResult.safeParse(result.rows[0]?.result)
  if (!parsed.success || parsed.data.publication_key !== publication.publication_key || parsed.data.content_hash !== publicationHash(publication)) {
    throw new NotificationCliError('Réponse incohérente. Issue incertaine : reprendre avec le même fichier et la même clé.')
  }
  return parsed.data
}
export async function withdraw(client: pg.Client, key: string) {
  const result = await client.query<{ result: unknown }>('select private.withdraw_notification_announcement($1::text) result', [key])
  const parsed = withdrawnResult.safeParse(result.rows[0]?.result)
  if (!parsed.success || parsed.data.publication_key !== key) {
    throw new NotificationCliError('Réponse incohérente. Issue incertaine : reprendre le retrait avec la même clé.')
  }
  return parsed.data
}

export function safeError(error: unknown): string {
  if (error instanceof NotificationCliError) return error.message
  const known: Record<string, string> = {
    '23505:publication_key_conflict': 'publication_key_conflict : contenu différent. Corriger exige une nouvelle clé.',
    '22023:notification_publication_invalid': 'notification_publication_invalid : contrat refusé par PostgreSQL.',
    '22023:notification_action_unsupported': 'notification_action_unsupported : aucune résolution serveur supportée.',
    '22023:notification_expiration_invalid': 'notification_expiration_invalid : expiration déjà atteinte.',
    'P0002:notification_publication_not_found': 'notification_publication_not_found : clé inconnue.',
    '42501:notification_publication_unavailable': 'notification_publication_unavailable : rôle refusé.',
  }
  if (error instanceof pg.DatabaseError) return known[`${error.code}:${error.message}`] ?? 'PostgreSQL a refusé la commande. Vérifier droits et contrat ; reprendre avec la même clé.'
  return 'Connexion ou commande interrompue. Issue incertaine : reprendre avec le même fichier et la même clé, ou le même retrait. Aucun secret journalisé.'
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  let client: pg.Client | undefined
  try {
    const command = parseCommand(args)
    if (command.mode === 'withdraw') {
      client = await connectPublisher()
      console.log(JSON.stringify(await withdraw(client, command.key)))
    } else {
      const publication = readPublication(command.file)
      if (command.mode === 'validate') {
        console.log(JSON.stringify({ outcome: 'validated', publication_key: publication.publication_key, category: publication.category,
          app_version: publication.app_version, title_characters: Array.from(publication.title).length, body_characters: Array.from(publication.body).length,
          action: publication.action, requires_action: publication.requires_action, include_new_users: publication.include_new_users,
          expires_at: publication.expires_at, content_hash: publicationHash(publication) }))
      } else {
        client = await connectPublisher()
        console.log(JSON.stringify(await publish(client, publication)))
      }
    }
  } catch (error) { console.error(safeError(error)); process.exitCode = 1 }
  finally { await client?.end().catch(() => undefined) }
}
if (import.meta.main) await main()
