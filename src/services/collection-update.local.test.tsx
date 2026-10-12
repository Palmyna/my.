import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createClient,type SupabaseClient } from '@supabase/supabase-js'
import { act,render,renderHook,screen,waitFor } from '@testing-library/react'
import { QueryClient,QueryClientProvider,useQuery } from '@tanstack/react-query'
import { describe,expect,test,vi } from 'vitest'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import { connect } from '../../scripts/catalog/database.ts'
import { cleanup,install,item,parent,state,target,users } from '../../scripts/collection-update-fixtures.ts'
import { createCollectionUpdateService } from './collection-update'
import { createCollectionContentService } from './collection-content'
import { createVariantDetailService } from './variant-detail'
import { CollectionUpdatePreview } from '../features/collections/CollectionUpdatePreview'
import { collectionUpdatePreviewOptions } from '../features/collections/collection-update-query'
const context=vi.hoisted(()=>({ client:null as SupabaseClient<Database> | null }))
vi.mock('./supabase',()=>({ getSupabaseClient:()=>context.client }))
describe.skipIf(process.env.MY_SUPABASE_LOCAL_TEST!=='1')('8E real SDK → PostgREST → PostgreSQL',()=>{
  test('explicit pure preview, conversion/empty presentation, exact BIGINT and owner-only security',async()=>{
    const settings=z.object({ API_URL:z.string(),ANON_KEY:z.string(),JWT_SECRET:z.string(),SERVICE_ROLE_KEY:z.string() }).parse(JSON.parse(
      execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{ encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true })))
    expect(settings.API_URL).toBe('http://127.0.0.1:55321')
    const token=(user:string,aal:string)=>{
      const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
      const body=`${encode({ alg:'HS256',typ:'JWT' })}.${encode({ sub:user,role:'authenticated',aal,aud:'authenticated',exp:Math.floor(Date.now()/1000)+600 })}`
      return `${body}.${createHmac('sha256',settings.JWT_SECRET).update(body).digest('base64url')}`
    }
    const trace: { url:string;status:number }[]=[]
    const client=(user=users[0]!,aal='aal2')=>createClient<Database>(settings.API_URL,settings.ANON_KEY,{ accessToken:()=>Promise.resolve(token(user,aal)),
      global:{ fetch:async(input,init)=>{ const response=await fetch(input,{ ...init,signal:AbortSignal.timeout(10_000) });
        const url=typeof input==='string' ? input : input instanceof URL ? input.href : input.url
        trace.push({ url,status:response.status });return response } } })
    const db=await connect(),owner=client(),service=createCollectionUpdateService(owner)
    let installed=false,unmount:(()=>void)|undefined
    const cache=new QueryClient()
    try {
      await install(db);installed=true
      expect((await service.getCollectionUpdateStatus(parent())).updateAvailable).toBe(false)
      await db.query('begin');await db.query('select pg_advisory_xact_lock(771402)')
      await target(db,['-95005','-95002','-95001','9007199254740997'],'9007199254740998')
      await db.query('update public.collections set personal_revision=9007199254740997 where id=$1',[parent()]);await db.query('commit')
      const before=await state(db)
      context.client=owner
      const hook=renderHook(()=>({ ...useQuery(collectionUpdatePreviewOptions(users[0],parent())) }),{
        wrapper:({ children })=><QueryClientProvider client={cache}>{children}</QueryClientProvider>,
      });unmount=hook.unmount
      const count=trace.length;await act(()=>Promise.resolve())
      expect(trace).toHaveLength(count)
      await act(async()=>{ const result=await hook.result.current.refetch();expect(result.error).toBeNull();expect(result.data).toBeDefined() })
      await waitFor(()=>{ expect(hook.result.current.error).toBeNull();expect(hook.result.current.isSuccess).toBe(true) })
      const preview=hook.result.current.data!
      expect(preview.token.personalRevision).toBe('9007199254740997')
      expect(preview.token.targetVersion).toBe('9007199254740998')
      expect(preview.added[0]!.variantId).toBe('9007199254740997')
      expect(preview.converted[0]!.collectionItemId).toBe(item(2))
      expect(await service.previewCollectionUpdate(parent())).toEqual(preview)
      expect(await state(db)).toEqual(before)
      const content=await createCollectionContentService(owner).getCollectionContentV2(parent())
      const metadata=await createVariantDetailService(owner).getVariantDetail('9007199254740997')
      const presentation=render(<CollectionUpdatePreview state={{ status:'ready',preview,currentItems:content.items,variants:new Map([[metadata.variantId,metadata]]) }} />)
      expect(screen.getByRole('heading',{ name:'Cartes personnelles devenant automatiques' })).toBeVisible()
      expect(screen.queryByRole('button',{ name:/appliquer/i })).not.toBeInTheDocument()
      const beforePresentation=await state(db);presentation.unmount();expect(await state(db)).toEqual(beforePresentation)
      for(const restricted of [client(users[1]),client(users[2]),client(users[3]),client(users[0],'aal1')]) {
        await expect(createCollectionUpdateService(restricted).previewCollectionUpdate(parent())).rejects.toHaveProperty('code','not_authorized')
        await expect(createCollectionUpdateService(restricted).getCollectionUpdateStatus(parent())).rejects.toHaveProperty('code','not_authorized')
      }
      await expect(service.previewCollectionUpdate(parent(8))).rejects.toHaveProperty('code','incompatible_collection')
      expect((await service.getCollectionUpdateStatus(parent(8))).orderContractVersion).toBe(1)
      await expect(service.previewCollectionUpdate(parent(2))).rejects.toHaveProperty('code','incompatible_collection')
      const anonymous=createClient<Database>(settings.API_URL,settings.ANON_KEY,{ auth:{ persistSession:false } })
      const admin=createClient<Database>(settings.API_URL,settings.SERVICE_ROLE_KEY,{ auth:{ persistSession:false } })
      expect((await anonymous.rpc('preview_collection_update',{ p_collection_id:parent() })).status).toBe(401)
      expect((await admin.rpc('get_collection_update_status',{ p_collection_id:parent() })).status).toBe(403)
      await db.query('update public.automatic_target_states set content_hash=repeat(\'a\',64) where id=-95001')
      await expect(service.previewCollectionUpdate(parent())).rejects.toHaveProperty('code','inconsistent_state')
      await db.query('begin');await db.query('select pg_advisory_xact_lock(771402)');await target(db,[],'9007199254740999');await db.query('commit')
      const empty=await service.previewCollectionUpdate(parent());expect(empty.targetEmpty).toBe(true);expect(empty.removed).toHaveLength(3);expect(empty.finalOrder).toHaveLength(2)
      const emptyPresentation=render(<CollectionUpdatePreview state={{ status:'ready',preview:empty,currentItems:content.items,variants:new Map() }} />)
      expect(screen.getByText(/Cette cible ne contient plus/)).toHaveTextContent('Vos cartes personnelles seraient conservées');emptyPresentation.unmount()
      expect(trace.every(call=>['preview_collection_update','get_collection_update_status','get_collection_content_v2','get_variant_detail'].some(name=>call.url.endsWith(`/rpc/${name}`)))).toBe(true)
      expect(trace.some(call=>/apply_|notification|set_collection|reorder|add_manual|remove_manual/.test(call.url))).toBe(false)
    } finally {
      unmount?.();cache.clear();context.client=null;await db.query('rollback')
      if(installed) await cleanup(db);await db.end()
    }
  },30_000)
})
