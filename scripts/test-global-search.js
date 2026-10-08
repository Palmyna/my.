import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { localConnection } from './catalog/database.ts'
import { searchCatalog } from './catalog/search-catalog.ts'

// Local-only SQL/portable-engine proof. Explicit fixtures, no commits or resets.
const client = new pg.Client({ connectionString: localConnection(), connectionTimeoutMillis: 10_000 })
const viewer = 'a7e10000-0000-0000-0000-000000000001'
async function asViewer() {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: viewer, aal: 'aal2' })])
}
try {
  await client.connect()
  await client.query("set statement_timeout='30s'")
  const volume = (await client.query(`select (select count(*) from public.source_cards) cards,
    (select count(*) from public.catalog_variants) variants,
    (select count(distinct v.source_card_id) from public.catalog_variants v
      join public.source_cards c on c.id=v.source_card_id join public.tcg_sets s on s.id=c.set_id
      where v.is_active and v.size='standard' and v.french_availability='confirmed' and c.is_active and s.is_active) eligible_cards`)).rows[0]
  await client.query('begin')
  await client.query(readFileSync(new URL('../supabase/tests/database/global_search.fixtures.inc', import.meta.url), 'utf8'))
  const entries = (await client.query(`select c.id::text id, coalesce('tcgdex:'||c.tcgdex_id,k.entity_key) card,
    c.tcgdex_id "tcgdexId",c.name_fr name,coalesce(c.local_id,'') "localId",c.is_active "isActive",0 "variantCount",
    jsonb_build_object('tcgdexId',s.tcgdex_id,'name',s.name_fr,'abbreviation',s.abbreviation,
      'abbreviationFr',s.abbreviation_fr,'officialCardCount',s.official_card_count) as set,
    coalesce((select jsonb_agg(jsonb_build_object('dexNumber',p.dex_number,'name',p.name_fr) order by p.dex_number,p.id)
      from public.card_pokemon cp join public.pokemon p on p.id=cp.pokemon_id where cp.card_id=c.id),'[]') pokemon
    from public.source_cards c join public.tcg_sets s on s.id=c.set_id
    left join lateral (select entity_key from private.catalog_entity_keys where source_card_id=c.id order by entity_key limit 1) k on c.tcgdex_id is null
    where (c.id between -97112 and -97010 or c.id=9007199254740995) and c.is_active and s.is_active
      and exists(select 1 from public.catalog_variants v where v.source_card_id=c.id and v.is_active
        and v.size='standard' and v.french_availability='confirmed')`)).rows
  await asViewer()
  const queries = ['fixture7e1','FIXTURE7E1','fixture7e1 éclair','fixture7e1 ecl','fixture7e1 clair','fixture7e1 carte',
    'fixture7e1 28','fixture7e1 028','fixture7e1 28/73','fixture7e1 028/073','fixture7e1 28/74',
    'fixture7e1 99','fixture7e1 GS7E1A','fixture7e1 GS7E1B','fixture7e1 GS7E1A 28/73',
    'fixture7e1 éclair 28/73','tcgdex:fixture7e1-28','my:fixture7e1-alliance',
    "fixture7e1 evoli coeur d'or",'fixture7e1 fixture7e1','fixture7e1 absent','fixture7e1 280',
    'fixture7e1 ÉVOLI','fixture7e1 Cœur','fixture7e1 d’Or','fixture7e1 TG028']
  let cardReaders = 0
  for (const query of queries) {
    const result = (await client.query('select public.search_global_navigation($1) value', [query])).rows[0].value
    const cards = result.filter(row => row.kind === 'card')
    const expected = searchCatalog(entries, query, { limit: 10 }).results.slice(0, 10 - (result.length - cards.length))
    assert.deepEqual(cards.map(row => row.source_card_id), expected.map(row => row.entry.id), `Portable Card ranking: ${query}`)
    for (const card of cards) {
      const readable = (await client.query('select public.get_catalog_card($1::bigint) value', [card.source_card_id])).rows[0].value
      assert.ok(readable?.variants.length > 0, 'Every suggestion has a consultable Catalogue Card')
      assert.equal(card.image_url, readable.image_url, 'Suggestion image matches the canonical Catalogue Card')
      assert.deepEqual(card.pokemon, readable.pokemon, 'Suggestion contains every source Card Pokemon in Catalogue order')
      cardReaders++
    }
  }
  await client.query('rollback')
  console.log(`PASS SQL/portable: ${queries.length} queries, ${cardReaders} Catalogue Card reader/image/Pokemon checks; transactional fixtures rolled back`)

  // Real catalogue only, plus one viewer/profile in this rollback transaction.
  await client.query('begin')
  await client.query('insert into auth.users(id) values($1)', [viewer])
  await asViewer()
  const measures = []
  for (const query of ['Pikachu','Légendes','028','28/73','Carte','Pikachu SLG','AbsentUnique7e1']) {
    const milliseconds = []
    for (let i = 0; i < 3; i++) {
      const plan = (await client.query('explain (analyze,buffers,format json) select public.search_global_navigation($1)', [query])).rows[0]['QUERY PLAN'][0]
      milliseconds.push(plan['Execution Time'])
    }
    measures.push({ query, milliseconds })
  }
  await client.query('rollback')
  console.log(JSON.stringify({ volume, role: 'authenticated', aal: 'aal2', passes: 3, measures }, null, 2))
} finally {
  await client.query('rollback').catch(() => {})
  await client.end()
}
