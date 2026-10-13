import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRestoreCommand } from './restore.js'
import { decodeRestoreTarget } from './isolated.js'
import { rolePlan } from './restore-database.js'
import { decryptBytes, encryptionKey, encryptFile, bytes } from './secure-files.js'
import { mkdtemp,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

test('restore CLI has no remote mode, no implicit destination, no destructive permissive options',()=>{
  for(const args of [[],['--command','execute'],['--command','preflight','--directory','x','--target','y'],
    ['--command','execute','--directory','x','--target','y','--report','r','--expect-manifest-sha256','a'],
    ['--command','destroy','--target','my-local'],['--command','create','--container','x','--image','x','--target','t'],
    ['--command','execute','--environment','cloud'],['--command','preflight','--directory','x','--clean'],
    ['--command','preflight','--directory','x','--directory','y']])assert.throws(()=>parseRestoreCommand(args))
  assert.equal(parseRestoreCommand(['--command','preflight','--directory','x']).command,'preflight')
})
test('isolated destination closed decoder binds exact resources; remote/personal/ambiguous rejected',()=>{
  const target={format:'my-isolated-restore-target-v1',environment:'isolated',container:'my-prod5-restore-123456abcdef',
    container_id:'a'.repeat(64),network_id:null,nonce:'c'.repeat(32),client_image:`sha256:${'d'.repeat(64)}`,
    host:'127.0.0.1',port:5432,transport:'docker-stdio',database:'postgres',user:'supabase_admin',system_id:'9007199254740993',postgres_major:17}
  assert.equal(decodeRestoreTarget(target).system_id,'9007199254740993')
  for(const change of [{host:'remote.example'},{environment:'cloud'},{container:'supabase_db_my-local'},{port:55322},
    {user:'postgres'},{system_id:Number('9007199254740993')},{client_image:'postgres:latest'},{volume:'supabase_db_my-local'}]) assert.throws(()=>decodeRestoreTarget({...target,...change}))
})
test('unknown or escalated publisher roles refused before SQL planning',()=>{
  const role={rolname:'my_notification_publisher',rolsuper:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false,
    rolcanlogin:true,rolreplication:false,rolbypassrls:false,rolconnlimit:-1,rolvaliduntil:null,rolconfig:null}
  for(const change of [{rolsuper:true},{rolinherit:true},{rolbypassrls:true},{rolconfig:['unsafe.custom=secret']},{rolpassword:'secret'}])
    assert.throws(()=>rolePlan({roles:[{...role,...change}]}))
  assert.throws(()=>rolePlan({roles:[]}))
})
test('pinned decryption exposes no bytes on failed GCM authentication',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'my-prod5-crypto-'))
  const key=encryptionKey(randomBytes(32).toString('base64'))
  try {
    const file=join(directory,'x.myb');await encryptFile(bytes('synthetic plaintext'),file,key)
    const buffer=await readFile(file)
    assert.equal(decryptBytes(buffer,key).toString(),'synthetic plaintext')
    buffer[25]^=1;assert.throws(()=>decryptBytes(buffer,key),/authentication/)
    assert.throws(()=>decryptBytes(buffer.subarray(0,-10),key),/authentication/)
  }finally {key.fill(0);await rm(directory,{recursive:true})}
})
