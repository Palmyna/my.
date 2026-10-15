import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeTarget, targetSchema } from './contract.js'
import { plan, parseCommand } from './cli.js'

const project='a'.repeat(20)
const native={format:'my-backup-target-v2',transport:'windows-native',environment:'cloud',project,
  host:`db.${project}.supabase.co`,port:5432,database:'postgres',user:'postgres',system_id:'9007199254740993',postgres_major:17,
  ca_file:join(tmpdir(),'root.crt'),ca_sha256:'a'.repeat(64),isolated_container:null,
  native_clients:{directory:'D:\\reviewed\\pgsql\\bin',version:'17.11',files:{
    'psql.exe':'b'.repeat(64),'pg_dump.exe':'c'.repeat(64),'pg_restore.exe':'d'.repeat(64),'libpq.dll':'e'.repeat(64)}}}

test('native selection is explicit, direct, versioned, closed; legacy Docker is never reinterpreted',()=>{
  assert.equal(decodeTarget(native,'cloud',project).system_id,'9007199254740993')
  for(const change of [{format:'my-backup-target-v1'},{transport:'docker'},{client_image:`sha256:${'a'.repeat(64)}`},
    {host:'aws-0-eu-west-1.pooler.supabase.com',user:`postgres.${project}`},{host:'localhost'}, {port:6543},
    {ca_file:null},{ca_sha256:null},{isolated_container:'supabase_db_my-local'},{postgres_major:18}]) {
    assert.throws(()=>decodeTarget({...native,...change},'cloud',project))
  }
  for(const directory of ['psql','..\\bin','\\\\server\\share','C:relative','C:\\bin\\evil\n']) {
    assert.throws(()=>decodeTarget({...native,native_clients:{...native.native_clients,directory}},'cloud',project))
  }
  const {native_clients:clients,transport,...base}=native
  assert.ok(clients&&transport)
  const docker={...base,format:'my-backup-target-v1',client_image:`sha256:${'a'.repeat(64)}`}
  assert.ok(targetSchema.safeParse(docker).success)
  assert.equal(plan(docker).transport,'docker');assert.equal(plan(native).transport,'windows-native')
  assert.equal(plan(native).connects,false);assert.equal(plan(native).backup_authorized,false)
  assert.throws(()=>parseCommand(['--command','capture','--environment','cloud','--project',project,'--config','native.json']))
})
