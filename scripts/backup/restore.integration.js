import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp,rm,readdir,mkdir,readFile,writeFile,rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve,relative } from 'node:path'
import pg from 'pg'
import { createSandbox,destroySandbox,docker,sandboxConnect } from './isolated.js'
import { postgresStream } from './clients.js'
import { capture } from './cli.js'
import { encryptionKey,restrictDirectory } from './secure-files.js'
import { preflightRestore,executeRestore,inspectDestination,nativeRestore } from './restore.js'
import { syntheticTarget,syntheticEvidence,syntheticExternal } from './operator.test.js'
import { initializeSource,startAuth,account,totp } from './restore-fixtures.js'
import { BackupError,diagnostic } from './contract.js'
import { readFreeze } from '../maintenance/database.js'
import { publicationHash } from '../notifications/contract.ts'
import { verifyRestoredDatabase,prepareObjects } from './restore-database.js'
import { setTimeout as delay } from 'node:timers/promises'
import { execFileSync } from 'node:child_process'

test('PROD5 real PROD4 capture to independent isolated PostgreSQL recovery',{timeout:600000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'my-prod5-isolated-'));await restrictDirectory(directory)
  const password=randomBytes(24).toString('hex'),key=randomBytes(32).toString('base64')
  const saved={key:process.env.MY_BACKUP_KEY,password:process.env.MY_BACKUP_DATABASE_PASSWORD}
  const image=await docker(['image','inspect','public.ecr.aws/supabase/postgres:17.6.1.166','--format','{{.Id}}'])
  const authImage=await docker(['image','inspect','public.ecr.aws/supabase/gotrue:v2.197.0','--format','{{.Id}}'])
  const signingKey=randomBytes(32).toString('hex'),authKey=randomBytes(32).toString('base64url')
  let source,sourceClient,sourceAuth,target,bundle,destinationClient
  const extraTargets=[],services=[]
  const start=Date.now()
  let fullResult
  const fresh=async()=>{const t=await createSandbox({container:`my-prod5-restore-${randomBytes(6).toString('hex')}`,client_image:image,password});extraTargets.push(t);return t}
  const prepare=async()=>{const t=await fresh();const c=await sandboxConnect(t,password);const toc=await prepareObjects(c,bundle.content,bundle.toc,bundle.manifest_sha256);return {t,c,toc}}
  const awaitNative=async c=>{
    const deadline=Date.now()+15000
    while(Date.now()<deadline) {
      const row=(await c.query("select pid from pg_stat_activity where application_name='my-prod5-native-restore' and wait_event='PgSleep'")).rows[0]
      if(row)return row.pid
      await delay(20)
    }
    throw new BackupError('synthetic_native_restore_window_not_observed')
  }
  try {
    source=await createSandbox({container:`my-prod4-test-${randomBytes(6).toString('hex')}`,client_image:image,password,source:true})
    sourceClient=new pg.Client({user:'supabase_admin',database:'postgres',password,stream:postgresStream(source.container_id)});sourceClient.on('error',()=>undefined);await sourceClient.connect()
    sourceAuth=await startAuth(source,sourceClient,{password,image:authImage,signingKey,encryptionKey:authKey})
    await initializeSource(source,sourceClient)
    await t.test('real synthetic Auth identity, profile, encrypted TOTP and AAL2 before backup',async()=>{
      const created=await sourceAuth.request('/admin/users',{method:'POST',token:sourceAuth.serviceToken,body:{email:account.email,password:account.password,email_confirm:true}})
      assert.equal(created.status,200);account.id=created.data.id
      assert.equal((await sourceClient.query('select count(*)::text n from public.profiles where id=$1',[account.id])).rows[0].n,'1')
      const login=await sourceAuth.request('/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}})
      assert.equal(login.status,200)
      const factor=await sourceAuth.request('/factors',{method:'POST',token:login.data.access_token,body:{factor_type:'totp',friendly_name:'PROD5 synthetic'}})
      assert.equal(factor.status,200);account.factor=factor.data.id;account.totp=factor.data.totp.secret
      const challenge=await sourceAuth.request(`/factors/${account.factor}/challenge`,{method:'POST',token:login.data.access_token,body:{}})
      assert.equal(challenge.status,200)
      const verify=await sourceAuth.request(`/factors/${account.factor}/verify`,{method:'POST',token:login.data.access_token,body:{challenge_id:challenge.data.id,code:totp(account.totp)}})
      assert.equal(verify.status,200)
      account.sourceToken=verify.data.access_token
      assert.equal((await sourceClient.query('select secret<>$2 encrypted from auth.mfa_factors where id=$1',[account.factor,account.totp])).rows[0].encrypted,true)
    })
    // Real Phase 8 receipts persisted before the reference snapshot, not fabricated JSON.
    const ordinary=new pg.Client({user:'authenticator',database:'postgres',password,stream:postgresStream(source.container_id)})
    await sourceClient.query(`alter role authenticator password '${password}'`);await ordinary.connect()
    try {
      await ordinary.query('begin;set local role authenticated')
      await ordinary.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:'a2500000-0000-0000-0000-000000000001',aal:'aal2'})])
      await ordinary.query("select public.set_collection_item_hidden('c2500000-0000-0000-0000-000000000001','d2500000-0000-0000-0000-000000000001',true,2,'e2500000-0000-0000-0000-000000000905')")
      await ordinary.query('commit')
    }finally {await ordinary.end()}
    await sourceClient.query("update public.collections set personal_revision=9007199254740993 where id='c2500000-0000-0000-0000-000000000002'")
    const bigWriter=new pg.Client({user:'authenticator',database:'postgres',password,stream:postgresStream(source.container_id)});bigWriter.on('error',()=>undefined);await bigWriter.connect()
    try {
      await bigWriter.query('begin;set local role authenticated')
      await bigWriter.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:'a2500000-0000-0000-0000-000000000001',aal:'aal2'})])
      await bigWriter.query("select public.reorder_collection_item_v2('c2500000-0000-0000-0000-000000000002','d2500000-0000-0000-0000-000000000006','start',null,9007199254740993,'e2500000-0000-0000-0000-000000000906')")
      await bigWriter.query('commit')
    }finally {await bigWriter.end()}
    const publisherPayload={publication_key:'prod5.source',category:'announcement',title:'Synthetic recovery',body:'Synthetic recovered notification',
      app_version:null,action:null,requires_action:false,include_new_users:true,expires_at:null,
      publication_context:{reason:'Isolated restore test',include_new_users_justification:'Synthetic identities only'}}
    await sourceClient.query(`alter role my_notification_publisher password '${password}'`)
    const sourcePublisher=new pg.Client({user:'my_notification_publisher',database:'postgres',password,stream:postgresStream(source.container_id)});sourcePublisher.on('error',()=>undefined)
    await sourcePublisher.connect()
    try {await sourcePublisher.query(`select private.publish_notification_announcement($1::jsonb)`,[JSON.stringify(publisherPayload)])}
    finally {await sourcePublisher.end()}
    await sourceClient.query(`insert into private.notification_announcement_states(user_id,announcement_id,read_at,processed_at)
      select 'a2500000-0000-0000-0000-000000000001',id,now(),now() from private.notification_announcements where publication_key='prod5.source'`)
    await sourceClient.query('select private.set_business_write_freeze(true)')
    // Stop Auth writes/config before snapshot; no dependence on a quiet sample.
    await sourceAuth.stop();sourceAuth=null
    const captureTarget={...syntheticTarget(source.container),system_id:source.system_id,client_image:image,port:55555}
    const archive=join(directory,'backup'),captureStart=Date.now()
    process.env.MY_BACKUP_KEY=key;process.env.MY_BACKUP_DATABASE_PASSWORD=password
    const external=syntheticExternal(source.container);external.configuration.auth.auth_service_version='v2.197.0'
    assert.equal((await capture(captureTarget,syntheticEvidence(captureTarget),external,archive,{synthetic:true,isolatedTransport:true})).restore_proven,false)
    const captureMs=Date.now()-captureStart
    bundle=await preflightRestore(archive,encryptionKey(key))
    target=await createSandbox({container:`my-prod5-restore-${randomBytes(6).toString('hex')}`,client_image:image,password})
    const report=join(directory,'restore.json')
    await t.test('full native restoration; exact data/IDs/sequence definitions/security and recorded freeze',async()=>{
      const result=await executeRestore(target,bundle,password,{authorized:true,expectedManifest:bundle.manifest_sha256,report})
      fullResult=result
      assert.equal(result.postgresql_restored,true);assert.equal(result.data_verified,true);assert.equal(result.production_recovery_proven,false)
      assert.equal(result.checks.freeze.frozen,true)
      assert.ok(result.checks.tables>40)
      console.log(JSON.stringify({capture_ms:captureMs,restore_ms:result.duration_ms,checks:result.checks,source_and_target_distinct:source.system_id!==target.system_id}))
    })
    assert.equal(fullResult?.data_verified,true,'Continue application tests only after faithful SQL validation')
    destinationClient=await sandboxConnect(target,password)
    await t.test('completed destination and explicit reuse refused',async()=>{
      await assert.rejects(inspectDestination(target,bundle,password),/not_empty/)
      await assert.rejects(executeRestore(target,bundle,password,{authorized:true,expectedManifest:bundle.manifest_sha256,report:join(directory,'retry.json')}),/not_empty/)
    })
    await t.test('PROD3/PROD2 on restored DB: real ordinary roles refused while frozen, no role password imported',async()=>{
      assert.equal((await destinationClient.query("select count(*)::text n from pg_authid where rolname in ('authenticator','my_notification_publisher','supabase_auth_admin') and rolpassword is not null")).rows[0].n,'0')
      await destinationClient.query(`alter role authenticator password '${password}'`)
      const c=new pg.Client({user:'authenticator',database:'postgres',password,stream:postgresStream(target.container_id)});c.on('error',()=>undefined);await c.connect()
      try {
        for(const role of ['authenticated','service_role']) {
          await c.query(`begin;set local role ${role}`)
          await assert.rejects(c.query('update public.user_preferences set binder_default_format=binder_default_format where false'),{code:'PT503'})
          await c.query('rollback')
        }
      }finally {await c.end()}
      assert.equal((await readFreeze(destinationClient)).frozen,true)
    })
    await t.test('existing SQL assertions PROD2; controlled open only in test transaction; freeze restored by rollback',async()=>{
      const sql=(await readFile(new URL('../../supabase/tests/database/039_business_write_freeze.test.sql',import.meta.url),'utf8'))
        .replace(/^begin;/,'begin;\nselect private.set_business_write_freeze(false);')
      const output=await docker(['exec','-i',target.container_id,'psql','-X','-q','-t','-A','-h','/tmp','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],sql,{allowSqlNotices:true})
      assert.match(output,/^1\.\.[1-9][0-9]*$/m)
      const planned=Number(output.match(/^1\.\.([1-9][0-9]*)$/m)[1])
      assert.equal(output.split('\n').filter(l=>/^ok \d+/.test(l)).length,planned)
      assert.ok(!/^not ok /m.test(output))
      assert.equal((await readFreeze(destinationClient)).frozen,true)
    })
    await t.test('Auth data alone cannot unlock encrypted MFA without its external decryption key',async()=>{
      const service=await startAuth(target,destinationClient,{password,image:authImage,signingKey,encryptionKey:authKey,missingKey:true})
      try {
        const login=await service.request('/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}})
        assert.equal(login.status,500,'GoTrue cannot load the encrypted MFA factor without the separate key')
      }finally {await service.stop()}
    })
    await t.test('same restored GoTrue: password, original TOTP, AAL2, refresh; signup/delete refused while frozen',async()=>{
      const service=await startAuth(target,destinationClient,{password,image:authImage,signingKey,encryptionKey:authKey});services.push(service)
      const login=await service.request('/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}})
      assert.equal(login.status,200)
      const challenge=await service.request(`/factors/${account.factor}/challenge`,{method:'POST',token:login.data.access_token,body:{}})
      assert.equal(challenge.status,200)
      const response=await service.request(`/factors/${account.factor}/verify`,{method:'POST',token:login.data.access_token,
        body:{challenge_id:challenge.data.id,code:totp(account.totp,1)}})
      assert.equal(response.status,200)
      assert.equal(JSON.parse(Buffer.from(response.data.access_token.split('.')[1],'base64url')).aal,'aal2')
      const refreshed=await service.request('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:response.data.refresh_token}})
      assert.equal(refreshed.status,200)
      assert.equal((await service.request('/admin/users',{method:'POST',token:service.serviceToken,body:{email:'frozen@example.invalid',password:account.password,email_confirm:true}})).status,503)
      assert.equal((await service.request(`/admin/users/${account.id}`,{method:'DELETE',token:service.serviceToken})).status,503)
      assert.equal((await destinationClient.query('select count(*)::text n from public.profiles where id=$1',[account.id])).rows[0].n,'1')
    })
    await t.test('external configuration wrongly reapplied: changed signing key refuses the retained synthetic token',async()=>{
      const service=await startAuth(target,destinationClient,{password,image:authImage,signingKey:randomBytes(32).toString('hex'),encryptionKey:authKey,port:10000})
      try {assert.equal((await service.request('/user',{token:account.sourceToken})).status,403)}
      finally {await service.stop()}
    })
    await t.test('source/destination exact BIGINT and UUID, legitimate sequence allocation does not reuse ID',async()=>{
      assert.equal((await destinationClient.query('select id::text from public.pokemon where id=9007199254740993')).rows[0].id,'9007199254740993')
      assert.equal((await destinationClient.query("select personal_revision::text r from public.collections where id='c2500000-0000-0000-0000-000000000002'")).rows[0].r,'9007199254740993')
      assert.equal((await destinationClient.query("select accepted_revision::text r from private.collection_operation_receipts where operation_id='e2500000-0000-0000-0000-000000000906'")).rows[0].r,'9007199254740993')
      const inserted=(await destinationClient.query("insert into public.pokemon(dex_number,name_fr) values(1024,'Synthetic sequence probe') returning id::text")).rows[0].id
      assert.equal(inserted,'9007199254741000')
    })
    await t.test('publisher actual login has exactly two functions; publication/replay/content valid under freeze',async()=>{
      await destinationClient.query(`alter role my_notification_publisher password '${password}'`)
      const c=new pg.Client({user:'my_notification_publisher',database:'postgres',password,stream:postgresStream(target.container_id)});c.on('error',()=>undefined);await c.connect()
      const payload={...publisherPayload,publication_key:'prod5.destination'}
      try {
        await assert.rejects(c.query('select * from public.collections'),{code:'42501'})
        await assert.rejects(c.query('select private.set_business_write_freeze(false)'),{code:'42501'})
        const published=(await c.query('select private.publish_notification_announcement($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result
        assert.equal(published.content_hash,publicationHash(payload))
        assert.deepEqual((await c.query('select private.publish_notification_announcement($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result,published)
        assert.equal((await destinationClient.query("select count(*)::text n from private.notification_announcements where publication_key='prod5.destination'")).rows[0].n,'1')
      }finally {await c.end()}
    })
    await t.test('restored owner/shared/third-party/AAL1 RLS and readers; exact receipt; controlled isolated reopen and same UUID replay',async()=>{
      const c=new pg.Client({user:'authenticator',database:'postgres',password,stream:postgresStream(target.container_id)});c.on('error',()=>undefined);await c.connect()
      const session=async(sub,aal='aal2')=>{await c.query('begin;set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub,aal})])}
      const parent='c2500000-0000-0000-0000-000000000001',op='e2500000-0000-0000-0000-000000000905'
      const announcement=(await destinationClient.query("select id,content_hash from private.notification_announcements where publication_key='prod5.destination'")).rows[0]
      let receipt,preview
      try {
        await session('a2500000-0000-0000-0000-000000000001')
        assert.ok((await c.query('select public.get_collection_content_v2($1) result',[parent])).rows[0].result.items.length>0)
        receipt=(await c.query('select public.get_collection_operation_result($1,$2) result',[parent,op])).rows[0].result
        preview=(await c.query('select public.preview_collection_update($1) result',[parent])).rows[0].result
        assert.ok(preview.token)
        assert.ok((await c.query('select public.get_notification_center() result')).rows[0].result.items.length>0)
        assert.equal((await c.query('select public.get_notification_content($1) result',[announcement.id])).rows[0].result.body,publisherPayload.body)
        assert.equal((await destinationClient.query('select count(*)::text n from private.notification_announcement_states where announcement_id=$1',[announcement.id])).rows[0].n,'0')
        await assert.rejects(c.query("select public.set_collection_item_hidden($1,'d2500000-0000-0000-0000-000000000001',true,2,$2)",[parent,op]),{code:'PT503'})
        await c.query('rollback')
        for(const [sub,aal,visible] of [['a2500000-0000-0000-0000-000000000002','aal2',true],['a2500000-0000-0000-0000-000000000003','aal2',false],['a2500000-0000-0000-0000-000000000001','aal1',false]]) {
          await session(sub,aal)
          assert.equal((await c.query('select count(*)::text n from public.collections where id=$1',[parent])).rows[0].n,visible?'1':'0')
          await c.query('rollback')
        }
        // Explicit test decision, committed and reread; never performed by the CLI.
        await destinationClient.query('select private.set_business_write_freeze(false)')
        assert.equal((await readFreeze(destinationClient)).frozen,false)
        await session('a2500000-0000-0000-0000-000000000001')
        assert.deepEqual((await c.query("select public.set_collection_item_hidden($1,'d2500000-0000-0000-0000-000000000001',true,2,$2) result",[parent,op])).rows[0].result,receipt)
        const applyOp='e2500000-0000-0000-0000-000000000909'
        const fresh=(await c.query('select public.preview_collection_update($1) result',[parent])).rows[0].result
        const applied=(await c.query('select public.apply_collection_update($1,$2::jsonb,$3) result',[parent,JSON.stringify(fresh.token),applyOp])).rows[0].result
        assert.deepEqual((await c.query('select public.apply_collection_update($1,$2::jsonb,$3) result',[parent,JSON.stringify(fresh.token),applyOp])).rows[0].result,applied)
        await c.query("update public.user_preferences set binder_default_format='2x2' where user_id=auth.uid()")
        await c.query('select public.process_announcement_notification($1,$2)',[announcement.id,announcement.content_hash])
        await c.query('commit')
        assert.equal((await destinationClient.query('select read_at is not null and processed_at is not null done from private.notification_announcement_states where announcement_id=$1',[announcement.id])).rows[0].done,true)
        assert.equal((await destinationClient.query("select count(*)::text n from private.collection_operation_receipts where collection_id=$1 and operation_id=$2",[parent,applyOp])).rows[0].n,'1')
        await session('a2500000-0000-0000-0000-000000000002')
        await assert.rejects(c.query('select public.apply_collection_update($1,$2::jsonb,$3)',[parent,JSON.stringify(fresh.token),'e2500000-0000-0000-0000-000000000910']),{code:'42501'})
        await c.query('rollback')
      }finally {await c.query('rollback').catch(()=>undefined);await c.end();await destinationClient.query('select private.set_business_write_freeze(true)')}
      assert.equal((await readFreeze(destinationClient)).frozen,true)
    })
    await t.test('restored data modified by exercised paths cannot retain the original recovery certification',async()=>{
      await assert.rejects(verifyRestoredDatabase(destinationClient,bundle.content),/restore_validation/)
    })
    await t.test('restored Auth triggers create profile and clean up a new synthetic account after explicit isolated reopen',async()=>{
      await destinationClient.query('select private.set_business_write_freeze(false)')
      try {
        const service=services[0]
        const created=await service.request('/admin/users',{method:'POST',token:service.serviceToken,
          body:{email:'post-restore@example.invalid',password:account.password,email_confirm:true}})
        assert.equal(created.status,200)
        assert.equal((await destinationClient.query('select count(*)::text n from public.profiles where id=$1',[created.data.id])).rows[0].n,'1')
        assert.equal((await service.request(`/admin/users/${created.data.id}`,{method:'DELETE',token:service.serviceToken})).status,200)
        assert.equal((await destinationClient.query('select count(*)::text n from public.profiles where id=$1',[created.data.id])).rows[0].n,'0')
      }finally {await destinationClient.query('select private.set_business_write_freeze(true)')}
    })
    await t.test('wrong key, manifest alteration, checksum mismatch, incomplete and missing archives cannot write a destination',async()=>{
      const unused=await fresh()
      await assert.rejects(preflightRestore(archive,randomBytes(32)),/authentication/)
      for(const name of ['manifest.myb','database.dump.myb']) {
        const file=join(archive,name),original=await readFile(file),altered=Buffer.from(original);altered[25]^=1
        await writeFile(file,altered);await assert.rejects(preflightRestore(archive,encryptionKey(key)),/authentication|checksum/);await writeFile(file,original)
        if(name==='database.dump.myb') {
          await writeFile(file,original.subarray(0,-10));await assert.rejects(preflightRestore(archive,encryptionKey(key)),/checksum/);await writeFile(file,original)
        }
      }
      const file=join(archive,'inventory.json.myb');await rename(file,file+'.missing')
      await assert.rejects(preflightRestore(archive,encryptionKey(key)),/absent_extra/);await rename(file+'.missing',file)
      await writeFile(join(archive,'INCOMPLETE'),'Synthetic interrupted capture')
      await assert.rejects(preflightRestore(archive,encryptionKey(key)),/absent_extra/);await rm(join(archive,'INCOMPLETE'))
      assert.equal((await inspectDestination(unused,bundle,password)).outcome,'isolated_empty_destination_verified')
    })
    await t.test('wrong PostgreSQL version, extension version, role omission, destination identity and authorization refuse before writes',async()=>{
      const unused=await fresh()
      await assert.rejects(inspectDestination(unused,{...bundle,manifest:{...bundle.manifest,identity:{...bundle.manifest.identity,version_num:'170011'}}},password),/version/)
      await assert.rejects(inspectDestination(unused,{...bundle,content:{...bundle.content,extensions:bundle.content.extensions.map(e=>({...e,extversion:'999.0'}))}},password),/extension_version/)
      await assert.rejects(inspectDestination(unused,{...bundle,content:{...bundle.content,roles:bundle.content.roles.filter(r=>r.rolname!=='my_notification_publisher')}},password),/role_missing/)
      await assert.rejects(inspectDestination({...unused,system_id:'1'},bundle,password),/identity/)
      await assert.rejects(inspectDestination({...unused,container:'supabase_db_my-local'},bundle,password),/isolated/)
      await assert.rejects(executeRestore(unused,bundle,password,{authorized:false,expectedManifest:bundle.manifest_sha256,report:join(directory,'unauthorized.json')}),/authorization/)
      await assert.rejects(executeRestore(unused,bundle,password,{authorized:true,expectedManifest:'a'.repeat(64),report:join(directory,'wrong-manifest.json')}),/authorization/)
      assert.equal((await inspectDestination(unused,bundle,password)).outcome,'isolated_empty_destination_verified')
    })
    await t.test('pg_restore fails on real conflicting object; single transaction rolls back native objects; preparation stays disposable',async()=>{
      const {t:failed,c,toc}=await prepare()
      try {
        await c.query('create table public.pokemon(id bigint)')
        await assert.rejects(nativeRestore(failed,bundle,password,toc,{authorized:true}),/tool_failed/)
        assert.equal((await c.query("select to_regclass('auth.users') is null absent")).rows[0].absent,true)
        await c.end()
        await assert.rejects(inspectDestination(failed,bundle,password),/not_empty/)
      }finally {await c.end().catch(()=>undefined)}
    })
    await t.test('missing publisher role produces real post-data failure; no partial data certified',async()=>{
      const {t:failed,c,toc}=await prepare()
      try {
        await c.query('drop role my_notification_publisher')
        await assert.rejects(nativeRestore(failed,bundle,password,toc,{authorized:true}),/tool_failed/)
        assert.equal((await c.query("select to_regclass('auth.users') is null absent")).rows[0].absent,true)
      }finally {await c.end()}
    })
    await t.test('actual native PostgreSQL connection lost mid-COPY; failure and independent read, no blind reuse',async()=>{
      const {t:failed,c,toc}=await prepare()
      const pending=nativeRestore(failed,bundle,password,toc,{authorized:true}).then(()=>({success:true}),error=>({error}))
      try {
        const pid=await awaitNative(c)
        await c.query('select pg_terminate_backend($1)',[pid])
        assert.ok((await pending).error)
        assert.equal((await c.query("select to_regclass('auth.users') is null absent")).rows[0].absent,true)
      }finally {await c.end()}
    })
    await t.test('process interruption signal during native restore; targeted cancellation and disposable partial destination',async()=>{
      const {t:failed,c,toc}=await prepare(),controller=new AbortController()
      const pending=nativeRestore(failed,bundle,password,toc,{authorized:true,signal:controller.signal}).then(()=>({success:true}),error=>({error}))
      try {
        await awaitNative(c);controller.abort()
        assert.ok((await pending).error)
        assert.equal((await c.query("select to_regclass('auth.users') is null absent")).rows[0].absent,true)
      }finally {await c.end()}
    })
    await t.test('business security regression and insufficient rights explicitly fail; test injection rolled back',async()=>{
      await destinationClient.query('begin')
      try {
        await destinationClient.query('grant execute on function private.set_business_write_freeze(boolean) to authenticated')
        const security=await import('../maintenance/database.js')
        await assert.rejects(security.verifyFreezeContract(destinationClient),/permissions_incomplete/)
      }finally {await destinationClient.query('rollback')}
      const c=new pg.Client({user:'authenticator',database:'postgres',password,stream:postgresStream(target.container_id)});c.on('error',()=>undefined);await c.connect()
      try {await assert.rejects(c.query('create schema prod5_unauthorized authorization supabase_admin'),{code:'42501'})}
      finally {await c.end()}
    })
    await t.test('real isolated CLI executes authenticated archive on a second fresh explicit target; safe report; no recovery claim',async()=>{
      const cliTarget=await fresh(),targetFile=join(directory,'cli-target.json'),reportFile=join(directory,'cli-report.json')
      await writeFile(targetFile,JSON.stringify(cliTarget),{flag:'wx',mode:0o600})
      const output=execFileSync(process.execPath,['scripts/backup/restore.js','--command','execute','--directory',archive,'--target',targetFile,
        '--report',reportFile,'--expect-manifest-sha256',bundle.manifest_sha256,'--authorize-isolated-restore'],
      {env:{...process.env,MY_RESTORE_DATABASE_PASSWORD:password},encoding:'utf8',windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe']})
      const result=JSON.parse(output)
      assert.equal(result.data_verified,true);assert.equal(result.postgresql_restored,true)
      assert.equal(result.application_recovery_proven,false);assert.equal(result.production_recovery_proven,false)
      assert.ok(!output.includes(password)&&!output.includes(key)&&!output.includes(account.totp)&&!output.includes(account.email))
      assert.equal(JSON.parse(await readFile(reportFile,'utf8')).outcome,'isolated_postgresql_restored_data_verified')
    })
    await t.test('Windows DPAPI wrapper runs Restore preflight offline and clears working secrets',async()=>{
      if(process.platform!=='win32')return
      const quote=s=>`'${s.replaceAll("'","''")}'`,keyFile=join(directory,'restore-key.dpapi')
      const script=`$ErrorActionPreference='Stop';$secure=ConvertTo-SecureString $env:MY_BACKUP_KEY -AsPlainText -Force;
        ConvertFrom-SecureString $secure | Set-Content -LiteralPath ${quote(keyFile)};
        Remove-Item Env:MY_BACKUP_KEY;Remove-Item Env:MY_BACKUP_DATABASE_PASSWORD;
        & ./scripts/backup/secrets.ps1 -Action Run -Tool Restore -KeyFile ${quote(keyFile)} -BackupArgs @('--command','preflight','--directory',${quote(archive)});
        if($env:MY_BACKUP_KEY -or $env:MY_RESTORE_DATABASE_PASSWORD){throw 'Working secrets not cleared'};exit $LASTEXITCODE`
      const output=execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe']})
      assert.ok(output.includes('archive_intact_restore_not_executed')&&!output.includes(key))
    })
    console.log(JSON.stringify({total_ms:Date.now()-start,archive_files:(await readdir(archive)).length}))
  } catch(error) {throw new BackupError(/^[A-Z0-9]{5}$/.test(error.code??'')?`synthetic_SQLSTATE_${error.code}`:diagnostic(error))}
  finally {
    await mkdir('.cache/prod5',{recursive:true})
    const lastReport=await readFile(join(directory,'restore.json'),'utf8').catch(()=>null)
    if(lastReport)await writeFile('.cache/prod5/latest-restore.json',lastReport)
    for(const service of services)await service.stop()
    if(sourceAuth)await sourceAuth.stop()
    for(const c of [sourceClient,destinationClient])if(c)await c.end().catch(()=>undefined)
    if(bundle)bundle.dump.fill(0)
    if(target)await destroySandbox(target)
    for(const x of extraTargets)await destroySandbox(x)
    if(source)await destroySandbox(source,{source:true})
    if(saved.key===undefined)delete process.env.MY_BACKUP_KEY;else process.env.MY_BACKUP_KEY=saved.key
    if(saved.password===undefined)delete process.env.MY_BACKUP_DATABASE_PASSWORD;else process.env.MY_BACKUP_DATABASE_PASSWORD=saved.password
    const rel=relative(resolve(tmpdir()),resolve(directory))
    assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':')&&rel.startsWith('my-prod5-isolated-'))
    await rm(directory,{recursive:true,force:true})
  }
})
