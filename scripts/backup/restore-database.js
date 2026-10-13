import { z } from 'zod'
import { requireBackup,BackupError } from './contract.js'
import { quote, inventory, sequences } from './database.js'
import { readFreeze, verifyFreezeContract } from '../maintenance/database.js'

const literal=value=>`'${value.replaceAll("'","''")}'`
const roleSchema=z.strictObject({rolname:z.string().regex(/^[a-z_][a-z0-9_]*$/),rolsuper:z.boolean(),rolinherit:z.boolean(),
  rolcreaterole:z.boolean(),rolcreatedb:z.boolean(),rolcanlogin:z.boolean(),rolreplication:z.boolean(),rolbypassrls:z.boolean(),
  rolconnlimit:z.number().int(),rolvaliduntil:z.string().nullable(),rolconfig:z.array(z.string()).nullable()})
const reserved=new Set(['postgres','anon','authenticated','authenticator','dashboard_user','pgbouncer','service_role',
  'supabase_admin','supabase_auth_admin','supabase_etl_admin','supabase_privileged_role','supabase_read_only_user',
  'supabase_replication_admin','supabase_storage_admin'])
const settings=new Set(['search_path','statement_timeout','lock_timeout','idle_in_transaction_session_timeout',
  'session_preload_libraries','log_statement','default_transaction_read_only'])
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
function canonical(value,key='') {
  if(typeof value==='string'&&['acl','defaclacl'].includes(key)&&value.startsWith('{')&&value.endsWith('}'))
    return value.slice(1,-1).split(',').sort().join(',')
  if(Array.isArray(value))return value.map(v=>canonical(v))
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],k)]))
  return value
}
function mismatchPath(a,b,path='') {
  if(same(a,b))return null
  if(a&&b&&typeof a==='object'&&typeof b==='object') {
    for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
      const mismatch=mismatchPath(a[key],b[key],`${path}_${key}`)
      if(mismatch)return mismatch
    }
  }
  return path
}
export function rolePlan(content) {
  requireBackup(Array.isArray(content.roles)&&new Set(content.roles.map(r=>r.rolname)).size===content.roles.length,'restore_role_inventory_invalid')
  for(const role of content.roles) {
    requireBackup(roleSchema.safeParse(role).success&&(role.rolname.startsWith('pg_')||reserved.has(role.rolname)||role.rolname==='my_notification_publisher'),
      'restore_role_requires_manual_review')
    requireBackup(!role.rolsuper||role.rolname==='supabase_admin','restore_privileged_role_refused')
    if(role.rolname==='my_notification_publisher') requireBackup(role.rolcanlogin&&!role.rolsuper&&!role.rolinherit
      &&!role.rolcreatedb&&!role.rolcreaterole&&!role.rolreplication&&!role.rolbypassrls,'restore_publisher_privileges_invalid')
    for(const setting of role.rolconfig??[]) requireBackup(settings.has(setting.split('=')[0]),'restore_role_setting_requires_review')
  }
  requireBackup(['postgres','supabase_admin','supabase_auth_admin','my_notification_publisher'].every(n=>content.roles.some(r=>r.rolname===n)),
    'restore_required_role_missing')
  return content.roles.filter(r=>!r.rolname.startsWith('pg_'))
}
export async function requireEmpty(client,content) {
  const schemas=(await client.query(`select nspname from pg_namespace where nspname !~ '^pg_' and nspname not in ('information_schema','public')`)).rows
  const objects=(await client.query(`select count(*)::text n from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema'`)).rows[0].n
  const roles=(await client.query("select rolname from pg_roles where rolname !~ '^pg_' order by 1")).rows
  const sessions=(await client.query("select count(*)::text n from pg_stat_activity where datname=current_database() and backend_type='client backend' and pid<>pg_backend_pid()")).rows[0].n
  requireBackup(schemas.length===0&&objects==='0'&&same(roles,[{rolname:'supabase_admin'}])&&sessions==='0','restore_destination_not_empty_or_busy')
  requireBackup(content.database_properties?.encoding==='UTF8'&&content.database_properties?.collation==='en_US.UTF-8'
    &&content.database_properties?.ctype==='en_US.UTF-8','restore_locale_requires_review')
  for(const extension of content.extensions) {
    const installed=(await client.query('select version from pg_available_extension_versions where name=$1 and version=$2',[extension.extname,extension.extversion])).rows
    requireBackup(installed.length===1,'restore_extension_version_unavailable')
  }
}
async function applySetting(client,role,setting,database=null) {
  const at=setting.indexOf('='),key=setting.slice(0,at),value=setting.slice(at+1)
  requireBackup(at>0&&settings.has(key),'restore_role_setting_requires_review')
  // SET's SQL list quoting changes search_path/session_preload_libraries.
  // set_config + FROM CURRENT preserves the exact stored GUC value.
  const listSetting=['search_path','session_preload_libraries'].includes(key)
  if(listSetting)await client.query('select set_config($1,$2,true)',[key,value])
  const suffix=listSetting?'from current':`to ${literal(value)}`
  await client.query(role?`alter role ${quote(role)}${database?' in database "postgres"':''} set ${quote(key)} ${suffix}`:
    `alter database "postgres" set ${quote(key)} ${suffix}`)
}
export async function prepareObjects(client,content,toc,manifestHash) {
  // The committed claim makes even an interrupted/rolled-back restore non-reusable.
  await client.query(`create schema my_restore_control authorization supabase_admin;
    revoke all on schema my_restore_control from public;
    create table my_restore_control.attempt(manifest_sha256 text primary key,status text not null);
    revoke all on my_restore_control.attempt from public`)
  await client.query("insert into my_restore_control.attempt values($1,'started_destination_disposable')",[manifestHash])
  await client.query('begin')
  try {
    for(const r of rolePlan(content)) {
      const attributes=[['SUPERUSER',r.rolsuper],['INHERIT',r.rolinherit],['CREATEROLE',r.rolcreaterole],
        ['CREATEDB',r.rolcreatedb],['LOGIN',r.rolcanlogin],['REPLICATION',r.rolreplication],['BYPASSRLS',r.rolbypassrls]]
        .map(([name,yes])=>`${yes?'':'NO'}${name}`).join(' ')
      await client.query(`${r.rolname==='supabase_admin'?'alter':'create'} role ${quote(r.rolname)} ${attributes} connection limit ${r.rolconnlimit}${r.rolname==='supabase_admin'?'':' password null'}${r.rolvaliduntil?` valid until ${literal(r.rolvaliduntil)}`:''}`)
      for(const setting of r.rolconfig??[]) await applySetting(client,r.rolname,setting)
    }
    // initdb attributes predefined memberships to its bootstrap superuser.
    // Rebuild their recorded grantor as well as ADMIN/INHERIT/SET options.
    const baseline=(await client.query('select roleid::regrole::text role,member::regrole::text member,grantor::regrole::text grantor from pg_auth_members')).rows
    for(const m of baseline) await client.query(`revoke ${quote(m.role)} from ${quote(m.member)} granted by ${quote(m.grantor)}`)
    for(const m of content.memberships) {
      requireBackup(content.roles.some(r=>r.rolname===m.role)&&content.roles.some(r=>r.rolname===m.member)
        &&content.roles.some(r=>r.rolname===m.grantor)&&['admin_option','inherit_option','set_option'].every(k=>typeof m[k]==='boolean'),'restore_membership_invalid')
      await client.query(`set local role ${quote(m.grantor)}`)
      try {await client.query(`grant ${quote(m.role)} to ${quote(m.member)} with admin ${m.admin_option}, inherit ${m.inherit_option}, set ${m.set_option} granted by ${quote(m.grantor)}`)}
      catch(error){throw new BackupError(`restore_membership_${m.role}_${m.grantor}_SQLSTATE_${error.code}`)}
      await client.query('reset role')
    }
    for(const s of content.role_settings) for(const setting of s.setconfig) await applySetting(client,s.role,setting,s.database)
    await client.query(`alter database postgres owner to ${quote(content.database_properties.owner)}`)
    for(const schema of content.schemas) {
      if(schema.name==='public') await client.query(`alter schema public owner to ${quote(schema.owner)}`)
      else await client.query(`create schema ${quote(schema.name)} authorization ${quote(schema.owner)}`)
    }
    // pg_dump does not retain extension owners or force an installed version.
    // Precreate exact versions as recorded owners, then skip ONLY CREATE SCHEMA/
    // EXTENSION TOC entries. Their comments/ACLs and every other entry stay intact.
    await client.query('drop extension plpgsql')
    const extensionNames=toc.split('\n').map(l=>l.match(/^\d+; \d+ \d+ EXTENSION - ([^ ]+) /)?.[1]).filter(Boolean)
    extensionNames.unshift('plpgsql')
    requireBackup(new Set(extensionNames).size===content.extensions.length,'restore_extension_TOC_mismatch')
    for(const name of extensionNames) {
      const e=content.extensions.find(e=>e.extname===name)
      requireBackup(e&&content.roles.some(r=>r.rolname===e.owner),'restore_extension_owner_missing')
      await client.query(`set local role ${quote(e.owner)}`)
      requireBackup(/^[a-z0-9_-]+$/.test(e.extname),'restore_extension_name_invalid')
      await client.query(`create extension "${e.extname}" with schema ${quote(e.schema)} version ${literal(e.extversion)}`)
      await client.query('reset role')
    }
    await client.query('commit')
  } catch(error) {await client.query('rollback').catch(()=>undefined);throw error}
  return toc.split('\n').map(l=>/^\d+; \d+ \d+ (SCHEMA|EXTENSION) /.test(l)?`;${l}`:l).join('\n')
}
export async function restorePlatformPrivileges(client,content) {
  await client.query('begin')
  try {
    const grantees=['public',...content.roles.map(r=>quote(r.rolname))].join(',')
    const objects=[{kind:'database',name:'postgres',acl:content.database_properties.acl},
      ...content.schemas.map(s=>({kind:'schema',...s}))]
    for(const o of objects) {
      requireBackup(typeof o.acl==='string','restore_platform_acl_missing')
      const entries=(await client.query(`select grantor::regrole::text grantor,
        case when grantee=0 then null else grantee::regrole::text end grantee,privilege_type,is_grantable
        from aclexplode($1::aclitem[]) order by grantor,grantee,privilege_type`,[o.acl])).rows
      await client.query(`revoke all privileges on ${o.kind} ${quote(o.name)} from ${grantees}`)
      for(const entry of entries) {
        requireBackup((o.kind==='schema'?['CREATE','USAGE']:['CREATE','CONNECT','TEMPORARY']).includes(entry.privilege_type)
          &&content.roles.some(r=>r.rolname===entry.grantor)
          &&(entry.grantee===null||content.roles.some(r=>r.rolname===entry.grantee)),'restore_platform_acl_invalid')
        await client.query(`set local role ${quote(entry.grantor)}`)
        await client.query(`grant ${entry.privilege_type} on ${o.kind} ${quote(o.name)} to ${entry.grantee===null?'public':quote(entry.grantee)}${entry.is_grantable?' with grant option':''}`)
        await client.query('reset role')
      }
    }
    await client.query('commit')
  }catch(error){await client.query('rollback').catch(()=>undefined);throw error}
}
export async function verifyRestoredDatabase(client,expected) {
  await client.query('begin isolation level repeatable read read only')
  try {
    const actual=await inventory(client)
    const control='my_restore_control'
    actual.schemas=actual.schemas.filter(s=>s.name!==control)
    actual.tables=actual.tables.filter(s=>s.schema!==control)
    actual.columns=actual.columns.filter(s=>s.schema!==control)
    actual.constraints=actual.constraints.filter(s=>s.schema!==control)
    actual.data_fingerprints=actual.data_fingerprints.filter(s=>s.schema!==control)
    const verified=[]
    for(const key of ['tables','schemas','columns','database_properties','data_fingerprints','roles','memberships','role_settings',
      'functions','triggers','event_triggers','view_definitions','policies','default_acl','constraints','indexes','large_objects','migration_history','storage','vault']) {
      requireBackup(expected[key]!==undefined,'restore_legacy_inventory_requires_reference')
      const mismatch=mismatchPath(canonical(actual[key]),canonical(expected[key]))
      requireBackup(mismatch===null,`restore_validation_${key}${mismatch}_mismatch`)
      verified.push(key)
    }
    const normalizeExtensions=xs=>xs.map(({extconfig,...e})=>({...e,config_count:extconfig?extconfig.slice(1,-1).split(',').length:0}))
    requireBackup(same(normalizeExtensions(actual.extensions),normalizeExtensions(expected.extensions)),'restore_validation_extensions_mismatch')
    const seq=await sequences(client,actual.tables)
    requireBackup(same(seq,expected.sequences),'restore_validation_sequences_mismatch')
    // Persistent next value, including is_called=false, must exceed all owned IDs.
    const ownership=(await client.query(`select sn.nspname schema,s.relname name,tn.nspname table_schema,t.relname table_name,a.attname column
      from pg_class s join pg_namespace sn on sn.oid=s.relnamespace join pg_depend d on d.objid=s.oid and d.classid='pg_class'::regclass and d.deptype in ('a','i')
      join pg_class t on t.oid=d.refobjid join pg_namespace tn on tn.oid=t.relnamespace join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
      where s.relkind='S' order by 1,2`)).rows
    for(const o of ownership) {
      const s=seq.find(s=>s.schema===o.schema&&s.name===o.name)
      const max=(await client.query(`select max(${quote(o.column)})::text value from ${quote(o.table_schema)}.${quote(o.table_name)}`)).rows[0].value
      requireBackup(s&&BigInt(s.last_value)+(s.is_called?BigInt(s.seqincrement):0n)<=BigInt(s.seqmax),'restore_sequence_exhausted')
      requireBackup(max===null||BigInt(s.last_value)+(s.is_called?BigInt(s.seqincrement):0n)>BigInt(max),'restore_sequence_identifier_reuse_risk')
    }
    const freeze=await readFreeze(client)
    requireBackup(same(freeze,expected.freeze_state),'restore_validation_freeze_mismatch')
    // Contract verification deliberately excludes the isolated control table.
    // It is outside public/private/auth, so existing PROD.2 stays unchanged.
    const security=await verifyFreezeContract(client)
    await client.query('commit')
    return {verified:[...verified,'extensions','sequences','sequence_insert_safety','PROD2'],tables:actual.data_fingerprints.length,
      rows:actual.data_fingerprints.reduce((n,t)=>n+BigInt(t.rows),0n).toString(),sequences:seq.length,
      functions:actual.functions.length,policies:actual.policies.length,freeze,security}
  } catch(error) {await client.query('rollback').catch(()=>undefined);throw error}
}
