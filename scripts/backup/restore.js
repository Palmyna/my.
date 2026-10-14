import { parseArgs } from 'node:util'
import { promises as fs } from 'node:fs'
import { resolve, join } from 'node:path'
import { z } from 'zod'
import { BackupError, requireBackup, readJson, protectedParent, diagnostic } from './contract.js'
import { verify, manifestSchema } from './cli.js'
import { encryptionKey, decryptBytes, hashBytes, restrictDirectory } from './secure-files.js'
import { versions, start, startTool, archiveArgs } from './clients.js'
import { decodeRestoreTarget, createSandbox, sandboxIdentity, sandboxConnect, destroySandbox, docker } from './isolated.js'
import { rolePlan, requireEmpty, prepareObjects, restorePlatformPrivileges, verifyRestoredDatabase } from './restore-database.js'
import { validateTOC } from './database.js'

export function parseRestoreCommand(args) {
  let v
  try {v=parseArgs({args,strict:true,allowPositionals:false,options:{command:{type:'string'},directory:{type:'string'},target:{type:'string'},
    container:{type:'string'},image:{type:'string'},report:{type:'string'},'expect-manifest-sha256':{type:'string'},
    'authorize-create':{type:'boolean'},'authorize-isolated-restore':{type:'boolean'},'authorize-destroy':{type:'boolean'}}}).values}
  catch {throw new BackupError('restore_arguments_invalid')}
  const flags=args.filter(a=>a.startsWith('--')).map(a=>a.split('=')[0])
  requireBackup(new Set(flags).size===flags.length,'restore_arguments_invalid')
  const allowed={preflight:['command','directory'],create:['command','container','image','target','authorize-create'],
    inspect:['command','directory','target'],execute:['command','directory','target','report','expect-manifest-sha256','authorize-isolated-restore'],
    destroy:['command','target','authorize-destroy']}[v.command]
  requireBackup(allowed&&Object.keys(v).every(k=>allowed.includes(k))&&allowed.every(k=>v[k]),'restore_explicit_selection_and_authorization_required')
  return v
}
async function readPinned(path,key,expected) {
  const size=(await fs.stat(path)).size
  requireBackup(size<=512*1024*1024,'restore_memory_bound_exceeded_requires_separate_design')
  const encrypted=await fs.readFile(path)
  requireBackup(!expected||(encrypted.length===expected.bytes&&hashBytes(encrypted)===expected.sha256),'backup_checksum_mismatch')
  return {bytes:decryptBytes(encrypted,key),sha256:hashBytes(encrypted)}
}
async function archiveTool(target,dump,list) {
  const {child,done}=startTool(target,'pg_restore',archiveArgs(target,list))
  const chunks=[];let length=0
  child.stdout.on('data',b=>{if(list){length+=b.length;if(length>16*1024*1024)child.kill();else chunks.push(b)}})
  child.stdin.end(dump)
  await done
  return Buffer.concat(chunks).toString('utf8')
}
export async function preflightRestore(directory,key) {
  protectedParent(directory)
  await verify(directory,key) // Keep PROD.4's independently tested integrity chain.
  const m=await readPinned(join(directory,'manifest.myb'),key)
  let manifest
  try {manifest=manifestSchema.parse(JSON.parse(m.bytes.toString('utf8')))} catch {throw new BackupError('manifest_invalid')}
  const files={}
  try {
    for(const entry of manifest.files) files[entry.name]=(await readPinned(join(directory,entry.name),key,entry)).bytes
    const content=JSON.parse(files['inventory.json.myb'].toString('utf8'))
    const permitted=['tables','schemas','columns','database_properties','data_fingerprints','roles','memberships','role_settings','extensions',
      'functions','triggers','event_triggers','view_definitions','policies','default_acl','constraints','indexes','large_objects','migration_history','migration_files','storage','vault',
      'schema_source_limit','freeze_state','sequences']
    requireBackup(Object.keys(content).every(k=>permitted.includes(k))&&permitted.every(k=>Object.hasOwn(content,k)),
      'restore_legacy_inventory_requires_reference')
    requireBackup(z.array(z.strictObject({schema:z.string(),name:z.string(),rows:z.string().regex(/^\d+$/),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).safeParse(content.data_fingerprints).success,
      'restore_fingerprints_invalid')
    rolePlan(content)
    const toc=await archiveTool(manifest.target,files['database.dump.myb'],true)
    validateTOC(toc,content)
    requireBackup(toc===files['toc.txt.myb'].toString('utf8'),'restore_authenticated_TOC_mismatch')
    await archiveTool(manifest.target,files['database.dump.myb'],false)
    const bundle={manifest,manifest_sha256:m.sha256,content,toc,dump:files['database.dump.myb']}
    for(const [name,buffer] of Object.entries(files)) if(name!=='database.dump.myb') buffer.fill(0)
    return bundle
  } catch(error) {for(const buffer of Object.values(files))buffer.fill(0);throw error}
}
export function preflightResult(bundle) {
  return {outcome:'archive_intact_restore_not_executed',archive_integrity:true,manifest_sha256:bundle.manifest_sha256,
    source_environment:bundle.manifest.environment,snapshot_at:bundle.manifest.snapshot.established_at,
    postgres_major:bundle.manifest.target.postgres_major,roles:bundle.content.roles.length,extensions:bundle.content.extensions.length,
    tables:bundle.content.data_fingerprints.length,postgresql_restored:false,data_verified:false,
    application_recovery_proven:false,production_recovery_proven:false,publication_authorized:false}
}
export async function inspectDestination(target,bundle,password) {
  decodeRestoreTarget(target)
  requireBackup(target.system_id!==bundle.manifest.target.system_id,'restore_source_and_destination_must_differ')
  await sandboxIdentity(target)
  const tools=await versions({...target,postgres_major:bundle.manifest.target.postgres_major})
  requireBackup(tools.pg_restore===bundle.manifest.tools.pg_restore,'restore_client_version_requires_review')
  const client=await sandboxConnect(target,password)
  try {
    requireBackup(Number((await client.query("select current_setting('server_version_num') v")).rows[0].v)===Number(bundle.manifest.identity.version_num),
      'restore_server_version_requires_review')
    rolePlan(bundle.content)
    await requireEmpty(client,bundle.content)
    return {outcome:'isolated_empty_destination_verified',destination_authorized:false,postgresql_restored:false}
  } finally {await client.end()}
}
export async function nativeRestore(target,bundle,password,toc,{signal,authorized=false}={}) {
  requireBackup(authorized===true,'restore_native_authorization_required')
  await sandboxIdentity(target)
  const checked=await sandboxConnect(target,password)
  try {
    const claim=(await checked.query('select manifest_sha256,status from my_restore_control.attempt')).rows
    requireBackup(claim.length===1&&claim[0].manifest_sha256===bundle.manifest_sha256
      &&claim[0].status==='started_destination_disposable','restore_native_claim_invalid')
  }finally {await checked.end()}
  const path=`/tmp/my-restore-${target.nonce}.toc`
  // TOC metadata only, on protected tmpfs. Never plaintext SQL or archive data.
  await docker(['exec','-i',target.container_id,'bash','-c',`umask 077; cat > ${path}`],toc)
  const bootstrap=`set -euo pipefail
IFS= read -r PGPASSWORD
export PGPASSWORD PGHOST=127.0.0.1 PGPORT=5432 PGUSER=supabase_admin PGDATABASE=postgres PGAPPNAME=my-prod5-native-restore PGCONNECT_TIMEOUT=10
exec pg_restore --dbname=postgres --single-transaction --exit-on-error --no-password --use-list=${path}`
  const {child,done}=start(['exec','-i',target.container_id,'bash','-c',bootstrap])
  child.stdout.resume()
  const abort=()=>child.kill()
  signal?.addEventListener('abort',abort,{once:true})
  try {
    if(signal?.aborted) throw new BackupError('restore_interrupted_destination_disposable')
    child.stdin.write(password+'\n')
    child.stdin.end(bundle.dump)
    await done
    requireBackup(!signal?.aborted,'restore_interrupted_destination_disposable')
  } finally {
    signal?.removeEventListener('abort',abort)
    if(signal?.aborted) child.kill()
    // A disconnected docker exec may continue in the daemon. Cancel only this
    // dedicated restore login/application. Outcome remains unknown/disposable.
    const c=await sandboxConnect(target,password).catch(()=>null)
    if(c) {
      await c.query("select pg_terminate_backend(pid) from pg_stat_activity where usename='supabase_admin' and application_name='my-prod5-native-restore' and pid<>pg_backend_pid()").catch(()=>undefined)
      await c.end()
    }
    await docker(['exec',target.container_id,'rm','-f',path]).catch(()=>undefined)
  }
}
export async function executeRestore(target,bundle,password,{authorized=false,expectedManifest,report,signal}={}) {
  requireBackup(authorized===true&&expectedManifest===bundle.manifest_sha256,'restore_explicit_manifest_authorization_required')
  const started=Date.now()
  const result={format:'my-isolated-restore-report-v1',outcome:'refused_or_incomplete',stage:'destination_preflight',
    manifest_sha256:bundle.manifest_sha256,snapshot_at:bundle.manifest.snapshot.established_at,
    destination_system_id:target.system_id,postgresql_restored:false,data_verified:false,
    application_recovery_proven:false,production_recovery_proven:false,publication_authorized:false,
    external_configuration:'operator_checks_required_not_reapplied',auth_service:'not_exercised_by_restore_CLI',
    started_at:new Date(started).toISOString(),duration_ms:0,checks:null}
  let client
  const save=async()=>{result.duration_ms=Date.now()-started;await fs.writeFile(report,JSON.stringify(result,null,2),{mode:0o600})}
  protectedParent(resolve(report,'..'))
  await fs.writeFile(report,JSON.stringify(result,null,2),{flag:'wx',mode:0o600})
  try {
    await inspectDestination(target,bundle,password)
    requireBackup(!signal?.aborted,'restore_interrupted_destination_disposable')
    await sandboxIdentity(target)
    client=await sandboxConnect(target,password)
    // Repeat emptiness on the same connection that claims it. Serialize claims.
    await client.query('select pg_advisory_lock(771405)')
    await requireEmpty(client,bundle.content)
    result.stage='prepare_roles_schemas_extensions';await save()
    const toc=await prepareObjects(client,bundle.content,bundle.toc,bundle.manifest_sha256)
    await client.query('select pg_advisory_unlock(771405)')
    await client.end();client=null
    result.stage='pg_restore';await save()
    await nativeRestore(target,bundle,password,toc,{signal,authorized:true})
    result.postgresql_restored=true;result.stage='verify_data_and_security';await save()
    client=await sandboxConnect(target,password)
    result.stage='reapply_recorded_platform_schema_database_ACL';await save()
    await restorePlatformPrivileges(client,bundle.content)
    result.stage='verify_data_and_security';await save()
    result.checks=await verifyRestoredDatabase(client,bundle.content)
    result.data_verified=true;result.outcome='isolated_postgresql_restored_data_verified';result.stage='complete'
    await client.query("update my_restore_control.attempt set status='sql_and_data_verified_application_not_attested'")
    await save()
    return result
  } catch(error) {
    result.diagnostic=/^[A-Z0-9]{5}$/.test(error.code??'')?`restore_SQLSTATE_${error.code}`:diagnostic(error)
    result.next='inspect_report_destroy_exact_destination_create_fresh_explicit_attempt';await save()
    throw new BackupError(result.diagnostic)
  } finally {if(client)await client.end().catch(()=>undefined)}
}
export async function main(args=process.argv.slice(2)) {
  let bundle,key
  const controller=new AbortController(),interrupt=()=>controller.abort()
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
  try {
    const v=parseRestoreCommand(args)
    if(v.command==='create') {
      protectedParent(resolve(v.target,'..'))
      // Reserve target file before provisioning; existing files/resources refused.
      const handle=await fs.open(v.target,'wx',0o600)
      try {
        await restrictDirectory(resolve(v.target,'..'))
        const t=await createSandbox({container:v.container,client_image:v.image,password:process.env.MY_RESTORE_DATABASE_PASSWORD})
        await handle.writeFile(JSON.stringify(t,null,2));console.log(JSON.stringify({outcome:'isolated_destination_created',target_written:true}))
      } finally {await handle.close()}
    } else if(v.command==='destroy') {
      await destroySandbox(decodeRestoreTarget(readJson(v.target)))
      console.log(JSON.stringify({outcome:'exact_isolated_resources_destroyed'}))
    } else {
      key=encryptionKey();bundle=await preflightRestore(resolve(v.directory),key)
      if(v.command==='preflight') console.log(JSON.stringify(preflightResult(bundle)))
      else {
        const t=decodeRestoreTarget(readJson(v.target))
        console.log(JSON.stringify(v.command==='inspect'?await inspectDestination(t,bundle,process.env.MY_RESTORE_DATABASE_PASSWORD):
          await executeRestore(t,bundle,process.env.MY_RESTORE_DATABASE_PASSWORD,{authorized:v['authorize-isolated-restore'],
            expectedManifest:v['expect-manifest-sha256'],report:resolve(v.report),signal:controller.signal})))
      }
    }
  } catch(error) {console.log(JSON.stringify({outcome:'refused_or_incomplete',diagnostic:diagnostic(error),production_recovery_proven:false,publication_authorized:false}));process.exitCode=controller.signal.aborted?130:1}
  finally {bundle?.dump.fill(0);key?.fill(0);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt)}
}
if(import.meta.main)await main()
