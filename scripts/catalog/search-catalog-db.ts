import { z } from 'zod'
import { connect } from './database.ts'
import type { CatalogSearchEntry } from './search-catalog.ts'

const entrySchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/), card: z.string().regex(/^(tcgdex|my):.+$/), tcgdexId: z.string().nullable(),
  name: z.string().nullable(), localId: z.string(), isActive: z.boolean(), variantCount: z.number().int().nonnegative(),
  pokemon: z.array(z.object({ dexNumber: z.number().int().positive(), name: z.string().nullable() })),
  set: z.object({ tcgdexId: z.string(), name: z.string().nullable(), abbreviation: z.string().nullable(),
    abbreviationFr: z.string().nullable(), officialCardCount: z.number().int().nonnegative().nullable() }),
}) satisfies z.ZodType<CatalogSearchEntry>

export class CatalogSearchUnavailableError extends Error {
  constructor() {
    super("Supabase local n'est pas disponible ou sa configuration locale est refusée.\nDémarre-le avec : npm run supabase:start\nSi CATALOG_DATABASE_URL est définie, elle doit viser uniquement le loopback sur 55322/postgres.")
  }
}
export class CatalogSearchReadError extends Error {
  constructor() { super('Lecture du catalogue local impossible. Vérifie les migrations Phase 2 et les données du catalogue local.') }
}

/** One row per source card. Aggregate variants and Pokemon separately to avoid multiplying counts. */
const searchRowsSql = `select c.id::text as id,
  case when c.tcgdex_id is not null then 'tcgdex:' || c.tcgdex_id else k.entity_key end as card,
  c.tcgdex_id as "tcgdexId", c.name_fr as name, c.local_id as "localId", c.is_active as "isActive",
  jsonb_build_object('tcgdexId',s.tcgdex_id,'name',s.name_fr,'abbreviation',s.abbreviation,
    'abbreviationFr',s.abbreviation_fr,'officialCardCount',s.official_card_count) as set,
  coalesce(p.pokemon,'[]'::jsonb) as pokemon, coalesce(v.variant_count,0) as "variantCount"
  from public.source_cards c join public.tcg_sets s on s.id=c.set_id
  left join (select cp.card_id, jsonb_agg(jsonb_build_object('dexNumber',p.dex_number,'name',p.name_fr)
    order by p.dex_number) as pokemon from public.card_pokemon cp join public.pokemon p on p.id=cp.pokemon_id
    group by cp.card_id) p on p.card_id=c.id
  left join (select source_card_id,count(*)::integer as variant_count from public.catalog_variants
    where size='standard' group by source_card_id) v on v.source_card_id=c.id
  left join lateral (select entity_key from private.catalog_entity_keys where source_card_id=c.id
    order by entity_key limit 1) k on c.tcgdex_id is null`

/** LOCAL only; no query text is interpolated into SQL and no catalogue journal is created. */
export async function loadCatalogSearchEntries(): Promise<CatalogSearchEntry[]> {
  const client = await connect().catch(() => { throw new CatalogSearchUnavailableError() })
  try {
    await client.query('begin isolation level repeatable read read only')
    await client.query("set local statement_timeout='15s'")
    const result = await client.query(searchRowsSql)
    return z.array(entrySchema).parse(result.rows)
  } catch { throw new CatalogSearchReadError() }
  finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
}
