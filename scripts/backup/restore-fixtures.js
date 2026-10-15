// Test-only services and reserved data. No connector, CLI or personal Local URL.
import { randomBytes,createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { readFile,readdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { docker, sandboxIdentity } from './isolated.js'
import { fixtureSql } from './clients.js'
import { requireBackup } from './contract.js'

export const account={email:'prod5-recovery@example.invalid',password:'SyntheticRecovery-Only-2026!',id:null,factor:null,totp:null}
export function jwt(key,role='service_role') {
  const body=[{alg:'HS256',typ:'JWT'},{role,aud:'authenticated',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600}]
    .map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')
  return `${body}.${createHmac('sha256',key).update(body).digest('base64url')}`
}
export function totp(secret,offset=0) {
  const bits=[...secret].map(c=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0')).join('')
  const key=Buffer.from(bits.match(/.{8}/g).map(b=>Number.parseInt(b,2))),counter=Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset))
  const digest=createHmac('sha1',key).update(counter).digest();key.fill(0)
  return ((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0')
}
export async function startAuth(target,client,{password,image,signingKey,encryptionKey,missingKey=false,port=9999}={}) {
  await sandboxIdentity(target,{source:target.container.startsWith('my-prod4-test-')})
  const name=`my-prod5-auth-${randomBytes(6).toString('hex')}`
  requireBackup(/^[a-f0-9]{48}$/.test(password),'synthetic_auth_password_required')
  requireBackup([9999,10000].includes(port),'synthetic_auth_port_required')
  await client.query(`alter role supabase_auth_admin password '${password}'`)
  const env={GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:String(port),API_EXTERNAL_URL:`http://127.0.0.1:${port}`,
    GOTRUE_SITE_URL:'https://example.invalid',GOTRUE_DB_DRIVER:'postgres',
    GOTRUE_DB_DATABASE_URL:`postgresql://supabase_auth_admin:${password}@127.0.0.1:5432/postgres`,
    GOTRUE_JWT_SECRET:signingKey,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
    GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MFA_TOTP_ENROLL_ENABLED:'true',
    GOTRUE_MFA_TOTP_VERIFY_ENABLED:'true',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_LOG_LEVEL:'error',
    GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1',GOTRUE_SMTP_ADMIN_EMAIL:'noreply@example.invalid',
    GOTRUE_SECURITY_DB_ENCRYPTION_ENCRYPT:missingKey?'false':'true',
    ...(!missingKey?{GOTRUE_SECURITY_DB_ENCRYPTION_ENCRYPTION_KEY_ID:'prod5',GOTRUE_SECURITY_DB_ENCRYPTION_ENCRYPTION_KEY:encryptionKey,
      GOTRUE_SECURITY_DB_ENCRYPTION_DECRYPTION_KEYS:`prod5:${encryptionKey}`}:{})}
  const id=await docker(['run','-d','--pull=never','--name',name,'--network',`container:${target.container_id}`,'--read-only',
    '--cap-drop=ALL','--security-opt=no-new-privileges','--label',`my.prod5.nonce=${target.nonce}`,'--label','my.prod5.profile=auth',
    ...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),image])
  const children=new Set(),sockets=new Set()
  const proxy=createServer(socket=>{
    socket.on('error',()=>socket.destroy())
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket))
    const child=spawn('docker',['exec','-i',target.container_id,'nc','127.0.0.1',String(port)],{windowsHide:true,stdio:['pipe','pipe','pipe']})
    children.add(child);child.stderr.resume();child.stdin.on('error',()=>socket.destroy())
    child.once('error',()=>socket.destroy());child.once('close',()=>{children.delete(child);socket.destroy()})
    socket.pipe(child.stdin);child.stdout.pipe(socket);socket.once('close',()=>child.kill())
  })
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening')
  const origin=`http://127.0.0.1:${proxy.address().port}`
  const stop=async()=>{
    for(const socket of sockets)socket.destroy()
    for(const child of children)child.kill()
    await new Promise(resolve=>proxy.close(resolve))
    const c=JSON.parse(await docker(['inspect',id]))[0]
    requireBackup(c.Id===id&&c.Name===`/${name}`&&c.Image===image&&c.Config.Labels?.['my.prod5.nonce']===target.nonce
      &&c.Config.Labels?.['my.prod5.profile']==='auth'&&c.HostConfig.NetworkMode===`container:${target.container_id}`
      &&c.Mounts.length===0&&!Object.keys(c.HostConfig.PortBindings??{}).length,'synthetic_auth_cleanup_identity_mismatch')
    await docker(['rm','-f',id])
  }
  async function request(path,{method='GET',body,token}={}) {
    const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',Connection:'close',
      ...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10_000)})
    return {status:response.status,data:await response.json()}
  }
  try {
    const deadline=Date.now()+45000;let ready=false
    while(Date.now()<deadline) {
      try {if((await request('/health')).status===200){ready=true;break}}catch{ /* startup only */ }
      await delay(250)
    }
    requireBackup(ready,'synthetic_auth_service_failed_to_start')
    return {request,stop,serviceToken:jwt(signingKey),origin,id,name}
  }catch(error){await stop();throw error}
}
export async function initializeSource(target,client) {
  const dir=new URL('../../supabase/migrations/',import.meta.url)
  const files=(await readdir(dir)).filter(f=>/^\d{14}_.+\.sql$/.test(f)).sort()
  const hasJwt=(await client.query("select to_regprocedure('auth.jwt()') is not null present")).rows[0].present
  await fixtureSql(target.container,`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
    ${hasJwt?'':"create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;"}
    set role postgres;\n`+(await Promise.all(files.map(f=>readFile(new URL(f,dir),'utf8')))).join('\n'))
  for(const f of files) await client.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',
    [f.slice(0,14),[await readFile(new URL(f,dir),'utf8')],f.slice(15,-4)])
  await client.query(`grant select on supabase_migrations.schema_migrations to postgres;
    create table storage.buckets(id text primary key,name text);
    create table storage.objects(id uuid primary key,bucket_id text references storage.buckets(id));
    grant select on storage.buckets,storage.objects to postgres;grant pg_read_all_stats to postgres;
    set role postgres;
    insert into public.pokemon(id,dex_number,name_fr) overriding system value values(9007199254740993,1025,'Synthetic Pokémon');
    select setval('public.pokemon_id_seq',9007199254740999,true);reset role`)
  const fixtures=new URL('../../supabase/tests/database/',import.meta.url)
  for(const name of ['relative_order_writer','manual_collection_items_v2','collection_hidden','collection_update','collection_update_apply']) {
    await client.query('set role postgres');await client.query(await readFile(new URL(`${name}.fixtures.inc`,fixtures),'utf8'));await client.query('reset role')
  }
  await client.query(`set role postgres;
    insert into public.user_preferences(user_id) values('a2500000-0000-0000-0000-000000000001');
    insert into public.collection_view_preferences(user_id,collection_id,binder_format)
    values('a2500000-0000-0000-0000-000000000002','c2500000-0000-0000-0000-000000000001','3x3');
    insert into private.collection_notification_reads values('c2500000-0000-0000-0000-000000000001',9007199254740993,now());
    select setval('public.catalog_variants_id_seq',9007199254740999,true);reset role`)
  // Deterministic in-flight restore window, outside MY.'s business schemas.
  // It exercises real cancellation/connection loss without changing any RPC.
  await client.query(`create schema prod5_probe;
    create function prod5_probe.restore_delay(value text) returns boolean language plpgsql as $$
      begin perform pg_sleep(0.03);return length(value)>0;end $$;
    create table prod5_probe.interruption(id bigint generated always as identity primary key,value text not null,
      check(prod5_probe.restore_delay(value)));
    insert into prod5_probe.interruption(value) select 'synthetic delay' from generate_series(1,20);
    grant select on prod5_probe.interruption to postgres;grant usage on schema prod5_probe to postgres`)
  const blob=(await client.query("select lo_from_bytea(0,convert_to('Synthetic database large object','UTF8'))::text oid")).rows[0].oid
  requireBackup(/^[0-9]+$/.test(blob),'synthetic_large_object_identity_invalid')
  await client.query(`grant select on large object ${blob} to postgres`)
  return files.length
}
