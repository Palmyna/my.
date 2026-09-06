import { execFileSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'
import { z } from 'zod'

export type Cell = string | number | boolean | null | string[]
export type Row = Record<string, Cell>
export const tables = ['pokemon', 'tcg_series', 'tcg_sets', 'source_cards', 'catalog_variants', 'automatic_target_states'] as const
export type Table = typeof tables[number]
export interface State { rows: Record<Table, Row[]>; mappings: Row[]; aliases: Row[]; next: Record<Table, bigint> }

export function assertLocalUrl(connection: string): void {
  const url = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.port !== '55322' || url.pathname !== '/postgres' || url.search !== '') {
    throw new Error('Phase 2 accepts only local PostgreSQL on port 55322, database postgres, with no URL query parameters')
  }
}
export function localConnection(): string {
  const configured = process.env.CATALOG_DATABASE_URL
  if (configured) { assertLocalUrl(configured); return configured }
  const status = execFileSync(process.execPath, [path.resolve('node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30_000 })
  const { DB_URL } = z.object({ DB_URL: z.string() }).parse(JSON.parse(status))
  assertLocalUrl(DB_URL)
  return DB_URL
}
export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: localConnection(), connectionTimeoutMillis: 10_000,
    application_name: 'my-catalog-local', types: {
      getTypeParser: (oid, format) => oid === pg.types.builtins.DATE || oid === pg.types.builtins.TIMESTAMPTZ
        ? (value: string) => value : pg.types.getTypeParser(oid, format) as (value: string) => unknown,
    } })
  await client.connect()
  const check = await client.query<{ port: number; private_table: string | null }>(
    "select inet_server_port() as port, to_regclass('private.catalog_sync_runs')::text as private_table")
  if (check.rows[0]?.port !== 5432 || !check.rows[0].private_table) {
    await client.end(); throw new Error('Expected migrated Supabase local database was not found')
  }
  return client
}
export async function readState(client: pg.Client): Promise<State> {
  const rows = {} as State['rows'], next = {} as State['next']
  for (const table of tables) {
    rows[table] = (await client.query<Row>(`select * from public.${table} order by id`)).rows
    const sequence = (await client.query<{ last_value: string; is_called: boolean }>(`select last_value, is_called from public.${table}_id_seq`)).rows[0]
    if (!sequence) throw new Error(`Missing sequence: ${table}`)
    next[table] = BigInt(sequence.last_value) + (sequence.is_called ? 1n : 0n)
  }
  return { rows, next, mappings: (await client.query<Row>('select * from public.card_pokemon order by card_id, pokemon_id')).rows,
    aliases: (await client.query<Row>('select * from private.catalog_entity_keys order by entity_key')).rows }
}

export async function reserveIds(client: pg.Client, state: State, additions: Record<Table, Row[]>): Promise<void> {
  for (const table of tables) {
    const count = additions[table].length
    if (!count) continue
    // Dry-run predicts without nextval. Apply verifies the actual reservations before any catalogue INSERT.
    const reserved = await client.query<{ id: string }>(`select nextval('public.${table}_id_seq')::text as id from generate_series(1, $1)`, [count])
    if (reserved.rows.some((row, index) => BigInt(row.id) !== state.next[table] + BigInt(index))) throw new Error(`Concurrent sequence change: ${table}; retry the complete plan`)
  }
}
export async function writeRows(client: pg.Client, table: Table, rows: Row[]): Promise<void> {
  if (!rows.length) return
  const columns = Object.keys(rows[0] ?? {})
  // Table names come exclusively from Table; columns are produced by the internal planner, never JSON input.
  const assignments = columns.filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`).join(',')
  for (let i = 0; i < rows.length; i += 1000) {
    await client.query(`insert into public.${table} (${columns.join(',')}) overriding system value
      select ${columns.join(',')} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)
      on conflict (id) do update set ${assignments}`, [JSON.stringify(rows.slice(i, i + 1000))])
  }
}
