import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { requireBackup, BackupError } from './contract.js'
import { hashBytes } from './secure-files.js'
import { readFreeze, observe, verifyFreezeContract } from '../maintenance/database.js'
import { postgresStream } from './clients.js'
import { isNative } from './contract.js'
import { checkedCA } from './native.js'
import { checkServerIdentity } from 'node:tls'
import { isIP } from 'node:net'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/
export const quote = name => {
  requireBackup(identifier.test(name), 'unsupported_identifier_requires_review')
  return `"${name}"`
}
export async function connect(target, password,{isolatedTransport=false}={}) {
  requireBackup(typeof password === 'string' && password.length > 0 && !/[\r\n\0]/.test(password), 'database_password_required')
  const ca = isNative(target) ? checkedCA(target) : target.ca_file ? readFileSync(target.ca_file) : null
  requireBackup(!ca || hashBytes(ca) === target.ca_sha256, 'TLS_certificate_changed')
  const client = new pg.Client({ host: target.host, port: target.port, user: target.user, database: target.database,
    ...(isolatedTransport&&target.environment==='isolated'?{stream:postgresStream(target.isolated_container)}:{}),
    password, ssl: ca ? { ca, rejectUnauthorized: true, ...(isIP(target.host) ? {} : {servername:target.host}), minVersion:'TLSv1.2',
      checkServerIdentity:(_host,certificate)=>checkServerIdentity(target.host,certificate) } : false,
    // pg falls back to inherited PGOPTIONS when an empty string is supplied.
    options:'-c search_path=pg_catalog', sslnegotiation:'postgres', client_encoding:'UTF8', replication:'false',
    application_name: 'my-backup', connectionTimeoutMillis: 10_000, statement_timeout: 60_000 })
  client.on('error', () => undefined)
  try { await client.connect(); return client }
  catch { await client.end().catch(() => undefined); throw new BackupError('database_connection_failed') }
}
export async function identity(client, target) {
  const { rows: [value] } = await client.query(`select session_user::text, current_user::text,
    current_database() as database, current_setting('server_version') as postgres_version,
    current_setting('server_version_num') as version_num, (pg_control_system()).system_identifier::text as system_id,
    current_setting('session_replication_role') as replication_role,
    (r.rolsuper or pg_has_role(current_user,'pg_read_all_stats','USAGE')) full_visibility,
    coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) tls
    from pg_roles r where rolname=current_user`)
  requireBackup(value && value.session_user === 'postgres' && value.current_user === 'postgres'
    && value.database === target.database && value.system_id === target.system_id
    && Math.floor(Number(value.version_num) / 10_000) === target.postgres_major
    && value.replication_role === 'origin' && value.full_visibility === true
    && value.tls === (target.environment === 'cloud' || isNative(target)), 'database_identity_or_visibility_mismatch')
  return value
}
export async function requireClosed(client, evidence) {
  const state = await readFreeze(client)
  requireBackup(state.frozen === true && state.revision === evidence.freeze_revision, 'committed_freeze_not_attested')
  const observation = await observe(client)
  requireBackup(observation.admission_locks.length === 0 && observation.prepared_transactions.count === '0', 'ordinary_drainage_uncertain')
  // Auth is allowed to continue. A point sample cannot replace operator exclusion of future privileged jobs.
  requireBackup(!observation.transactions.some(t => t.category !== 'auth_internal'), 'other_transactions_require_coordination')
  return state
}
export async function inventory(client) {
  // Hash SQL text in PostgreSQL, never decode BIGINT/Auth rows in JavaScript.
  // These additive v1 inventory fields keep the PROD.4 seven-file format intact.
  await client.query("set local timezone='UTC'; set local datestyle='ISO, YMD'; set local extra_float_digits=3; set local bytea_output='hex'; set local search_path=''")
  const tables = (await client.query(`select n.nspname schema, c.relname name, c.relkind kind,
    c.relowner::regrole::text owner, c.relrowsecurity rls, c.relforcerowsecurity force_rls,
    coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))::text acl,
    exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') extension_owned,
    exists(select 1 from pg_extension e where c.oid=any(e.extconfig)) extension_config
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','m','S','v','f')
    order by 1,2`)).rows
  requireBackup(!tables.some(t => t.kind === 'f'), 'foreign_data_requires_separate_export')
  for (const t of tables) {
    quote(t.schema); quote(t.name)
    if (['r','p','m'].includes(t.kind)) {
      const value = (await client.query(`select count(*)::text count from ${quote(t.schema)}.${quote(t.name)}`)).rows[0]
      t.rows = value.count
      requireBackup(!t.extension_owned || t.extension_config || t.rows === '0', 'extension_data_not_dumped_requires_review')
    }
  }
  const dataDigests = await dataFingerprints(client,tables)
  const schemas = (await client.query(`select nspname name,nspowner::regrole::text owner,coalesce(nspacl,acldefault('n',nspowner))::text acl
    from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema' order by 1`)).rows
  const databaseProperties=(await client.query(`select datdba::regrole::text owner,pg_encoding_to_char(encoding) encoding,
    datcollate collation,datctype ctype,coalesce(datacl,acldefault('d',datdba))::text acl
    from pg_database where datname=current_database()`)).rows[0]
  const columns = (await client.query(`select n.nspname schema,c.relname relation,a.attname name,
    format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.attidentity identity,a.attgenerated generated,
    pg_get_expr(d.adbin,d.adrelid) default_expression,a.attacl::text acl
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and a.attnum>0 and not a.attisdropped
      and c.relkind in ('r','p','v','m') order by 1,2,a.attnum`)).rows
  const roles = (await client.query(`select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
    rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text, rolconfig from pg_roles order by rolname`)).rows
  const memberships = (await client.query(`select roleid::regrole::text role, member::regrole::text member,
    grantor::regrole::text grantor, admin_option, inherit_option, set_option from pg_auth_members order by 1,2,3`)).rows
  const roleSettings = (await client.query(`select case when setdatabase=0 then null else current_database() end database,
    case when setrole=0 then null else setrole::regrole::text end role, setconfig
    from pg_db_role_setting where setdatabase=0 or setdatabase=(select oid from pg_database where datname=current_database())
    order by 1,2`)).rows
  const extensions = (await client.query(`select extname, extversion, extnamespace::regnamespace::text schema,
    extowner::regrole::text owner, extconfig::text, extcondition from pg_extension order by extname`)).rows
  requireBackup(!extensions.some(e=>e.extcondition?.some(condition=>condition !== '')), 'filtered_extension_data_requires_review')
  const constraints = (await client.query(`select n.nspname schema, c.relname relation, con.conname name, con.contype type,
    pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema' order by 1,2,3`)).rows
  const indexes = (await client.query(`select n.nspname schema, c.relname name, pg_get_indexdef(c.oid) definition
    ,t.relname relation
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_index ix on ix.indexrelid=c.oid join pg_class t on t.oid=ix.indrelid
    where c.relkind='i' and n.nspname !~ '^pg_' and n.nspname<>'information_schema'
    and not exists(select 1 from pg_constraint con where con.conindid=c.oid) order by 1,2`)).rows
  const largeObjects = (await client.query(`select oid::text,lomowner::regrole::text owner,
    coalesce(lomacl,acldefault('L',lomowner))::text acl,encode(sha256(lo_get(oid)),'hex') sha256
    from pg_largeobject_metadata order by oid`)).rows
  const functions = (await client.query(`select n.nspname schema, p.proname name, pg_get_function_identity_arguments(p.oid) arguments,
    p.proowner::regrole::text owner, coalesce(p.proacl,acldefault('f',p.proowner))::text acl, pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1,2,3`)).rows
  const triggers = (await client.query(`select n.nspname schema, c.relname relation, t.tgname name,
    pg_get_triggerdef(t.oid) definition, t.tgenabled enabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal order by 1,2,3`)).rows
  const eventTriggers=(await client.query(`select evtname name,evtevent event,evtowner::regrole::text owner,
    evtfoid::regprocedure::text function,evtenabled enabled,evttags tags from pg_event_trigger order by 1`)).rows
  const views=(await client.query(`select n.nspname schema,c.relname name,pg_get_viewdef(c.oid,false) definition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m')
      and n.nspname !~ '^pg_' and n.nspname<>'information_schema' order by 1,2`)).rows
  const policies = (await client.query('select * from pg_policies order by schemaname,tablename,policyname')).rows
  const defaultACL = (await client.query('select defaclrole::regrole::text role, defaclnamespace::regnamespace::text schema, defaclobjtype, defaclacl::text from pg_default_acl order by 1,2,3')).rows
  const history = (await client.query('select version, name from supabase_migrations.schema_migrations order by version')).rows
  const files = readdirSync(migrations).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort()
  requireBackup(history.length >= 50 && history.length <= files.length && history.every((h,i) =>
    h.version === files[i].slice(0,14) && h.name === files[i].slice(15,-4)), 'installed_migration_history_not_repository_prefix')
  const migrationFiles = files.map(name => ({ name, sha256: hashBytes(readFileSync(new URL(name, migrations))),
    installed: history.some(h => h.version === name.slice(0,14)) }))
  const missingProfiles = (await client.query(`select count(*)::text count from public.profiles p
    left join auth.users u on u.id=p.id where u.id is null`)).rows[0].count
  requireBackup(missingProfiles === '0', 'profile_auth_relationship_invalid')
  const storage = (await client.query('select (select count(*)::text from storage.buckets) buckets, (select count(*)::text from storage.objects) objects')).rows[0]
  const vault = (await client.query(`select case when to_regclass('vault.secrets') is null then 'absent' else 'present' end status`)).rows[0]
  if (vault.status === 'present') vault.rows = (await client.query('select count(*)::text count from vault.secrets')).rows[0].count
  requireBackup(storage.buckets === '0' && storage.objects === '0' && (vault.status === 'absent' || vault.rows === '0'),
    'Storage_or_Vault_used_requires_separate_protected_backup')
  requireBackup(['users','identities','mfa_factors','mfa_challenges','mfa_amr_claims','sessions','refresh_tokens']
    .every(name => tables.some(t => t.schema === 'auth' && t.name === name)), 'managed_auth_dependencies_missing')
  return { tables, schemas, columns, database_properties:databaseProperties, data_fingerprints:dataDigests, roles, memberships, role_settings: roleSettings, extensions, functions, triggers, event_triggers:eventTriggers,view_definitions:views,policies,
    default_acl: defaultACL, constraints, indexes, large_objects:largeObjects,
    migration_history: history, migration_files: migrationFiles, storage, vault,
    schema_source_limit: 'history_names_versions_prefix_and_PROD2_contract_verified_full_schema_drift_requires_PROD5' }
}
export async function dataFingerprints(client,tables) {
  const result=[]
  for (const t of tables.filter(t=>['r','p','m'].includes(t.kind))) {
    const value=(await client.query(`select count(*)::text rows,
      encode(sha256(convert_to(coalesce(string_agg(row_hash,'' order by row_hash collate "C"),''),'UTF8')),'hex') sha256
      from (select encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') row_hash from ${quote(t.schema)}.${quote(t.name)} t) q`)).rows[0]
    result.push({schema:t.schema,name:t.name,...value})
  }
  return result
}
export async function sequences(client, tables) {
  const result = []
  for (const t of tables.filter(t => t.kind === 'S')) {
    const state = (await client.query(`select last_value::text, is_called from ${quote(t.schema)}.${quote(t.name)}`)).rows[0]
    const definition = (await client.query(`select seqstart::text, seqincrement::text, seqmax::text, seqmin::text,
      seqcache::text, seqcycle from pg_sequence where seqrelid=$1::regclass`, [`${quote(t.schema)}.${quote(t.name)}`])).rows[0]
    requireBackup(definition && !definition.seqcycle && BigInt(definition.seqincrement) > 0n, 'nonmonotonic_sequence_requires_quiescence')
    result.push({ schema: t.schema, name: t.name, ...state, ...definition })
  }
  return result
}
export async function freezeContract(client) { return verifyFreezeContract(client) }
export function validateTOC(toc, inventory) {
  const entries = toc.split('\n').filter(line => /^\d+;/.test(line))
  const has = (type, schema, name) => entries.some(line => line.includes(` ${type} ${schema} ${name} `))
  for (const t of inventory.tables.filter(t => !t.extension_owned || t.extension_config)) {
    if (!t.extension_owned) requireBackup(has(({ r:'TABLE', p:'TABLE', m:'MATERIALIZED VIEW', S:'SEQUENCE', v:'VIEW' })[t.kind], t.schema, t.name), 'archive_structure_omission')
    if (t.kind === 'r') requireBackup(has('TABLE DATA',t.schema,t.name), 'archive_data_omission')
    if (t.kind === 'S') requireBackup(has('SEQUENCE SET',t.schema,t.name), 'archive_sequence_omission')
  }
  for (const t of inventory.triggers.filter(t => ['public','private','auth'].includes(t.schema))) {
    requireBackup(has('TRIGGER', t.schema, `${t.relation} ${t.name}`), 'archive_trigger_omission')
  }
  for (const role of ['postgres','my_notification_publisher']) requireBackup(inventory.roles.some(r=>r.rolname===role), 'role_inventory_incomplete')
  for (const c of (inventory.constraints ?? []).filter(c=>['p','u','x','f'].includes(c.type)
    &&!inventory.tables.some(t=>t.schema===c.schema&&t.name===c.relation&&t.extension_owned))) {
    requireBackup(has(c.type === 'f' ? 'FK CONSTRAINT' : 'CONSTRAINT',c.schema,`${c.relation} ${c.name}`), 'archive_constraint_omission')
  }
  // Extension indexes are rebuilt by CREATE EXTENSION, not individual TOC entries.
  for (const i of inventory.indexes ?? []) {
    if(inventory.tables.some(t=>t.schema===i.schema&&t.name===i.relation&&t.extension_owned)) continue
    requireBackup(has('INDEX',i.schema,i.name), 'archive_index_omission')
  }
  for (const p of (inventory.policies ?? []).filter(p=>['public','private','auth'].includes(p.schemaname))) {
    requireBackup(has('POLICY',p.schemaname,`${p.tablename} ${p.policyname}`), 'archive_policy_omission')
  }
  requireBackup(has('TABLE DATA','supabase_migrations','schema_migrations'), 'archive_migration_history_missing')
  return { entries: entries.length, managed_auth: 'all_inventoried_tables_and_data_present', full_archive_read: true }
}
