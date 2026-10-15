import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { z } from 'zod'
import { BackupError, requireBackup, decimal } from './contract.js'
import { postgresStream } from './clients.js'

const exec=promisify(execFile)
export const sandboxName=/^my-prod5-restore-[a-f0-9]{12}$/
const sourceName=/^my-prod4-test-[a-f0-9]{12}$/
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id=z.string().regex(/^[a-f0-9]{64}$/)
const labels=(nonce,profile)=>({'my.prod5.nonce':nonce,'my.prod5.profile':profile})
const dockerEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMDATA)$/i.test(k)))
export async function docker(args,input,{allowSqlNotices=false}={}) {
  try {
    if(input===undefined) return (await exec('docker',args,{env:dockerEnv(),windowsHide:true,timeout:60_000,maxBuffer:8*1024*1024})).stdout.trim()
    return await new Promise((resolve,reject)=>{
      const child=spawn('docker',args,{env:dockerEnv(),windowsHide:true,stdio:['pipe','pipe','pipe']})
      let out='',failed=false,state='unknown',stderr=''
      child.stdout.on('data',b=>{out+=b; if(out.length>8*1024*1024) child.kill()})
      child.stderr.on('data',b=>{failed=true;stderr+=b;const found=b.toString().match(/ERROR:\s+([A-Z0-9]{5})/);if(found)state=found[1]})
      child.stdin.on('error',()=>undefined)
      const timeout=setTimeout(()=>child.kill(),60_000)
      child.once('error',()=>{clearTimeout(timeout);reject(new BackupError('isolated_docker_failed'))})
      child.once('close',code=>{
        clearTimeout(timeout)
        const noticesOnly=allowSqlNotices&&args.includes('psql')&&args.includes('VERBOSITY=sqlstate')
          &&stderr.trim().split(/\r?\n/).every(l=>/^NOTICE:\s+00000\s*$/.test(l))
        code===0&&(!failed||noticesOnly)?resolve(out.trim()):reject(new BackupError(`isolated_docker_failed_${state}`))
      })
      child.stdin.end(input)
    })
  } catch(error) {throw error instanceof BackupError?error:new BackupError('isolated_docker_failed')}
}
export async function requireLocalDocker() {
  const context=JSON.parse(await docker(['context','inspect']))[0]
  requireBackup(/^(npipe:\/\/\/\/\.\/pipe\/(dockerDesktopLinuxEngine|docker_engine)|unix:\/\/\/var\/run\/docker.sock)$/.test(context?.Endpoints?.docker?.Host),'local_docker_engine_required')
}
export const restoreTargetSchema=z.strictObject({
  format:z.literal('my-isolated-restore-target-v1'),environment:z.literal('isolated'),
  container:z.string().regex(sandboxName),container_id:id,network_id:z.null(),nonce:z.string().regex(/^[a-f0-9]{32}$/),
  client_image:digest,host:z.literal('127.0.0.1'),port:z.literal(5432),transport:z.literal('docker-stdio'),
  database:z.literal('postgres'),user:z.literal('supabase_admin'),system_id:decimal,postgres_major:z.literal(17),
})
export function decodeRestoreTarget(value) {
  const parsed=restoreTargetSchema.safeParse(value)
  requireBackup(parsed.success,'explicit_isolated_restore_target_required')
  return parsed.data
}
export async function sandboxIdentity(t,{stopped=false,source=false}={}) {
  await requireLocalDocker()
  requireBackup((source?sourceName:sandboxName).test(t.container),'isolated_container_name_required')
  const c=JSON.parse(await docker(['inspect',t.container_id]))[0]
  requireBackup(c?.Id===t.container_id&&c.Name===`/${t.container}`&&c.Image===t.client_image
    &&(stopped||c.State.Running)&&!c.HostConfig.Privileged&&c.HostConfig.NetworkMode==='none'&&t.network_id===null
    &&c.Config.Labels?.['my.prod5.nonce']===t.nonce&&c.Config.Labels?.['my.prod5.profile']===(source?'source':'destination')
    &&Object.keys(c.NetworkSettings.Networks).length===1&&c.NetworkSettings.Networks.none
    &&!c.NetworkSettings.Networks.none.IPAddress&&!c.NetworkSettings.Networks.none.Gateway
    &&c.Mounts.length===0&&Object.keys(c.HostConfig.Tmpfs).sort().join(',')==='/tmp,/var/lib/postgresql/data'
    &&c.HostConfig.Tmpfs['/var/lib/postgresql/data'].includes('size=1g')
    &&(source||c.HostConfig.ReadonlyRootfs),'isolated_resource_identity_mismatch')
  requireBackup(Object.keys(c.HostConfig.PortBindings??{}).length===0,'isolated_port_binding_mismatch')
  return c
}
export async function sandboxConnect(t,password) {
  requireBackup(typeof password==='string'&&password.length>0&&!/[\r\n\0]/.test(password),'isolated_database_password_required')
  const c=new pg.Client({host:t.host,port:t.port,database:t.database,user:t.user,password,ssl:false,
    stream:postgresStream(t.container_id),
    application_name:'my-isolated-restore',connectionTimeoutMillis:5000,statement_timeout:60_000})
  c.on('error',()=>undefined)
  try {
    await c.connect()
    const v=(await c.query(`select (pg_control_system()).system_identifier::text system_id,current_database() database,
      session_user::text identity,current_setting('server_version_num') version_num,
      current_setting('session_replication_role') replication_role,
      (select rolsuper from pg_roles where rolname=current_user) superuser`)).rows[0]
    requireBackup(v.system_id===t.system_id&&v.database===t.database&&v.identity===t.user&&v.replication_role==='origin'
      &&v.superuser&&Math.floor(Number(v.version_num)/10000)===t.postgres_major,'isolated_postgresql_identity_mismatch')
    return c
  } catch {await c.end().catch(()=>undefined);throw new BackupError('isolated_postgresql_identity_or_connection_failed')}
}
export async function createSandbox({container,client_image,password,source=false}) {
  requireBackup((source?sourceName:sandboxName).test(container)&&digest.safeParse(client_image).success
    ,'explicit_sandbox_selection_required')
  requireBackup(typeof password==='string'&&/^[a-zA-Z0-9-]{16,128}$/.test(password),'synthetic_password_required')
  await requireLocalDocker()
  requireBackup(JSON.parse(await docker(['image','inspect',client_image]))[0].Id===client_image,'local_image_required')
  const nonce=randomBytes(16).toString('hex'),profile=source?'source':'destination'
  const network_id=null
  const target={format:'my-isolated-restore-target-v1',environment:'isolated',container,container_id:'',network_id,nonce,
    client_image,host:'127.0.0.1',port:5432,transport:'docker-stdio',database:'postgres',user:'supabase_admin',system_id:'0',postgres_major:17}
  try {
    const args=['run','-d','--pull=never','--name',container,'--network','none','--security-opt=no-new-privileges',
      '--shm-size=128m','--tmpfs','/var/lib/postgresql/data:rw,uid=100,gid=101,mode=0700,size=1g',
      '--tmpfs','/tmp:rw,mode=1777,size=128m',...Object.entries(labels(nonce,profile)).flatMap(([k,v])=>['--label',`${k}=${v}`])]
    if(source) args.push('-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=supabase_admin','-e','PGDATA=/var/lib/postgresql/data',client_image)
    else args.push('--cap-drop=ALL','--read-only','--user','100:101','--entrypoint','bash',client_image,'-c',
      'while [ ! -f /var/lib/postgresql/data/ready ]; do sleep 0.05; done; exec postgres -D /var/lib/postgresql/data -k /tmp -c listen_addresses=* -c shared_preload_libraries=pg_stat_statements')
    target.container_id=await docker(args)
    if(!source) {
      await docker(['exec','-i',target.container_id,'bash','-c',
        'initdb -D /var/lib/postgresql/data -U supabase_admin --auth-local=trust --auth-host=scram-sha-256 --pwfile=/dev/stdin --locale=en_US.UTF-8 --encoding=UTF8 >/dev/null && touch /var/lib/postgresql/data/ready'],password+'\n')
    }
    const deadline=Date.now()+60_000
    let ready=false
    while(Date.now()<deadline) {
      try {await docker(['exec',target.container_id,'pg_isready','-h','127.0.0.1','-U',target.user,'-d','postgres']);ready=true;break}
      catch {await delay(250)}
    }
    requireBackup(ready,'isolated_startup_failed')
    if(source) await docker(['exec','-i',target.container_id,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
      `alter role supabase_admin password '${password}'; alter role postgres password '${password}';`)
    const c=new pg.Client({host:'127.0.0.1',port:5432,stream:postgresStream(target.container_id),user:target.user,database:'postgres',password,connectionTimeoutMillis:5000})
    await c.connect()
    try {target.system_id=(await c.query('select (pg_control_system()).system_identifier::text id')).rows[0].id}
    finally {await c.end()}
    await sandboxIdentity(target,{source})
    return target
  } catch(error) {
    // Never search/delete by a prefix. A created ID and matching labels are required.
    if(target.container_id) await destroySandbox(target,{source}).catch(()=>undefined)
    throw error
  }
}
export async function destroySandbox(target,{source=false}={}) {
  await sandboxIdentity(target,{source,stopped:true})
  const peers=(await docker(['ps','-a','-q','--no-trunc','--filter',`label=my.prod5.nonce=${target.nonce}`])).split(/\r?\n/).filter(Boolean)
  requireBackup(peers.length===1&&peers[0]===target.container_id,'isolated_service_cleanup_required_before_database')
  await docker(['rm','-f',target.container_id])
}
