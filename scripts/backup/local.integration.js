import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import pg from 'pg'
import { capture, verify } from './cli.js'
import { fixtureSql, dockerArgs } from './clients.js'
import { decryptJson, decryptFile, encryptionKey, fileHash } from './secure-files.js'
import { connect, identity, requireClosed } from './database.js'
import { syntheticTarget, syntheticEvidence, syntheticExternal } from './operator.test.js'

const image='public.ecr.aws/supabase/postgres:17.6.1.166'
const docker = args => execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim()
const pause = ms=>new Promise(r=>setTimeout(r,ms))

test('PROD4 isolated PostgreSQL export; no restore or personal Local volume', {timeout:240_000}, async t=>{
  const name=`my-prod4-test-${randomBytes(6).toString('hex')}`
  const directory=await mkdtemp(join(tmpdir(),'my-prod4-isolated-'))
  const key=randomBytes(32).toString('base64')
  const saved={key:process.env.MY_BACKUP_KEY,password:process.env.MY_BACKUP_DATABASE_PASSWORD}
  let client
  try {
    const digest=docker(['image','inspect',image,'--format','{{.Id}}'])
    docker(['run','-d','--rm','--pull=never','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust',
      '-e','POSTGRES_USER=supabase_admin','-e','PGDATA=/var/lib/postgresql/data','-p','127.0.0.1::5432','--shm-size=128m',digest])
    const deadline=Date.now()+60_000
    let ready=false
    while (Date.now()<deadline) {
      try { docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','supabase_admin','-d','postgres']); ready=true; break }
      catch { await pause(250) }
    }
    assert.ok(ready,'isolated database readiness required')
    const port=Number(docker(['port',name,'5432/tcp']).split(':').at(-1))
    const target={...syntheticTarget(name),port,client_image:digest}
    await fixtureSql(name,"alter user supabase_admin password 'synthetic-fixture-only'; alter user postgres password 'synthetic-fixture-only';")
    client=new pg.Client({host:'127.0.0.1',port,user:'supabase_admin',database:'postgres',password:'synthetic-fixture-only'})
    await client.connect()
    target.system_id=(await client.query('select (pg_control_system()).system_identifier::text id')).rows[0].id
    const migrationDir=new URL('../../supabase/migrations/',import.meta.url)
    const migrations=(await readdir(migrationDir)).filter(f=>/^\d{14}_.+\.sql$/.test(f)).sort()
    // Schema initialization from versioned migrations, never restoration of personal SQL/data.
    await fixtureSql(name,`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      set role postgres;\n`+(await Promise.all(migrations.map(f=>readFile(new URL(f,migrationDir),'utf8')))).join('\n'))
    for (const f of migrations) await client.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',
      [f.slice(0,14),['synthetic historical statement'],f.slice(15,-4)])
    await client.query(`grant select on supabase_migrations.schema_migrations to postgres;
      create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text);
      create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),secret text);
      create table auth.mfa_challenges(id uuid primary key,factor_id uuid references auth.mfa_factors(id));
      create table auth.mfa_amr_claims(id uuid primary key,user_id uuid references auth.users(id));
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create table storage.buckets(id text primary key,name text);
      create table storage.objects(id uuid primary key,bucket_id text references storage.buckets(id));
      grant select on auth.identities,auth.mfa_factors,auth.mfa_challenges,auth.mfa_amr_claims,auth.sessions,storage.buckets,storage.objects to postgres;
      grant pg_read_all_stats to postgres;
      insert into auth.users(id,email,encrypted_password) values('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','synthetic@example.invalid','SYNTHETIC_HASH_OLD');
      insert into auth.mfa_factors values('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','SYNTHETIC_TOTP');
      insert into auth.sessions values('cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
      set role postgres;
      insert into public.pokemon(id,dex_number,name_fr) overriding system value values(9007199254740993,1025,'SYNTHETIC_POKEMON');
      select setval('public.pokemon_id_seq',9007199254740999,true);
      insert into public.collections(id,owner_id,name,collection_type) values('dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','SYNTHETIC_COLLECTION','free');
      reset role;`)
    const fixtureDirectory=new URL('../../supabase/tests/database/',import.meta.url)
    for (const file of ['relative_order_writer','manual_collection_items_v2','collection_hidden','collection_update','collection_update_apply']) {
      await client.query('set role postgres')
      await client.query(await readFile(new URL(`${file}.fixtures.inc`,fixtureDirectory),'utf8'))
      await client.query('reset role')
    }
    await client.query(`set role postgres;
      insert into private.collection_operation_receipts(collection_id,operation_id,kind,request_hash,accepted_revision,result)
      values('dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee','eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee','move',repeat('a',64),9007199254740993,'{"synthetic":true}');
      insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
      select collection_id,9007199254740993,'eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeee1',id,'move','end','{}'
      from public.collection_items where id='d2500000-0000-0000-0000-000000000001';
      insert into private.notification_announcements(publication_key,category,title,body,requires_action,include_new_users,
        published_at,content_hash,published_by,publication_context)
      values('prod4.synthetic','announcement','Synthetic backup','SYNTHETIC_NOTIFICATION',false,true,now(),repeat('b',64),'postgres','{}');
      insert into private.notification_announcement_states(user_id,announcement_id,read_at,processed_at)
      select 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',id,now(),now() from private.notification_announcements where publication_key='prod4.synthetic';
      insert into private.collection_notification_reads values('c2500000-0000-0000-0000-000000000001',9007199254740993,now());
      insert into public.user_preferences(user_id) values('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
      select private.set_business_write_freeze(true); reset role;`)
    const evidence=syntheticEvidence(target),external=syntheticExternal(target.project)
    process.env.MY_BACKUP_KEY=key
    process.env.MY_BACKUP_DATABASE_PASSWORD='synthetic-fixture-only'
    const destination=join(directory,'complete')
    await t.test('actual native full dump with shared snapshot, concurrent Auth UPDATE excluded',async()=>{
      const outcome=await capture(target,evidence,external,destination,{synthetic:true,afterSnapshot:async()=>{
        await client.query("update auth.users set encrypted_password='SYNTHETIC_HASH_NEW' where id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'")
      }})
      assert.equal(outcome.restore_proven,false)
      assert.equal(outcome.publication_authorized,false)
      const k=encryptionKey(key)
      const content=await decryptJson(join(destination,'inventory.json.myb'),k)
      assert.deepEqual(content.migration_history,migrations.map(f=>({version:f.slice(0,14),name:f.slice(15,-4)})))
      assert.equal(content.tables.filter(v=>['public','private'].includes(v.schema)&&['r','p'].includes(v.kind)).length,24)
      assert.equal(content.roles.find(r=>r.rolname==='my_notification_publisher').rolinherit,false)
      assert.ok(content.memberships.length>0 && content.policies.length>0 && content.default_acl.length>0)
      assert.equal(content.sequences.find(s=>s.name==='pokemon_id_seq').last_value,'9007199254740999')
      for (const name of ['collection_items','physical_copies','collection_order_intents','collection_operation_receipts',
        'notification_announcements','notification_announcement_states','collection_notification_reads','user_preferences']) {
        assert.ok(BigInt(content.tables.find(v=>v.name===name).rows)>0n,name)
      }
      const manifest=await decryptJson(join(destination,'manifest.myb'),k)
      assert.ok(manifest.snapshot.id)
      assert.equal(manifest.files.length,6)
      // Render archive to memory only; pg_restore has no database option and network=none.
      const args=dockerArgs(target,'pg_restore',['--exit-on-error','--file=-'])
      const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
      const chunks=[]; child.stdout.on('data',c=>chunks.push(c)); child.stderr.resume()
      const done=new Promise((res,rej)=>{child.on('error',rej);child.on('close',code=>code===0?res():rej(new Error('archive read failed')))})
      await decryptFile(join(destination,'database.dump.myb'),k,child.stdin); await done
      const sql=Buffer.concat(chunks).toString('utf8')
      assert.ok(sql.includes('9007199254740993') && sql.includes('9007199254740999'))
      assert.ok(sql.includes('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee') && sql.includes('SYNTHETIC_TOTP'))
      assert.ok(sql.includes('SYNTHETIC_HASH_OLD') && !sql.includes('SYNTHETIC_HASH_NEW'))
      assert.ok(sql.includes('CREATE POLICY') && sql.includes('ENABLE ROW LEVEL SECURITY') && sql.includes('OWNER TO'))
      assert.ok(sql.includes('GRANT ') && sql.includes('auth_user_created_profile') && sql.includes('auth_user_deleting_account'))
      assert.ok(sql.includes('business_write_freeze') && sql.includes('collection_operation_receipts'))
      assert.ok(!(await readFile(join(destination,'database.dump.myb'))).includes(Buffer.from('SYNTHETIC_HASH_OLD')))
    })
    await t.test('integrity reread, missing/truncated files, wrong checksums/key and absent manifest refused',async()=>{
      assert.equal((await verify(destination)).encrypted,true)
      const file=join(destination,'external.json.myb'),original=await readFile(file)
      await rename(file,`${file}.missing`); await assert.rejects(verify(destination)); await rename(`${file}.missing`,file)
      await writeFile(file,original.subarray(0,original.length-10)); await assert.rejects(verify(destination),/checksum/)
      await writeFile(file,original)
      const changed=Buffer.from(original);changed[30]^=1; await writeFile(file,changed)
      await assert.rejects(verify(destination),/checksum/); await writeFile(file,original)
      process.env.MY_BACKUP_KEY=randomBytes(32).toString('base64'); await assert.rejects(verify(destination));process.env.MY_BACKUP_KEY=key
      await writeFile(join(destination,'INCOMPLETE'),'failed');await assert.rejects(verify(destination));await rm(join(destination,'INCOMPLETE'))
      const manifest=join(destination,'manifest.myb');await rename(manifest,`${manifest}.missing`);await assert.rejects(verify(destination));await rename(`${manifest}.missing`,manifest)
    })
    await t.test('Windows DPAPI wrapper verifies offline and clears inherited working secrets',async()=>{
      if (process.platform !== 'win32') return
      const quote=value=>`'${value.replaceAll("'","''")}'`
      const keyFile=join(directory,'working-key.dpapi')
      const script=`$ErrorActionPreference='Stop';
        $secure=ConvertTo-SecureString $env:MY_BACKUP_KEY -AsPlainText -Force;
        ConvertFrom-SecureString $secure | Set-Content -LiteralPath ${quote(keyFile)};
        Remove-Item Env:MY_BACKUP_KEY; Remove-Item Env:MY_BACKUP_DATABASE_PASSWORD;
        & ./scripts/backup/secrets.ps1 -Action Run -KeyFile ${quote(keyFile)} -BackupArgs @('--command','verify','--directory',${quote(destination)});
        exit $LASTEXITCODE`
      const output=execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',script],
        {encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})
      assert.ok(output.includes('capture_integrity_verified')&&!output.includes(key))
    })
    await t.test('wrong system identity, unfrozen state and stale revision refused',async()=>{
      await assert.rejects(connect(target,'incorrect-synthetic-password'),/connection_failed/)
      const connection=await connect(target,process.env.MY_BACKUP_DATABASE_PASSWORD)
      try {
        await assert.rejects(identity(connection,{...target,system_id:'1'}),/identity/)
        await assert.rejects(requireClosed(connection,{...evidence,freeze_revision:'2'}),/freeze/)
      } finally {await connection.end()}
      await client.query('select private.set_business_write_freeze(false)')
      await assert.rejects(capture(target,evidence,external,join(directory,'unfrozen'),{synthetic:true}),/freeze/)
      assert.equal((await client.query('select frozen from private.business_write_freeze')).rows[0].frozen,false)
      await client.query('select private.set_business_write_freeze(true)')
      evidence.freeze_revision='3'
    })
    await t.test('nontransactional sequence advance blocks completeness, freeze stays active',async()=>{
      await assert.rejects(capture(target,evidence,external,join(directory,'sequence-race'),{synthetic:true,afterSnapshot:async()=>{
        await client.query("select nextval('public.pokemon_id_seq')")
      }}),/sequences_changed/)
      assert.ok((await readdir(join(directory,'sequence-race'))).includes('INCOMPLETE'))
      assert.equal((await client.query('select frozen from private.business_write_freeze')).rows[0].frozen,true)
    })
    await t.test('real pg_dump failure on lost snapshot preserves partial marker without leaking diagnostics',async()=>{
      await assert.rejects(capture(target,evidence,external,join(directory,'export-error'),{synthetic:true,afterSnapshot:async({client:snapshotClient})=>{
        await snapshotClient.query('rollback')
      }}),/tool_failed/)
      assert.ok((await readdir(join(directory,'export-error'))).includes('INCOMPLETE'))
    })
    await t.test('Storage usage refuses complete status',async()=>{
      await client.query("insert into storage.buckets(id,name) values('synthetic','synthetic')")
      await assert.rejects(capture(target,evidence,external,join(directory,'storage'),{synthetic:true}),/Storage_or_Vault/)
      await client.query("delete from storage.buckets where id='synthetic'")
    })
    await t.test('CLI sanitized failure has no secret or URL and makes no implicit connection',async()=>{
      let output
      try { execFileSync(process.execPath,['scripts/backup/cli.js','--command','plan','--environment','cloud','--project','x','--config','scripts/backup/examples/target.json'],
        {encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});assert.fail('must refuse') }
      catch (error) {assert.equal(error.status,1);output=error.stdout}
      assert.ok(output.includes('incomplete_or_refused')&&!output.includes(process.env.MY_BACKUP_DATABASE_PASSWORD))
    })
    assert.equal((await fileHash(join(destination,'database.dump.myb'))).bytes>36,true)
  } finally {
    if (client) await client.end().catch(()=>undefined)
    if (saved.key===undefined) delete process.env.MY_BACKUP_KEY;else process.env.MY_BACKUP_KEY=saved.key
    if (saved.password===undefined) delete process.env.MY_BACKUP_DATABASE_PASSWORD;else process.env.MY_BACKUP_DATABASE_PASSWORD=saved.password
    // Delete only this exact reserved container and verified temporary directory; no Docker volume command.
    assert.match(name,/^my-prod4-test-[a-f0-9]{12}$/)
    try {docker(['rm','-f',name])} catch { /* container may have failed before startup */ }
    const path=resolve(directory),rel=relative(resolve(tmpdir()),path)
    assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':')&&path.includes('my-prod4-isolated-'))
    await rm(path,{recursive:true,force:true})
  }
})
