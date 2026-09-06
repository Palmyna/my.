import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { reserveIds, tables, writeRows } from './database.ts'
import type { State } from './database.ts'
import type { Catalogue } from './model.ts'
import type { Plan } from './plan.ts'
import type { Report } from './report.ts'

export async function applyPlan(client: pg.Client, state: State, plan: Plan, catalogue: Catalogue, report: Report): Promise<void> {
  await reserveIds(client, state, plan.additions)
  const run = randomUUID()
  await client.query(`insert into private.catalog_sync_runs
    (id,started_at,status,repository,source_sha,source_committed_at,overrides_hash,pipeline_version)
    values ($1,$2,'running',$3,$4,$5,$6,$7)`,
  [run, report.started_at, report.source.repository, report.source.sha, report.source.committed_at, report.overrides_hash, report.pipeline_version])
  for (const table of tables) await writeRows(client, table, plan.writes[table])
  if (plan.mappingRemoves.length) await client.query(`delete from public.card_pokemon p using
    jsonb_populate_recordset(null::public.card_pokemon,$1::jsonb) d where p.card_id=d.card_id and p.pokemon_id=d.pokemon_id`, [JSON.stringify(plan.mappingRemoves)])
  if (plan.mappingAdds.length) await client.query(`insert into public.card_pokemon select * from
    jsonb_populate_recordset(null::public.card_pokemon,$1::jsonb)`, [JSON.stringify(plan.mappingAdds)])
  if (plan.aliases.length) await client.query(`insert into private.catalog_entity_keys select * from
    jsonb_populate_recordset(null::private.catalog_entity_keys,$1::jsonb)`, [JSON.stringify(plan.aliases)])
  await client.query('update private.catalog_overrides set is_applied=false where is_applied and not(id=any($1::text[]))', [catalogue.overrides.map((item) => item.id)])
  const traces = catalogue.overrides.map((item) => ({ id: item.id, reason: item.reason, action: item.action, target: item.target,
    source_value: item.before, effective_value: item.after, redundant: item.redundant, is_applied: true, last_run_id: run }))
  // JSON null is a provenance value, not SQL NULL.
  if (traces.length) await client.query(`insert into private.catalog_overrides
    (id,reason,action,target,source_value,effective_value,redundant,is_applied,last_run_id)
    select x->>'id',x->>'reason',x->>'action',x->'target',x->'source_value',x->'effective_value',
      (x->>'redundant')::boolean,true,(x->>'last_run_id')::uuid from jsonb_array_elements($1::jsonb) x
    on conflict(id) do update set reason=excluded.reason,action=excluded.action,target=excluded.target,
      source_value=excluded.source_value,effective_value=excluded.effective_value,redundant=excluded.redundant,
      is_applied=true,last_run_id=excluded.last_run_id`, [JSON.stringify(traces)])
  report.finished_at = new Date().toISOString(); report.duration_ms = Date.now() - Date.parse(report.started_at)
  const compact = { ...report, structures: undefined, diagnostics: undefined }
  await client.query("update private.catalog_sync_runs set status='success', finished_at=$2, report=$3::jsonb where id=$1", [run, report.finished_at, JSON.stringify(compact)])
}
