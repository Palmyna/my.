import { readFileSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { publicationKey, publicationSchema, publicationHash, publishedResult, withdrawnResult } from './contract.ts'
import type { Publication } from './contract.ts'
import { notificationSemver } from '../../src/lib/notification-scalars.ts'
import { NotificationCliError, connectPublisher, connectCloudPublisher, readCloudTarget, fingerprint, projectReference } from './database.ts'
export { NotificationCliError, connectPublisher, publisherConfig } from './database.ts'

type CloudSelection = { project: string; targetFile: string; expectedVersion?: string; expectedHash?: string }
type Command = ({ mode: 'validate' | 'check' | 'apply'; file: string } | { mode: 'withdraw'; key: string }) & { cloud?: CloudSelection }
export function parseCommand(args: string[]): Command {
  const options = { file: { type: 'string' }, validate: { type: 'boolean' }, check: { type: 'boolean' }, apply: { type: 'boolean' },
    withdraw: { type: 'string' }, environment: { type: 'string' }, project: { type: 'string' }, target: { type: 'string' },
    'expect-version': { type: 'string' }, 'expect-hash': { type: 'string' }, 'authorize-cloud-connect': { type: 'boolean' },
    'authorize-publish': { type: 'boolean' }, 'authorize-withdraw': { type: 'boolean' } } as const
  let values
  try {
    values = parseArgs({ args, options, strict: true, allowPositionals: false }).values
  } catch { throw new NotificationCliError('Arguments invalides.') }
  const flags = args.filter(arg => Object.hasOwn(options, arg.split('=')[0]!.slice(2))).map(arg => arg.split('=')[0])
  const modes = Number(values.validate === true) + Number(values.check === true) + Number(values.apply === true) + Number(values.withdraw !== undefined)
  const mode = values.validate ? 'validate' : values.check ? 'check' : values.apply ? 'apply' : 'withdraw'
  const cloud = values.environment === 'cloud'
  const cloudOnly = ['project', 'target', 'expect-version', 'expect-hash', 'authorize-cloud-connect', 'authorize-publish', 'authorize-withdraw'] as const
  if (modes !== 1 || (values.withdraw !== undefined ? values.file !== undefined : !values.file)
    || (values.validate ? values.environment !== undefined : !['local', 'cloud'].includes(values.environment ?? ''))
    || flags.length !== new Set(flags).size || (!cloud && (mode === 'check' || cloudOnly.some(key => values[key] !== undefined)))) {
    throw new NotificationCliError('Modes exclusifs : --file --validate hors connexion ; --file --apply ou --withdraw avec --environment local ; Cloud exige sélection et autorisations explicites.')
  }
  let selection: CloudSelection | undefined
  if (cloud) {
    if (!projectReference.safeParse(values.project).success || !values.target || !values['authorize-cloud-connect']
      || (mode !== 'withdraw' && !notificationSemver.safeParse(values['expect-version']).success)
      || (mode === 'apply' && (!values['authorize-publish'] || !fingerprint.safeParse(values['expect-hash']).success))
      || (mode !== 'apply' && (values['authorize-publish'] !== undefined || values['expect-hash'] !== undefined))
      || (mode === 'withdraw' ? !values['authorize-withdraw'] || values['expect-version'] !== undefined : values['authorize-withdraw'] !== undefined)) {
      throw new NotificationCliError('Cloud : projet/cible et --authorize-cloud-connect obligatoires ; version attendue pour fichier ; --authorize-publish --expect-hash pour publication ; --authorize-withdraw pour retrait.')
    }
    selection = { project: values.project!, targetFile: values.target,
      ...(values['expect-version'] ? { expectedVersion: values['expect-version'] } : {}),
      ...(values['expect-hash'] ? { expectedHash: values['expect-hash'] } : {}) }
  }
  if (values.withdraw !== undefined) {
    const parsed = publicationKey.safeParse(values.withdraw)
    if (!parsed.success) throw new NotificationCliError('Clé de publication invalide.')
    return { mode: 'withdraw', key: parsed.data, ...(selection ? { cloud: selection } : {}) }
  }
  return { mode, file: values.file!, ...(selection ? { cloud: selection } : {}) } as Command
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
  if (error instanceof pg.DatabaseError) return known[`${error.code}:${error.message}`] ?? 'Résultat non confirmé par PostgreSQL. Issue incertaine : vérifier droits et reprendre avec le même fichier, la même clé et le même hash.'
  return 'Connexion ou commande interrompue. Issue incertaine : reprendre avec le même fichier et la même clé, ou le même retrait. Aucun secret journalisé.'
}

export function publicationSummary(publication: Publication) {
  return { publication_key: publication.publication_key, category: publication.category,
    app_version: publication.app_version, title_characters: Array.from(publication.title).length, body_characters: Array.from(publication.body).length,
    action: publication.action, requires_action: publication.requires_action, include_new_users: publication.include_new_users,
    expires_at: publication.expires_at, content_hash: publicationHash(publication) }
}

export function verifyPublicationSelection(publication: Publication, selection: CloudSelection): void {
  if (publication.app_version !== null && publication.app_version !== selection.expectedVersion) {
    throw new NotificationCliError('Version du fichier différente de la version attendue par l’opérateur. Aucun déploiement Vercel vérifié par cet outil.')
  }
  if (selection.expectedHash && publicationHash(publication) !== selection.expectedHash) {
    throw new NotificationCliError('Empreinte différente de la publication examinée. Revalider fichier/clé/hash avant nouvelle autorisation.')
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  let client: pg.Client | undefined
  try {
    const command = parseCommand(args)
    const publication = command.mode === 'withdraw' ? undefined : readPublication(command.file)
    if (publication && command.cloud) verifyPublicationSelection(publication, command.cloud)
    if (command.mode === 'validate') {
      console.log(JSON.stringify({ outcome: 'validated', ...publicationSummary(publication!) }))
      return
    }
    if (command.cloud) {
      const target = readCloudTarget(command.cloud.targetFile, command.cloud.project)
      client = await connectCloudPublisher(target)
      console.log(JSON.stringify({ outcome: 'checked', environment: 'cloud', project: target.project, connection: target.connection,
        host: target.host, port: target.port, database: target.database, system_id: target.system_id,
        session_user: 'my_notification_publisher', current_user: 'my_notification_publisher', TLS: 'verified', permissions: 'verified',
        deployment_verified: false, maintenance_verified: false, freeze_verified: false,
        ...(publication ? publicationSummary(publication) : { publication_key: command.mode === 'withdraw' ? command.key : undefined }) }))
      if (command.mode === 'check') return
    } else client = await connectPublisher()
    if (command.mode === 'withdraw') {
      console.log(JSON.stringify(await withdraw(client, command.key)))
    } else {
      console.log(JSON.stringify(await publish(client, publication!)))
    }
  } catch (error) { console.error(safeError(error)); process.exitCode = 1 }
  finally { delete process.env.MY_NOTIFICATION_DATABASE_PASSWORD; await client?.end().catch(() => undefined) }
}
if (import.meta.main) await main()
