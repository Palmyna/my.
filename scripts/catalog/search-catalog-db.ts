import { z } from 'zod'
import type pg from 'pg'
import { connect } from './database.ts'
import { date, dateOrigin } from './model.ts'
import type { CatalogSearchEntry, CatalogSearchResponse } from './search-catalog.ts'
import type { CatalogExportVariant } from './catalog-find-export.ts'

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
async function readSearch<T>(read: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = await connect().catch(() => { throw new CatalogSearchUnavailableError() })
  try {
    await client.query('begin isolation level repeatable read read only')
    await client.query("set local statement_timeout='15s'")
    return await read(client)
  } catch { throw new CatalogSearchReadError() }
  finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
}

const readEntries = async (client: pg.Client): Promise<CatalogSearchEntry[]> => z.array(entrySchema).parse((await client.query(searchRowsSql)).rows)

export async function loadCatalogSearchEntries(): Promise<CatalogSearchEntry[]> {
  return readSearch(readEntries)
}

const exportVariantSchema = z.object({ cardId: z.string(), label: z.string().nullable(), date: date.nullable(),
  dateOrigin, key: z.string().min(1) }) satisfies z.ZodType<CatalogExportVariant>

// Applied patch selectors preserve the original key even after an identity correction.
// Removed aliases alone are not authoritative for a current source variant.
const exportVariantsSql = `select v.source_card_id::text as "cardId",v.label,
  v.effective_release_date::text as date,v.date_origin as "dateOrigin",
  coalesce(p.key,a.entity_key,v.variant_key) as key
  from public.catalog_variants v
  left join lateral (select o.target->>'key' as key from private.catalog_overrides o
    where o.action='variant.patch' and o.is_applied and exists (
      select 1 from private.catalog_entity_keys k where k.variant_id=v.id
      and (k.entity_key=o.target->>'key' or k.entity_key=(o.target->>'card') || '#' || (o.target->>'key')))
    order by o.id limit 1) p on true
  left join lateral (select entity_key from private.catalog_entity_keys
    where variant_id=v.id and entity_key like 'my:%' and position('#' in entity_key)=0
    order by entity_key limit 1) a on v.origin='my'
  where v.source_card_id=any($1::bigint[]) and v.size='standard'
  order by v.source_card_id,v.sort_order nulls last,v.variant_key,v.id`

/** Enrich only matching cards, in the same read-only snapshot as the search projection. */
export async function loadCatalogSearchExport(select: (entries: CatalogSearchEntry[]) => CatalogSearchResponse): Promise<{
  response: CatalogSearchResponse; variants: CatalogExportVariant[]
}> {
  return readSearch(async (client) => {
    const response = select(await readEntries(client))
    const variants = response.total ? z.array(exportVariantSchema).parse((await client.query(exportVariantsSql,
      [response.results.map(({ entry }) => entry.id)])).rows) : []
    return { response, variants }
  })
}
