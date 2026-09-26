import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServer, build } from 'vite'
import pg from 'pg'
import { assertLocalUrl } from './catalog/database.ts'
import { normalizeSearchText, searchCatalog, tokenizeSearchQuery } from './catalog/search-catalog.ts'

// Local only. No reset, schema changes, Cloud, credential/JWT/body logging.
// Shared explicit-ID fixtures are committed for HTTP, then removed in finally.
const settings = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30_000,
}))
assertLocalUrl(settings.DB_URL)
const api = new URL(settings.API_URL)
assert.ok(api.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)
  && api.port === '55321' && api.pathname === '/' && !api.search && !api.hash && !api.username && !api.password)
assert.ok(settings.JWT_SECRET && settings.ANON_KEY)
const users = ['a1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000002']
function token(user, aal = 'aal2') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: user, role: 'authenticated', aud: 'authenticated', aal, exp: Math.floor(Date.now() / 1000) + 3600,
  })}`
  return `${unsigned}.${createHmac('sha256', settings.JWT_SECRET).update(unsigned).digest('base64url')}`
}
const authClient = (user, aal) => createClient(api.href, settings.ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token(user, aal)}` } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const client = new pg.Client({ connectionString: settings.DB_URL, connectionTimeoutMillis: 10_000 })
let installed = false
let server
try {
  await client.connect()
  await client.query("set statement_timeout='30s'")
  await client.query('select pg_advisory_lock(618002)')
  assert.equal((await client.query("select to_regprocedure('public.search_catalog_variants_for_add(text,integer,integer)') is not null ready")).rows[0].ready, true)
  const volume = (await client.query(`select (select count(*) from public.source_cards) cards,
    (select count(*) from public.catalog_variants) variants,
    (select count(*) from public.catalog_variants v join public.source_cards c on c.id=v.source_card_id
      join public.tcg_sets s on s.id=c.set_id where v.is_active and v.french_availability='confirmed' and c.is_active and s.is_active) eligible`)).rows[0]
  await client.query('begin')
  await client.query(readFileSync(new URL('../supabase/tests/database/catalog_search.fixtures.inc', import.meta.url), 'utf8'))
  await client.query('commit')
  installed = true
  server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  const { createCatalogSearchService } = await server.ssrLoadModule('/src/services/catalog-search.ts')
  const authenticated = authClient(users[0])
  const service = createCatalogSearchService(authenticated)
  const search = service.searchCatalogVariantsForAdd

  // Actual PostgreSQL -> PostgREST -> supabase-js -> application decoder.
  const result = await search('fixture6c2 Pikachu 28/73')
  assert.deepEqual(result.map(v => v.variantId), ['-88001', '9007199254740995', '-88024'])
  assert.equal(result[1].variantLabel, 'Reverse')
  assert.equal(result[1].imageUrl, 'https://example.test/reverse.webp')
  const wire = await authenticated.rpc('search_catalog_variants_for_add', { p_query: 'fixture6c2 Pikachu 28/73' })
  assert.equal(wire.error, null)
  assert.equal(wire.data[1].variant_id, '9007199254740995')
  for (const row of wire.data) assert.deepEqual(Object.keys(row).sort(), ['card_name_fr', 'image_url', 'local_id', 'set_name_fr', 'variant_id', 'variant_label'])
  assert.equal((await search('fixture6c2 Pagination')).length, 20)
  const first = await search('fixture6c2 Pagination', { limit: 100 })
  const last = await search('fixture6c2 Pagination', { limit: 100, offset: 100 })
  assert.equal(first.length, 100)
  assert.equal(last.length, 5)
  assert.equal(new Set([...first, ...last].map(v => v.variantId)).size, 105)
  assert.deepEqual(await search('fixture6c2 Pagination', { offset: 105 }), [])
  assert.deepEqual(await search('fixture6c2 no-such-card'), [])
  assert.deepEqual(await search('fixture6c2 Pagination', { limit: 10, offset: 10 }), first.slice(10, 20))
  for (const denied of [authClient(users[0], 'aal1'), authClient(users[1])]) {
    await assert.rejects(createCatalogSearchService(denied).searchCatalogVariantsForAdd('Pikachu'), { code: 'not_authorized' })
  }
  const anon = createClient(api.href, settings.ANON_KEY, { auth: { persistSession: false } })
  await assert.rejects(createCatalogSearchService(anon).searchCatalogVariantsForAdd('Pikachu'), { code: 'not_authorized' })
  const invalid = await authenticated.rpc('search_catalog_variants_for_add', { p_query: '  !!! ' })
  assert.equal(invalid.error?.code, '22023')
  console.log('PASS API/service: auth aal2, refus aal1/profil/anon, exact payload, pagination, BIGINT 9007199254740995')

  // Compare the existing portable engine against SQL on the same synthetic cards.
  // Expand each card into its eligible variants only after portable ranking.
  const entries = (await client.query(`select c.id::text id,
    coalesce('tcgdex:'||c.tcgdex_id,k.entity_key) card,c.tcgdex_id "tcgdexId",c.name_fr name,c.local_id "localId",
    c.is_active "isActive",0 "variantCount",
    jsonb_build_object('tcgdexId',s.tcgdex_id,'name',s.name_fr,'abbreviation',s.abbreviation,
      'abbreviationFr',s.abbreviation_fr,'officialCardCount',s.official_card_count) as set,
    coalesce((select jsonb_agg(jsonb_build_object('dexNumber',p.dex_number,'name',p.name_fr) order by p.dex_number)
      from public.card_pokemon cp join public.pokemon p on p.id=cp.pokemon_id where cp.card_id=c.id),'[]') pokemon
    from public.source_cards c join public.tcg_sets s on s.id=c.set_id
    left join private.catalog_entity_keys k on k.source_card_id=c.id
    where c.id between -88011 and -88001 and c.is_active and s.is_active`)).rows
  const variants = (await client.query(`select id::text id,source_card_id::text card from public.catalog_variants
    where source_card_id between -88011 and -88001 and is_active and french_availability='confirmed'
    order by sort_order nulls last,variant_key collate "C",id`)).rows
  const queries = ['Pikachu', 'pikachu', 'Légendes', 'legendes', 'Légendes', 'ＬＥＧＥＮＤＥＳ', 'Pikachu 28', '28/73',
    '028/073', '28/74', '73', 'SLG Pikachu', 'SL3.5 Pikachu', 'Raichu GX', 'Pikachu Zekrom', 'Raichu Zekrom',
    'tcgdex:fixture6c2-28', 'my:fixture6c2-alliance', "evoli coeur d'or", 'Pikachu Pikachu', 'pika', 'kach', 'GX', 'absent']
  const scoreInputs = entries.map(entry => ({ id: entry.id, local_id: entry.localId, official_count: entry.set.officialCardCount,
    fields: [entry.name, entry.localId, entry.set.name, entry.set.abbreviationFr, entry.set.abbreviation,
      entry.card, entry.tcgdexId, entry.set.tcgdexId, ...entry.pokemon.map(p => p.name)],
    weights: [120,100,90,85,85,80,80,80,...entry.pokemon.map(() => 110)],
  }))
  for (const query of queries) {
    const portable = searchCatalog(entries, query, { limit: 100 })
    const scored = (await client.query(`select id, private.catalog_search_score(
      array(select private.catalog_search_normalize(f) from unnest(fields) f),weights,
      private.catalog_search_normalize(local_id),official_count,$2::text[]) score
      from jsonb_to_recordset($1::jsonb) as x(id text,local_id text,official_count integer,fields text[],weights integer[])`,
    [JSON.stringify(scoreInputs), tokenizeSearchQuery(query)])).rows.filter(row => row.score !== null)
    assert.deepEqual(scored.map(row => [row.id,row.score]).sort(), portable.results.map(({ entry, score }) => [entry.id,score]).sort(), `Exact score parity: ${query}`)
    const scoped = `${query} fixture6c2`
    const expected = searchCatalog(entries, scoped, { limit: 100 }).results.flatMap(({ entry }) => variants.filter(v => v.card === entry.id).map(v => v.id)).slice(0,100)
    const actual = (await search(scoped, { limit: 100 })).map(v => v.variantId)
    assert.deepEqual(actual, expected, `Portable/SQL parity: ${query}`)
  }
  console.log(`PASS parity: ${queries.length} synthetic queries, portable ranking expanded to exact variants`)
  // Deliberate narrow difference: French combining blocks, not all Unicode M.
  assert.equal(normalizeSearchText('का'), 'क')
  assert.equal((await client.query("select private.catalog_search_normalize('का') value")).rows[0].value, 'का')
  const unicodeTies = ['\ue000', '\u{10000}']
  assert.deepEqual([...unicodeTies].sort(), [...unicodeTies].reverse())
  assert.deepEqual((await client.query('select value from unnest($1::text[]) value order by value collate "C"', [unicodeTies])).rows.map(row => row.value), unicodeTies)
  console.log('PASS documented Unicode boundary: non-French spacing mark retained by SQL')

  // Native SQL timings run under the actual API role and auth claims. Roll back only benchmark state.
  console.log(`Real catalogue volume (fixtures excluded): ${JSON.stringify(volume)}`)
  await client.query('begin')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], role: 'authenticated', aal: 'aal2' })])
  for (const query of ['Pikachu', 'Légendes', 'Pikachu 28', '28/73', 'SLG Pikachu', 'Raichu GX', '2']) {
    const times = []
    for (let n = 0; n < 3; n++) {
      const plan = (await client.query('explain (analyze,buffers,format json) select public.search_catalog_variants_for_add($1,20,0)', [query])).rows[0]['QUERY PLAN'][0]
      times.push(plan['Execution Time'])
    }
    console.log(`PERF SQL ${JSON.stringify(query)} limit=20 offset=0 ms=${times.join(',')}`)
  }
  await client.query('rollback')
  // Build the actual service entry for the browser and inspect its dependency graph.
  const built = await build({ configFile: false, logLevel: 'silent', build: { write: false,
    lib: { entry: 'src/services/catalog-search.ts', formats: ['es'] } } })
  const modules = (Array.isArray(built) ? built : [built]).flatMap(bundle => bundle.output.flatMap(out => out.type === 'chunk' ? out.moduleIds : []))
  assert.ok(modules.some(id => id.replaceAll('\\', '/').endsWith('/src/services/catalog-search.ts')))
  assert.ok(modules.every(id => !/[/\\](pg|pg-pool|pg-protocol)[/\\]|scripts[/\\]catalog|__vite-browser-external/.test(id)))
  console.log('PASS browser graph: service bundled without pg, Node catalogue adapter or portable full-catalogue engine')
} finally {
  await server?.close()
  try {
    await client.query('rollback')
    if (installed) {
      await client.query('begin')
      await client.query('delete from auth.users where id=any($1::uuid[])', [users])
      await client.query('delete from private.catalog_entity_keys where source_card_id between -88011 and -88001')
      await client.query('delete from public.card_pokemon where card_id between -88011 and -88001')
      await client.query('delete from public.catalog_variants where source_card_id between -88011 and -88001')
      await client.query('delete from public.source_cards where id between -88011 and -88001')
      await client.query('delete from public.pokemon where id in (-88001,-88002)')
      await client.query('delete from public.tcg_sets where id in (-88001,-88002)')
      await client.query('delete from public.tcg_series where id=-88001')
      await client.query('commit')
      assert.equal((await client.query('select count(*) n from public.catalog_variants where source_card_id between -88011 and -88001')).rows[0].n, '0')
      console.log('Synthetic search fixtures removed and verified')
    }
  } finally { await client.end() }
}
