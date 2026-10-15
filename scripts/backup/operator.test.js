import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, readFile, writeFile, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCommand, plan } from './cli.js'
import { decodeTarget, decodeEvidence, decodeExternal, diagnostic, protectedParent, root, configurationReferences } from './contract.js'
import { encryptionKey, encryptFile, decryptJson, fileHash, bytes } from './secure-files.js'
import { dockerArgs, dumpArgs } from './clients.js'
import { validateTOC } from './database.js'

export const syntheticTarget = (project='my-prod4-test-123456abcdef') => ({
  format:'my-backup-target-v1',environment:'isolated',project,host:'127.0.0.1',port:55555,database:'postgres',
  user:'postgres',system_id:'12345678901234567890',postgres_major:17,client_image:`sha256:${'a'.repeat(64)}`,
  ca_file:null,ca_sha256:null,isolated_container:project,
})
export const syntheticEvidence = t => ({
  format:'my-backup-evidence-v1',environment:t.environment,project:t.project,system_id:t.system_id,
  freeze_revision:'1',maintenance_checked_at:new Date().toISOString(),maintenance_evidence:'synthetic.HTTP',
  freeze_committed_evidence:'synthetic.commit',ordinary_writes_drained_evidence:'synthetic.drain',
  privileged_writers_excluded_until_end:true,privileged_coordination_evidence:'synthetic.exclusion',
  ddl_roles_configuration_excluded_until_end:true,auth_consistency:'postgresql_snapshot_external_keys_separate_sessions_reauth_required',
  storage_and_vault_expected_empty:true,storage_configuration_evidence:'synthetic.empty',protected_storage_evidence:'synthetic.ACL',
  unsynchronized_destination:true,key_saved_separately_evidence:'synthetic.key',
})
export function syntheticExternal(project) {
  const external={ format:'my-backup-external-v1',project,configuration:{
    auth:{site_url:'https://example.invalid',redirect_urls:[],providers:[],jwt_expiry_seconds:3600,signup_enabled:true,
      email_confirmation:true,auth_service_version:'synthetic',configuration_evidence:'synthetic.auth'},
    smtp:{provider:'Resend',host:'synthetic',port:465,sender_evidence:'synthetic.sender',templates_evidence:'synthetic.templates'},
    mfa:{totp_enabled:true,max_factors:10,evidence:'synthetic.mfa'},data_api:{schemas:['public'],settings_evidence:'synthetic.api'},
    network:{restrictions_evidence:'synthetic.network',TLS_certificate_evidence:'synthetic.TLS'},
    integrations:{github_supabase_evidence:'synthetic.integration',vercel_evidence:'synthetic.vercel',other_writers_inventory_evidence:'synthetic.writers'},
    edge:{name:'delete-account',deployed_source_sha256:'b'.repeat(64),deployed_configuration_evidence:'synthetic.edge'},
    encryption:{vault:'not_used',column_encryption:'not_used',auth_key_reprovisioning_evidence:'synthetic.keys',signing_keys_reprovisioning_evidence:'synthetic.signing'},
    storage:{usage:'not_used',service_configuration_evidence:'synthetic.storage'},
  },secret_store_refs:Object.fromEntries(['database_password','publisher_password','SMTP_Resend','auth_encryption_keys','signing_keys',
    'SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(k=>[k,'synthetic.secret-store'])), records:{} }
  external.records=Object.fromEntries(configurationReferences(external.configuration).map(ref=>[ref,{synthetic:true,source:ref}]))
  return external
}

test('CLI refuses implicit/Local targets and requires distinct authorization before connections',()=>{
  for (const args of [[],['--command','capture'],['--command','capture','--environment','local','--project','my-local','--config','x'],
    ['--command','capture','--environment','cloud','--project','x','--config','x','--authorize-cloud'],
    ['--command','plan','--environment','cloud','--project','x','--config','x','--authorize-cloud'],
    ['--command','verify','--directory','x','--authorize-cloud'],['--command','verify','--directory','x','--directory','x']]) {
    assert.throws(()=>parseCommand(args))
  }
  assert.equal(parseCommand(['--command','plan','--environment','cloud','--project','x','--config','x']).command,'plan')
})
test('Targets bind project, system, direct/session port, CA, client image and isolated fixture',()=>{
  const t=syntheticTarget()
  assert.equal(decodeTarget(t,t.environment,t.project).system_id,'12345678901234567890')
  for (const change of [{host:'localhost'},{isolated_container:'supabase_db_my-local'},{user:'supabase_admin'},{system_id:12},
    {client_image:'postgres:latest'},{unexpected:true}]) assert.throws(()=>decodeTarget({...t,...change},t.environment,t.project))
  const project='a'.repeat(20)
  const cloud={...t,environment:'cloud',project,host:`db.${project}.supabase.co`,port:5432,
    ca_file:join(tmpdir(),'root.crt'),ca_sha256:'c'.repeat(64),isolated_container:null}
  assert.equal(decodeTarget(cloud,'cloud',project).user,'postgres')
  for (const change of [{host:'evil.example'},{port:6543},{ca_file:null},{ca_sha256:null},{user:'service_role'}]) {
    assert.throws(()=>decodeTarget({...cloud,...change},'cloud',project))
  }
  assert.throws(()=>decodeTarget(cloud,'cloud','b'.repeat(20)))
})
test('Closure and external inventory reject PROD3 output, uncertainty and omissions',()=>{
  const t=syntheticTarget(),e=syntheticEvidence(t),external=syntheticExternal(t.project)
  assert.equal(decodeEvidence(e,t).freeze_revision,'1')
  for (const change of [{backup_authorized:false},{privileged_writers_excluded_until_end:false},{system_id:'2'},
    {maintenance_evidence:'REPLACE'},{unsynchronized_destination:false}]) assert.throws(()=>decodeEvidence({...e,...change},t))
  assert.throws(()=>decodeEvidence({backup_authorized:false},t))
  assert.equal(decodeExternal(external,t.project).configuration.storage.usage,'not_used')
  assert.throws(()=>decodeExternal({...external,secret_store_refs:{}},t.project))
  assert.throws(()=>decodeExternal({...external,records:{}},t.project),/record_missing/)
  assert.throws(()=>decodeExternal({...external,configuration:{...external.configuration,encryption:{vault:'used'}}},t.project))
})
test('Commands have no exclusions, owners/grants retained, credentials absent and inspection has no network',()=>{
  const t=syntheticTarget()
  assert.equal(plan(t).connects,false)
  assert.equal(plan(t).backup_authorized,false)
  assert.deepEqual(dumpArgs('00000001-00000002-1'),['--format=custom','--quote-all-identifiers','--no-password',
    '--snapshot=00000001-00000002-1','--lock-wait-timeout=10s'])
  assert.throws(()=>dumpArgs('$(evil)'))
  const args=dockerArgs(t,'pg_dump',dumpArgs('123-123-1'),true)
  assert.ok(!args.includes('--no-owner') && !args.includes('--no-acl'))
  assert.equal(dockerArgs(t,'pg_restore',['--list'])[dockerArgs(t,'pg_restore',['--list']).indexOf('--network')+1],'none')
  assert.equal(diagnostic(new Error('PASSWORD token postgres://secret')),'backup_failed_details_suppressed')
  assert.throws(()=>protectedParent(root))
})
test('Encrypted files authenticate, hash ciphertext, reject wrong key, truncation and tampering',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'my-prod4-unit-'))
  try {
    const key=encryptionKey(randomBytes(32).toString('base64')),f=join(directory,'sample.myb')
    const secret='SYNTHETIC_AUTH_PASSWORD_HASH_TOKEN'
    await encryptFile(bytes(JSON.stringify({secret})),f,key)
    assert.ok(!(await readFile(f)).includes(Buffer.from(secret)))
    assert.deepEqual(await decryptJson(f,key),{secret})
    const hash=await fileHash(f)
    assert.match(hash.sha256,/^[a-f0-9]{64}$/)
    await assert.rejects(decryptJson(f,randomBytes(32)))
    const damaged=await readFile(f); damaged[24]^=1; await writeFile(f,damaged)
    assert.notEqual((await fileHash(f)).sha256,hash.sha256)
    await assert.rejects(decryptJson(f,key))
    await truncate(f,22); await assert.rejects(decryptJson(f,key))
    assert.throws(()=>encryptionKey('password'))
  } finally { await rm(directory,{recursive:true}) }
})
test('TOC explicitly rejects omitted managed schemas/data and sequence state',()=>{
  const inventory={tables:[{schema:'auth',name:'users',kind:'r'},{schema:'public',name:'id_seq',kind:'S'}],
    triggers:[{schema:'auth',relation:'users',name:'business_write_freeze'}],roles:[{rolname:'postgres'},{rolname:'my_notification_publisher'}]}
  const toc=['1; 1 1 TABLE auth users owner','2; 1 1 TABLE DATA auth users owner','3; 1 1 SEQUENCE public id_seq owner',
    '4; 1 1 SEQUENCE SET public id_seq owner','5; 1 1 TRIGGER auth users business_write_freeze owner',
    '6; 1 1 TABLE DATA supabase_migrations schema_migrations owner'].join('\n')
  assert.equal(validateTOC(toc,inventory).entries,6)
  for (const line of toc.split('\n')) assert.throws(()=>validateTOC(toc.replace(line,''),inventory))
})
