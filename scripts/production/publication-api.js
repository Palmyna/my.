import { openPreparationAPI } from './open-api.js'
import { outsideFile, readConfiguration, requireProduction } from './config.js'
import { readPinnedChangelog } from './release.js'
import { connectCloudOperator, cloudConnectionConfig } from '../maintenance/cloud.js'
import { readCloudTarget, connectCloudPublisher } from '../notifications/database.ts'
import { publish } from '../notifications/publish.ts'
import { hashBytes } from '../backup/secure-files.js'

// Consume the existing volatile protected-input channels before ANY child,
// including Git/configuration checks. The caller disposes the returned API.
export function consumeOpenSecrets() {
  const channels = { key: 'MY_BACKUP_KEY', password: 'MY_BACKUP_DATABASE_PASSWORD', token: 'MY_VERCEL_MAINTENANCE_TOKEN',
    publisherPassword: 'MY_NOTIFICATION_DATABASE_PASSWORD', githubToken: 'MY_PRODUCTION_GITHUB_TOKEN' }
  const secrets = {}
  for (const [key, channel] of Object.entries(channels)) {
    secrets[key] = process.env[channel]
    delete process.env[channel]
  }
  return secrets
}

// New independent connection, existing AUTO.1 operator identity/TLS. Never SET
// ROLE/JWT claims or call a user RPC as postgres. No publisher ACL changes.
export async function readPublishedChangelog(target, connection, key, version, userId, open = connectCloudOperator) {
  const { client, identity } = await open(target, connection)
  try {
    await client.query('begin isolation level repeatable read read only')
    const result = await client.query(`select jsonb_build_object(
      'observed_at', to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'announcements', coalesce((select jsonb_agg(jsonb_build_object(
        'announcement_id', a.id, 'content_hash', a.content_hash, 'published_by', a.published_by,
        'published_at', to_char(a.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'withdrawn_at', case when a.withdrawn_at is null then null else to_char(a.withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
        'publication', jsonb_build_object('publication_key',a.publication_key,'category',a.category,'title',a.title,'body',a.body,
          'app_version',a.app_version,'action',a.action,'requires_action',a.requires_action,'include_new_users',a.include_new_users,
          'expires_at',case when a.expires_at is null then null else to_char(a.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
          'publication_context',a.publication_context))) from (
        select * from private.notification_announcements
        where publication_key=$1 or (category='changelog' and app_version=$2) order by id limit 2
      ) a), '[]'::jsonb),
      'reader', (select jsonb_build_object('user_id',u.id,
        'registered_at',to_char(u.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'profile_exists',exists(select 1 from public.profiles p where p.id=u.id),
        'read_at',case when s.read_at is null then null else to_char(s.read_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
        'processed_at',case when s.processed_at is null then null else to_char(s.processed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end)
        from auth.users u left join private.notification_announcement_states s on s.user_id=u.id
          and s.announcement_id=(select id from private.notification_announcements where publication_key=$1)
        where u.id=$3::uuid)) result`, [key, version, userId])
    requireProduction(result.rows.length === 1, 'publication_read_unavailable')
    await client.query('commit')
    return { identity, ...result.rows[0].result }
  } finally { await client.query('rollback').catch(() => undefined); await client.end().catch(() => undefined) }
}

// Internal only. The future caller consumes protected secret channels before
// constructing this API / spawning Git. No credentials in args, files or logs.
export function openPublicationAPI(bundle, secrets, { publisherTargetFile, ...options }) {
  requireProduction(!['MY_BACKUP_KEY', 'MY_BACKUP_DATABASE_PASSWORD', 'MY_VERCEL_MAINTENANCE_TOKEN',
    'MY_NOTIFICATION_DATABASE_PASSWORD', 'MY_PRODUCTION_GITHUB_TOKEN'].some(key => process.env[key]), 'publication_secret_channels_not_consumed')
  const targetFile = outsideFile(publisherTargetFile)
  const target = readCloudTarget(targetFile, bundle.config.project)
  requireProduction(['system_id','host','port','database','connection','ca_file','ca_sha256']
    .every(k => target[k] === bundle.maintenance[k]), 'publisher_target_differs_from_session')
  const targetHash = hashBytes(JSON.stringify(readConfiguration(targetFile)))
  let password = secrets.publisherPassword
  delete secrets.publisherPassword
  const preparation = openPreparationAPI(bundle, secrets, options)
  const connection = cloudConnectionConfig(bundle.maintenance, secrets.password)
  const checkConfiguration = () => {
    preparation.checkConfiguration()
    requireProduction(hashBytes(JSON.stringify(readConfiguration(targetFile))) === targetHash, 'publisher_target_changed')
  }
  return { ...preparation, checkConfiguration,
    publication: binding => readPinnedChangelog(binding.changelog, binding.version),
    readPublication: binding => readPublishedChangelog(bundle.maintenance, connection,
      binding.changelog.publication_key, binding.version, binding.visibility_user_id),
    async publish(publication, beforeDispatch) {
      checkConfiguration()
      const client = await connectCloudPublisher(target, password)
      try {
        await beforeDispatch()
        const receipt = await publish(client, publication)
        return { identity: { project: target.project, system_id: target.system_id, database: target.database,
          session_user: 'my_notification_publisher', current_user: 'my_notification_publisher', tls_verified: true,
          permissions_verified: true }, receipt }
      } finally { await client.end().catch(() => undefined) }
    },
    dispose() { password = undefined; connection.password = undefined; preparation.dispose() },
  }
}
