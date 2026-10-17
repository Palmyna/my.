// Real Windows EXEs, real TLS/SCRAM and real PROD.4 capture. No Cloud routing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, mkdir, copyFile, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { Writable } from 'node:stream'
import { createSandbox, sandboxConnect, sandboxIdentity, destroySandbox, docker } from './isolated.js'
import { initializeSource } from './restore-fixtures.js'
import { syntheticTarget, syntheticEvidence, syntheticExternal } from './operator.test.js'
import { versions, start, startTool, inspectArchive } from './clients.js'
import { validateNativeClients, nativeEnvironment } from './native.js'
import { decodeTarget, diagnostic, root } from './contract.js'
import { connect, identity, dataFingerprints } from './database.js'
import { capture, verify, manifestSchema, plan } from './cli.js'
import { preflightRestore } from './restore.js'
import { hashBytes, restrictDirectory, decryptJson, decryptFile, encryptFile, bytes, fileHash } from './secure-files.js'

test('PROD7B1 Windows native PROD4 capture on disposable network-none PostgreSQL', { timeout:300_000, skip:process.platform !== 'win32' }, async t => {
  assert.ok(process.env.MY_BACKUP_NATIVE_BIN, 'Explicit MY_BACKUP_NATIVE_BIN required; no PATH discovery')
  const directory = await mkdtemp(join(tmpdir(),'my-prod7b1-native-'))
  await restrictDirectory(directory)
  const bin = resolve(process.env.MY_BACKUP_NATIVE_BIN)
  const password = randomBytes(24).toString('hex'), key = randomBytes(32)
  const saved = { key:process.env.MY_BACKUP_KEY, password:process.env.MY_BACKUP_DATABASE_PASSWORD }
  const sockets = new Set(), processes = new Set()
  const personalBefore = await docker(['inspect','supabase_db_my-local','--format','{{.Id}} {{.State.StartedAt}} {{json .Mounts}}'])
  let sandbox, admin, proxy, target, bundle
  async function text(tool, args, options = {}, selected = target) {
    const {child,done} = startTool(selected,tool,args,options)
    const chunks=[]; child.stdout.on('data',b=>chunks.push(b)); child.stdin.end()
    await done
    return Buffer.concat(chunks).toString('utf8')
  }
  const psql = (selected = target) => text('psql',['-X','--no-password','-A','-t','-c',
    "select current_database(),session_user,(select ssl from pg_stat_ssl where pid=pg_backend_pid())"],{password},selected)
  async function configure(cert = 'server', ssl = 'on') {
    assert.ok(['server','wrong','expired'].includes(cert) && ['on','off'].includes(ssl))
    await admin.query(`alter system set ssl='${ssl}';`)
    await admin.query(`alter system set ssl_cert_file='/tmp/${cert}.crt'`)
    await admin.query(`alter system set ssl_key_file='/tmp/${cert}.key'`)
    await admin.query('select pg_reload_conf()'); await delay(200)
  }
  try {
    const files = {}
    for (const name of (await readdir(bin)).filter(n=>/\.dll$/i.test(n)||['psql.exe','pg_dump.exe','pg_restore.exe'].includes(n))) {
      files[name]=hashBytes(await readFile(join(bin,name)))
    }
    const image = await docker(['image','inspect','public.ecr.aws/supabase/postgres:17.6.1.166','--format','{{.Id}}'])
    sandbox = await createSandbox({ container:`my-prod4-test-${randomBytes(6).toString('hex')}`,client_image:image,password,source:true })
    admin = await sandboxConnect(sandbox,password)
    await initializeSource(sandbox,admin)
    await admin.query(`create table auth.identities(id uuid primary key);
      create table auth.mfa_factors(id uuid primary key);
      create table auth.mfa_challenges(id uuid primary key);
      create table auth.mfa_amr_claims(id uuid primary key);
      create table auth.sessions(id uuid primary key);
      grant select on auth.identities,auth.mfa_factors,auth.mfa_challenges,auth.mfa_amr_claims,auth.sessions to postgres;
      create table prod5_probe.snapshot(value text);
      insert into prod5_probe.snapshot values('SYNTHETIC_BEFORE_SNAPSHOT'); grant select on prod5_probe.snapshot to postgres;
      create table prod5_probe.bulk(id integer primary key, value text);
      insert into prod5_probe.bulk select n, md5(n::text) || md5((n+1)::text) from generate_series(1,100000) n;
      grant select on prod5_probe.bulk to postgres;
      select private.set_business_write_freeze(true)`)
    const hba=(await admin.query('show hba_file')).rows[0].hba_file
    assert.match(hba,/^\/(etc\/postgresql|var\/lib\/postgresql\/data)\/[a-z_./-]+$/)
    await docker(['exec','-i',sandbox.container_id,'sh','-c',`cat > ${hba}`],
      'local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n')
    await admin.query('select pg_reload_conf()')
    const openssl = ['C:/Program Files/Git/usr/bin/openssl.exe','C:/Program Files/Git/mingw64/bin/openssl.exe'].find(p=>{
      try {execFileSync(p,['version'],{windowsHide:true,stdio:'ignore'});return true} catch {return false}
    })
    assert.ok(openssl,'OpenSSL required for synthetic certificates')
    const cert = args => execFileSync(openssl,args,{cwd:directory,windowsHide:true,stdio:'ignore'})
    for (const name of ['root','bad-root']) cert(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.crt`,'-days','1','-subj',`/CN=MY-PROD7B1-${name}`])
    for (const name of ['server','wrong','expired']) {
      cert(['req','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj','/CN=MY-PROD7B1-Synthetic'])
      await writeFile(join(directory,'extensions.txt'),`subjectAltName=${name === 'wrong' ? 'DNS:wrong.invalid' : 'IP:127.0.0.1'}\nextendedKeyUsage=serverAuth\n`)
      cert(['x509','-req','-in',`${name}.csr`,'-CA','root.crt','-CAkey','root.key','-CAcreateserial','-out',`${name}.crt`,'-days',name === 'expired' ? '0' : '1','-extfile','extensions.txt'])
      for (const ext of ['crt','key']) await docker(['exec','-i',sandbox.container_id,'sh','-c',
        `cat > /tmp/${name}.${ext}; chown 100:101 /tmp/${name}.${ext}; chmod 600 /tmp/${name}.${ext}`],await readFile(join(directory,`${name}.${ext}`)))
    }
    await configure()
    // Host listener is loopback only, ephemeral, forwarding into the exact
    // identified network-none cluster. No published container port or network.
    proxy=createServer(socket=>{
      sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>undefined)
      const {child}=start(['exec','-i',sandbox.container_id,'nc','127.0.0.1','5432'])
      processes.add(child);child.once('exit',()=>processes.delete(child));child.stderr.resume();child.stdin.on('error',()=>undefined)
      socket.pipe(child.stdin);child.stdout.pipe(socket)
      socket.once('close',()=>child.kill());child.once('error',()=>socket.destroy());child.once('exit',()=>socket.destroy())
    })
    proxy.listen(0,'127.0.0.1');await once(proxy,'listening')
    const {client_image:unused,...base}=syntheticTarget(sandbox.container)
    assert.ok(unused)
    target={...base,format:'my-backup-target-v2',transport:'windows-native',port:proxy.address().port,system_id:sandbox.system_id,
      ca_file:join(directory,'root.crt'),ca_sha256:hashBytes(await readFile(join(directory,'root.crt'))),
      native_clients:{directory:bin,version:'17.11',files}}
    decodeTarget(target,'isolated',target.project)
    process.env.MY_BACKUP_KEY=key.toString('base64');process.env.MY_BACKUP_DATABASE_PASSWORD=password

    await t.test('three expected Windows executables actually start with pinned real versions',async()=>{
      const actual=await versions(target)
      assert.deepEqual(actual,{pg_dump:'pg_dump (PostgreSQL) 17.11',pg_restore:'pg_restore (PostgreSQL) 17.11',psql:'psql (PostgreSQL) 17.11'})
      console.log(JSON.stringify({transport:'windows-native',bin,tools:actual,synthetic_server:(await admin.query('show server_version')).rows[0].server_version}))
    })
    assert.equal((await psql()).trim(),'postgres|postgres|t','Require successful real TLS before dependent scenarios')
    await t.test('unknown paths/tools, wrong versions, modified EXE/DLL and extra DLL refused',async()=>{
      await assert.rejects(versions({...target,native_clients:{...target.native_clients,directory:join(directory,'missing')}}),/runtime/)
      assert.throws(()=>startTool(target,'unknown',[]),/tool_unknown/)
      await assert.rejects(versions({...target,native_clients:{...target.native_clients,version:'17.10'}}),/version/)
      assert.throws(()=>validateNativeClients({...target,native_clients:{...target.native_clients,directory:`${bin}\\..\\bin`}}),/canonical_path/)
      const junction=join(directory,'junction');await symlink(bin,junction,'junction')
      try {assert.throws(()=>validateNativeClients({...target,native_clients:{...target.native_clients,directory:junction}}),/canonical_path|reparse_path/)}
      finally {await unlink(junction)}
      const copy=join(directory,'modified-bin');await mkdir(copy)
      for(const name of Object.keys(files))await copyFile(join(bin,name),join(copy,name))
      const altered={...target,native_clients:{...target.native_clients,directory:copy}}
      for(const name of ['pg_dump.exe','libpq.dll']) {
        const original=await readFile(join(copy,name));await writeFile(join(copy,name),Buffer.concat([original,Buffer.from('changed')]))
        assert.throws(()=>validateNativeClients(altered),/hash_changed/);await writeFile(join(copy,name),original)
      }
      await writeFile(join(copy,'unknown.dll'),'unknown');assert.throws(()=>validateNativeClients(altered),/file_set/)
    })
    await t.test('minimal environment ignores inherited PG target/TLS/options and other secrets; SCRAM accepted',async()=>{
      const injected={PGHOST:'evil.invalid',PGPORT:'1',PGHOSTADDR:'192.0.2.1',PGDATABASE:'wrong',PGUSER:'wrong',PGPASSWORD:'wrong',
        PGSSLMODE:'disable',PGSSLROOTCERT:'wrong',PGSERVICE:'wrong',PGSERVICEFILE:'wrong',PGOPTIONS:'-c session_replication_role=replica',
        PGSSLNEGOTIATION:'direct',NODE_OPTIONS:'--invalid-inherited',OPENSSL_CONF:'wrong',MY_UNRELATED_SECRET:'do-not-inherit'}
      const old=Object.fromEntries(Object.keys(injected).map(k=>[k,process.env[k]]))
      Object.assign(process.env,injected)
      try {
        const env=nativeEnvironment(target,password)
        for(const name of ['PGHOSTADDR','PGSERVICE','PGOPTIONS','NODE_OPTIONS','MY_BACKUP_KEY','MY_UNRELATED_SECRET','APPDATA'])assert.equal(env[name],undefined)
        assert.equal(env.PGPASSWORD,password);assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.OPENSSL_CONF,'NUL')
        assert.equal((await psql()).trim(),'postgres|postgres|t')
        const client=await connect(target,password)
        try {await identity(client,target);assert.equal((await client.query('show session_replication_role')).rows[0].session_replication_role,'origin')}
        finally {await client.end()}
      } finally {for(const [k,v] of Object.entries(old)) {if(v===undefined)delete process.env[k];else process.env[k]=v}}
      const {child,done}=startTool(target,'psql',['-X','--no-password','-c','select 1'],{password})
      assert.ok(child.pid>0);assert.ok(child.spawnfile.endsWith('\\psql.exe'))
      assert.ok(!child.spawnargs.join(' ').includes(password));child.stdin.end();child.stdout.resume();await done
      await assert.rejects(text('psql',['-X','--no-password','-c','select 1'],{password:'bad-synthetic'}),/tool_failed/)
    })
    await t.test('native + Node reject changed CA, wrong trust, wrong hostname, expired certificate and plaintext server',async()=>{
      for(const changed of [{ca_file:null,ca_sha256:null},{ca_sha256:'0'.repeat(64)}]) {
        await assert.rejects(psql({...target,...changed}));await assert.rejects(connect({...target,...changed},password))
      }
      const bad={...target,ca_file:join(directory,'bad-root.crt'),ca_sha256:hashBytes(await readFile(join(directory,'bad-root.crt')))}
      await assert.rejects(psql(bad),/tool_failed/);await assert.rejects(connect(bad,password),/connection_failed/)
      for(const [name,ssl] of [['wrong','on'],['expired','on'],['server','off']]) {
        await configure(name,ssl)
        try {await assert.rejects(psql(),/tool_failed/);await assert.rejects(connect(target,password),/connection_failed/)}
        finally {await configure()}
      }
    })
    const destination=join(directory,'complete'),evidence=syntheticEvidence(target),external=syntheticExternal(target.project)
    await t.test('real PROD4 native capture: same MVCC snapshot, immediate encryption, seven files, owners/ACL and exact IDs',async()=>{
      const before=await dataFingerprints(admin,[{schema:'prod5_probe',name:'snapshot',kind:'r'}])
      const result=await capture(target,evidence,external,destination,{synthetic:true,afterSnapshot:async()=>{
        await admin.query("update prod5_probe.snapshot set value='SYNTHETIC_AFTER_SNAPSHOT'")
      }})
      assert.equal(result.outcome,'capture_integrity_verified');assert.equal(result.restore_proven,false);assert.equal(result.publication_authorized,false)
      const manifest=await decryptJson(join(destination,'manifest.myb'),key)
      assert.equal(manifest.format,'my-backup-manifest-v2');assert.equal(manifest.target.transport,'windows-native')
      assert.equal(manifest.tools.pg_dump,'pg_dump (PostgreSQL) 17.11');assert.equal(manifest.identity.version_num,'170006')
      const content=await decryptJson(join(destination,'inventory.json.myb'),key)
      assert.deepEqual(content.data_fingerprints.find(f=>f.schema==='prod5_probe'&&f.name==='snapshot'),before[0])
      assert.notDeepEqual(await dataFingerprints(admin,[{schema:'prod5_probe',name:'snapshot',kind:'r'}]),before)
      const migrations=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(f=>/^\d{14}_.+\.sql$/.test(f)).sort()
      assert.deepEqual(content.migration_history,migrations.map(f=>({version:f.slice(0,14),name:f.slice(15,-4)})))
      assert.equal(content.freeze_state.frozen,true)
      assert.equal(content.sequences.find(s=>s.name==='pokemon_id_seq').last_value,'9007199254740999')
      const {child,done}=startTool(target,'pg_restore',['--exit-on-error','--file=-'])
      const chunks=[];child.stdout.on('data',b=>chunks.push(b))
      await decryptFile(join(destination,'database.dump.myb'),key,child.stdin);await done
      const sql=Buffer.concat(chunks).toString('utf8')
      assert.ok(sql.includes('SYNTHETIC_BEFORE_SNAPSHOT')&&!sql.includes('SYNTHETIC_AFTER_SNAPSHOT'))
      assert.ok(sql.includes('9007199254740993')&&sql.includes('9007199254740999'))
      assert.ok(sql.includes('OWNER TO')&&sql.includes('GRANT ')&&sql.includes('CREATE POLICY')&&sql.includes('ENABLE ROW LEVEL SECURITY'))
      for(const name of await readdir(destination)) {
        const encrypted=await readFile(join(destination,name));assert.equal(encrypted.subarray(0,8).toString(),'MYBK0001')
        assert.ok(!encrypted.includes(Buffer.from(password))&&!encrypted.includes(Buffer.from('SYNTHETIC_BEFORE_SNAPSHOT')))
      }
      assert.equal((await readdir(destination)).length,7)
      // A TOC reader exits long before this dump fits in its stdin pipe. Small
      // fixtures can hide EPIPE because the OS has already buffered all input.
      assert.ok((await fileHash(join(destination,'database.dump.myb'))).bytes > 1024 * 1024)
      assert.ok((await inspectArchive(target,join(destination,'database.dump.myb'),key,true)).includes('TABLE DATA'))
      assert.equal((await verify(destination)).outcome,'capture_integrity_verified')
      bundle=await preflightRestore(destination,key);assert.equal(bundle.manifest.format,'my-backup-manifest-v2')
      const output=execFileSync(process.execPath,['scripts/backup/cli.js','--command','verify','--directory',destination],{
        env:{SystemRoot:process.env.SystemRoot,PATH:join(process.env.SystemRoot,'System32'),MY_BACKUP_KEY:key.toString('base64')},
        windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']})
      assert.equal(JSON.parse(output).outcome,'capture_integrity_verified') // No docker in PATH, DB secret or TCP relay needed.
      assert.ok(!output.includes(password)&&!output.includes(key.toString('base64')))
      assert.ok(!manifestSchema.safeParse({...manifest,format:'my-backup-manifest-v1'}).success)
      assert.equal(plan(target).connects,false)
      console.log(JSON.stringify({native_capture:result,manifest_format:manifest.format,snapshot:manifest.snapshot.id,tables:content.data_fingerprints.length}))
    })
    assert.ok(bundle,'Continue archive mutation tests only after actual capture/preflight succeeds')
    await t.test('full native archive read and verify reject damaged data even with valid TOC/GCM/checksum',async()=>{
      const path=join(destination,'database.dump.myb'),manifestPath=join(destination,'manifest.myb')
      const original=await readFile(path),originalManifest=await readFile(manifestPath)
      const chunks=[];await decryptFile(path,key,new Writable({write(b,_e,cb){chunks.push(b);cb()}}))
      const plain=Buffer.concat(chunks)
      try {
        await rm(path);await encryptFile(bytes(plain.subarray(0,plain.length-50)),path,key)
        assert.ok((await inspectArchive(target,path,key,true)).includes('TABLE DATA'))
        await assert.rejects(inspectArchive(target,path,key),/tool_failed/)
        const manifest=await decryptJson(manifestPath,key),entry=manifest.files.find(f=>f.name==='database.dump.myb')
        Object.assign(entry,await fileHash(path));await rm(manifestPath);await encryptFile(bytes(JSON.stringify(manifest)),manifestPath,key)
        await assert.rejects(verify(destination),/tool_failed/)
      } finally {plain.fill(0);await writeFile(path,original);await writeFile(manifestPath,originalManifest)}
    })
    await t.test('real pg_dump lost snapshot: partial marker, no manifest, fixed diagnostic, freeze retained',async()=>{
      const failed=join(directory,'lost-snapshot')
      await assert.rejects(capture(target,evidence,external,failed,{synthetic:true,afterSnapshot:async({client})=>client.query('rollback')}),error=>{
        assert.match(diagnostic(error),/^postgresql_tool_failed_or_warned$/);assert.ok(!diagnostic(error).includes(password));return true
      })
      assert.ok((await readdir(failed)).includes('INCOMPLETE'));assert.ok(!(await readdir(failed)).includes('manifest.myb'))
    })
    await t.test('actual pg_dump connection interrupted: process closed, partial marker, no success or reopen',async()=>{
      const controller=new AbortController(),failed=join(directory,'interrupted')
      let monitor,observed=false,finished=false
      const result=capture(target,evidence,external,failed,{synthetic:true,signal:controller.signal,afterSnapshot:async({client})=>{
        monitor=(async()=>{
          const deadline=Date.now()+10_000
          while(Date.now()<deadline&&!finished) {
            const active=(await admin.query("select pid from pg_stat_activity where application_name='my-backup' and pid<>$1",[client.processID])).rows
            if(active.length) {observed=true;controller.abort();return}
            await delay(10)
          }
          controller.abort()
        })()
      }})
      try {await assert.rejects(result,/interrupted/)} finally {finished=true;await monitor}
      assert.equal(observed,true,'Native pg_dump must really connect before cancellation')
      assert.ok((await readdir(failed)).includes('INCOMPLETE'));assert.ok(!(await readdir(failed)).includes('manifest.myb'))
      assert.equal((await admin.query('select frozen from private.business_write_freeze')).rows[0].frozen,true)
    })
    await t.test('real native timeout closes child and emits no server error or password',async()=>{
      await assert.rejects(text('psql',['-X','--no-password','-c','select pg_sleep(2)'],{password,timeoutMs:500}),/tool_timeout/)
    })
    await sandboxIdentity(sandbox,{source:true})
    assert.equal(await docker(['inspect','supabase_db_my-local','--format','{{.Id}} {{.State.StartedAt}} {{json .Mounts}}']),personalBefore)
    assert.ok(!directory.startsWith(root))
  } finally {
    bundle?.dump.fill(0);key.fill(0)
    if(admin)await admin.end().catch(()=>undefined)
    for(const socket of sockets)socket.destroy();for(const child of processes)child.kill()
    if(proxy)await new Promise(res=>proxy.close(res))
    if(sandbox)await destroySandbox(sandbox,{source:true})
    for(const [k,v] of [['MY_BACKUP_KEY',saved.key],['MY_BACKUP_DATABASE_PASSWORD',saved.password]]) {if(v===undefined)delete process.env[k];else process.env[k]=v}
    const rel=relative(resolve(tmpdir()),resolve(directory))
    assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':')&&rel.startsWith('my-prod7b1-native-'))
    await rm(directory,{recursive:true,force:true})
  }
})
