import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { promises as fs, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { BackupError, requireBackup, decodeTarget, decodeEvidence, decodeExternal, readJson, root,
  protectedParent, diagnostic, sha256, targetSchema, evidenceSchema, externalSchema } from './contract.js'
import { repositoryIdentity } from '../maintenance/cli.js'
import { encryptionKey, encryptFile, decryptFile, decryptJson, fileHash, bytes, restrictDirectory } from './secure-files.js'
import { versions, dump, inspectArchive, dumpArgs } from './clients.js'
import { connect, identity, requireClosed, inventory, sequences, freezeContract, validateTOC } from './database.js'

const artifacts = ['database.dump.myb','inventory.json.myb','external.json.myb','evidence.json.myb','source.tar.myb','toc.txt.myb']
export const manifestSchema = z.strictObject({
  format: z.literal('my-backup-manifest-v1'), status: z.literal('capture_verified_restore_unproven'),
  publication_authorized: z.literal(false), restore_proven: z.literal(false),
  environment: z.enum(['cloud','isolated']), project: z.string(),
  repository: z.strictObject({ project:z.string(), environment:z.string(), branch:z.string(), head:z.string().regex(/^[a-f0-9]{40}$/), version:z.string(), dirty:z.boolean() }),
  target: targetSchema, identity: z.record(z.string(), z.union([z.string(),z.boolean()])),
  tools: z.strictObject({ pg_dump:z.string(), pg_restore:z.string(), psql:z.string() }),
  snapshot: z.strictObject({ id:z.string(), established_at:z.iso.datetime(), exports_finished_at:z.iso.datetime(),
    guarantee:z.literal('shared_MVCC_snapshot_sequences_equal_at_bounds_privileged_DDL_excluded_by_operator'),
    external:z.literal('operator_inventory_separate_no_distributed_snapshot') }),
  archive: z.strictObject({ entries:z.number().int().positive(), managed_auth:z.string(), full_archive_read:z.literal(true) }),
  files: z.array(z.strictObject({ name:z.enum(artifacts), sha256, bytes:z.number().int().positive() })).length(artifacts.length),
  encryption: z.literal('AES-256-GCM_MYBK0001_key_separate'),
})
export function parseCommand(args) {
  let values
  try { values = parseArgs({ args, strict:true, allowPositionals:false, options:{
    command:{type:'string'}, config:{type:'string'}, environment:{type:'string'}, project:{type:'string'},
    evidence:{type:'string'}, external:{type:'string'}, directory:{type:'string'},
    'authorize-cloud':{type:'boolean'}, 'authorize-sensitive-export':{type:'boolean'},
  } }).values } catch { throw new BackupError('arguments_invalid') }
  const names = args.filter(a=>a.startsWith('--')).map(a=>a.split('=')[0])
  requireBackup(new Set(names).size === names.length && ['plan','capture','verify'].includes(values.command), 'arguments_invalid')
  if (values.command === 'verify') {
    requireBackup(Object.keys(values).every(k=>['command','directory'].includes(k)) && values.directory, 'verify_requires_only_directory')
  } else {
    requireBackup(values.config && values.environment === 'cloud' && values.project, 'explicit_cloud_selection_required')
    if (values.command === 'capture') requireBackup(values['authorize-cloud'] === true && values['authorize-sensitive-export'] === true
      && values.directory && values.evidence && values.external, 'distinct_cloud_and_export_authorizations_required')
    else requireBackup(Object.keys(values).every(k=>['command','config','environment','project'].includes(k)), 'plan_offline_arguments_only')
  }
  return values
}
export function plan(target) {
  return { format:'my-backup-plan-v1', environment:target.environment, project:target.project, connects:false,
    authorization:'not_granted', backup_authorized:false, output_encrypted:true,
    pg_dump:dumpArgs('00000000-00000000-1'), files:artifacts,
    required:['explicit_cloud_and_sensitive_export_authorizations','examined_target_system_id_TLS_CA',
      'committed_freeze_and_effective_maintenance','durable_privileged_DDL_exclusion','external_configuration_and_secret_references',
      'Storage_Vault_unused_or_new_separate_workflow','clean_committed_source','separate_encryption_key','PROD5_restore_validation_before_publication'] }
}
async function sourceArchive(filename, key) {
  const child = spawn('git', ['archive','--format=tar','HEAD'], { cwd:root, windowsHide:true, stdio:['ignore','pipe','pipe'] })
  let stderr = 0
  child.stderr.on('data',b=>{stderr+=b.length})
  const finished = new Promise((resolve,reject)=>{
    child.once('error',()=>reject(new BackupError('source_archive_failed')))
    child.once('close',code=>code===0 && stderr===0 ? resolve() : reject(new BackupError('source_archive_failed')))
  })
  finished.catch(()=>undefined)
  try { await encryptFile(child.stdout, filename, key); await finished }
  catch (error) { child.kill(); throw error }
}
export async function capture(target, evidence, external, directory, { synthetic = false, afterSnapshot,isolatedTransport=false } = {}) {
  requireBackup(target.environment === 'cloud' || (synthetic && target.environment === 'isolated'), 'execution_target_not_authorized')
  requireBackup(!isolatedTransport||(synthetic&&target.environment==='isolated'),'synthetic_transport_forbidden')
  decodeTarget(target,target.environment,target.project); decodeEvidence(evidence,target); decodeExternal(external,target.project)
  const key = encryptionKey()
  const repository = repositoryIdentity()
  requireBackup(synthetic || !repository.dirty, 'backup_requires_clean_committed_source')
  const parent = protectedParent(resolve(directory, '..'))
  requireBackup(resolve(directory) === join(parent, directory.split(/[\\/]/).at(-1)), 'backup_path_invalid')
  await fs.mkdir(directory, { mode:0o700 }) // Existing/incomplete directory is never reused.
  await restrictDirectory(directory)
  await fs.writeFile(join(directory,'INCOMPLETE'), 'No verified manifest. Keep maintenance and freeze active.\n', { flag:'wx',mode:0o600 })
  const tools = await versions(target)
  const client = await connect(target,process.env.MY_BACKUP_DATABASE_PASSWORD,{isolatedTransport})
  try {
    const id = await identity(client,target)
    const clientMinor = Number(tools.pg_dump.match(/^pg_dump \(PostgreSQL\) \d+\.(\d+)/)[1])
    requireBackup(clientMinor >= Number(id.version_num)%10_000, 'client_minor_older_than_server_requires_update')
    await freezeContract(client)
    // Fresh committed read before opening the repeatable-read snapshot.
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock_shared(771403)')
    await requireClosed(client,evidence)
    await client.query('commit')
    await client.query('begin isolation level repeatable read read only')
    await client.query('select pg_advisory_xact_lock_shared(771403)')
    await requireClosed(client,evidence)
    const snapshot = (await client.query('select pg_export_snapshot() id')).rows[0].id
    const established = new Date().toISOString()
    const content = { ...await inventory(client), freeze_state:await requireClosed(client,evidence) }
    const before = await sequences(client,content.tables)
    if (afterSnapshot) { requireBackup(synthetic, 'test_hook_forbidden'); await afterSnapshot({ client,snapshot }) }
    await dump(target,snapshot,process.env.MY_BACKUP_DATABASE_PASSWORD,join(directory,artifacts[0]),key)
    const after = await sequences(client,content.tables)
    requireBackup(JSON.stringify(before) === JSON.stringify(after), 'sequences_changed_nontransactional_backup_incomplete')
    await requireClosed(client,evidence)
    await client.query('commit')
    const finished = new Date().toISOString()
    await inspectArchive(target,join(directory,artifacts[0]),key)
    const toc = await inspectArchive(target,join(directory,artifacts[0]),key,true)
    const archive = validateTOC(toc,content)
    await encryptFile(bytes(JSON.stringify({ ...content, sequences:before })),join(directory,artifacts[1]),key)
    await encryptFile(bytes(JSON.stringify(external)),join(directory,artifacts[2]),key)
    await encryptFile(bytes(JSON.stringify(evidence)),join(directory,artifacts[3]),key)
    await sourceArchive(join(directory,artifacts[4]),key)
    await encryptFile(bytes(toc),join(directory,artifacts[5]),key)
    const current = repositoryIdentity()
    requireBackup(current.head === repository.head && current.version === repository.version && (synthetic || !current.dirty), 'source_changed_during_export')
    const files = []
    for (const name of artifacts) files.push({ name,...await fileHash(join(directory,name)) })
    const manifest = { format:'my-backup-manifest-v1', status:'capture_verified_restore_unproven', publication_authorized:false,
      restore_proven:false, environment:target.environment, project:target.project, repository, target, identity:id, tools,
      snapshot:{id:snapshot, established_at:established, exports_finished_at:finished,
        guarantee:'shared_MVCC_snapshot_sequences_equal_at_bounds_privileged_DDL_excluded_by_operator',
        external:'operator_inventory_separate_no_distributed_snapshot'}, archive, files,
      encryption:'AES-256-GCM_MYBK0001_key_separate' }
    requireBackup(manifestSchema.safeParse(manifest).success,'manifest_invalid')
    await encryptFile(bytes(JSON.stringify(manifest,null,2)),join(directory,'manifest.myb'),key)
    await fs.unlink(join(directory,'INCOMPLETE'))
    try { return await verify(directory,key) }
    catch (error) {
      await fs.writeFile(join(directory,'INCOMPLETE'),'Verification failed. Keep maintenance and freeze active.\n',{mode:0o600})
      throw error
    }
  } finally { await client.query('rollback').catch(()=>undefined); await client.end().catch(()=>undefined); key.fill(0) }
}
export async function verify(directory, suppliedKey) {
  protectedParent(directory)
  const key = suppliedKey ?? encryptionKey()
  try {
    const names = (await fs.readdir(directory)).sort()
    requireBackup(JSON.stringify(names) === JSON.stringify([...artifacts,'manifest.myb'].sort()), 'backup_files_absent_extra_or_incomplete')
    for (const name of names) requireBackup(lstatSync(join(directory,name)).isFile() && !lstatSync(join(directory,name)).isSymbolicLink(), 'backup_file_invalid')
    const manifest = await decryptJson(join(directory,'manifest.myb'),key)
    requireBackup(manifestSchema.safeParse(manifest).success, 'manifest_invalid')
    requireBackup(new Set(manifest.files.map(f=>f.name)).size === artifacts.length, 'manifest_file_set_invalid')
    decodeTarget(manifest.target,manifest.environment,manifest.project)
    for (const f of manifest.files) {
      const actual = await fileHash(join(directory,f.name))
      requireBackup(actual.bytes === f.bytes && actual.sha256 === f.sha256, 'backup_checksum_mismatch')
      await decryptFile(join(directory,f.name),key)
    }
    const evidence = decodeEvidence(await decryptJson(join(directory,'evidence.json.myb'),key),manifest.target)
    requireBackup(evidenceSchema.safeParse(evidence).success, 'evidence_invalid')
    const external = decodeExternal(await decryptJson(join(directory,'external.json.myb'),key),manifest.project)
    requireBackup(externalSchema.safeParse(external).success, 'external_invalid')
    const content = await decryptJson(join(directory,'inventory.json.myb'),key)
    requireBackup(content.freeze_state.frozen === true && content.freeze_state.revision === evidence.freeze_revision
      && manifest.identity.system_id === manifest.target.system_id && manifest.identity.database === manifest.target.database
      && (!manifest.repository.dirty || manifest.environment === 'isolated')
      && Date.parse(evidence.maintenance_checked_at) <= Date.parse(manifest.snapshot.established_at), 'manifest_evidence_identity_mismatch')
    const toc = await inspectArchive(manifest.target,join(directory,'database.dump.myb'),key,true)
    const archive = validateTOC(toc,content)
    requireBackup(archive.entries === manifest.archive.entries, 'manifest_archive_mismatch')
    await inspectArchive(manifest.target,join(directory,'database.dump.myb'),key)
    return { outcome:'capture_integrity_verified', environment:manifest.environment,
      files:artifacts.length + 1, snapshot:'shared_MVCC_with_documented_nontransactional_bounds',
      encrypted:true, restore_proven:false, publication_authorized:false }
  } finally { if (!suppliedKey) key.fill(0) }
}
export async function main(args = process.argv.slice(2)) {
  try {
    const command = parseCommand(args)
    if (command.command === 'verify') console.log(JSON.stringify(await verify(resolve(command.directory))))
    else {
      const target = decodeTarget(readJson(command.config),command.environment,command.project)
      if (command.command === 'plan') console.log(JSON.stringify(plan(target)))
      else console.log(JSON.stringify(await capture(target,decodeEvidence(readJson(command.evidence),target),
        decodeExternal(readJson(command.external),target.project),resolve(command.directory))))
    }
  } catch (error) {
    console.log(JSON.stringify({ outcome:'incomplete_or_refused', diagnostic:diagnostic(error),
      publication_authorized:false, next:'keep_maintenance_and_freeze_active_review_evidence' }))
    process.exitCode = 1
  }
}
if (import.meta.main) await main()
