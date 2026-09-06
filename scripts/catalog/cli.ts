import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import { connect, readState, tables } from './database.ts'
import { normalize, validateCatalogue } from './normalize.ts'
import { applyOverrides, loadOverrides } from './overrides.ts'
import { readSource } from './reader.ts'
import { includeOverrideHistory, makePlan } from './plan.ts'
import { report, printReport } from './report.ts'
import type { Report } from './report.ts'
import { lockCache, snapshot } from './snapshot.ts'
import { applyPlan } from './apply.ts'
import type { Snapshot } from './model.ts'

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { snapshot: { type: 'string' }, apply: { type: 'boolean' },
    'dry-run': { type: 'boolean' }, validate: { type: 'boolean' } }, allowPositionals: false, strict: true })
  if (values.apply && (values['dry-run'] || values.validate)) throw new Error('Choose exactly one mode')
  const started = new Date().toISOString(), mode = values.apply ? 'apply' : values.validate ? 'validate' : 'dry-run'
  const unlock = lockCache()
  let client: Awaited<ReturnType<typeof connect>> | undefined
  let result: Report | undefined
  let resolvedSource: Snapshot | undefined
  let resolvedOverridesHash: string | undefined
  const file = path.resolve('.cache/catalog-reports', `${started.replace(/[:.]/g, '-')}-${mode}.json`)
  try {
    const source = snapshot(values.snapshot)
    resolvedSource = source
    console.log(`Lecture du snapshot ${source.sha}…`)
    const raw = normalize(readSource(source.directory))
    const overrides = loadOverrides(path.resolve('data/catalog-overrides'))
    resolvedOverridesHash = overrides.hash
    client = await connect()
    await client.query(values.apply ? 'begin' : 'begin isolation level repeatable read read only')
    if (values.apply) {
      await client.query("set local lock_timeout='15s'")
      await client.query('select pg_advisory_xact_lock(771402)')
      await client.query(`lock table ${tables.map((table) => `public.${table}`).join(',')},public.card_pokemon,
        private.catalog_entity_keys,private.catalog_overrides,private.catalog_sync_runs in exclusive mode`)
    }
    const state = await readState(client)
    const catalogue = applyOverrides(includeOverrideHistory(raw, state, overrides.values), overrides.values)
    validateCatalogue(catalogue)
    const plan = makePlan(catalogue, state)
    result = report(catalogue, plan, source, overrides.hash, mode, started)
    if (values.apply) await applyPlan(client, state, plan, catalogue, result)
    await client.query(values.apply ? 'commit' : 'rollback')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
    printReport(result, file)
  } catch (error) {
    if (client) await client.query('rollback').catch(() => undefined)
    // Validation failures cause zero database writes. Only a failure after planning/apply gets a technical audit.
    if (client && result && values.apply) {
      await client.query(`insert into private.catalog_sync_runs
        (id,started_at,finished_at,status,repository,source_sha,source_committed_at,overrides_hash,pipeline_version,error_summary)
        values($1,$2,now(),'failed',$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), started, result.source.repository, result.source.sha, result.source.committed_at, result.overrides_hash,
        result.pipeline_version, 'Transaction failed; catalogue rolled back. Inspect the local report.']).catch(() => undefined)
    }
    mkdirSync(path.dirname(file), { recursive: true })
    // Do not serialize driver errors, connection strings, CLI stdout or environment secrets.
    const message = error instanceof Error && error.constructor.name !== 'DatabaseError' && !('stdout' in error)
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[connection redacted]') : 'PostgreSQL or external command failed; no catalogue changes committed.'
    writeFileSync(file, `${JSON.stringify({ mode, status: 'failed', started_at: started, finished_at: new Date().toISOString(),
      source: resolvedSource ? { repository: resolvedSource.repository, sha: resolvedSource.sha, committed_at: resolvedSource.committedAt } : null,
      overrides_hash: resolvedOverridesHash ?? null, error: message }, null, 2)}\n`)
    console.error(`Catalogue ${mode} : échec. ${message}\nRapport : ${file}`)
    process.exitCode = 1
  } finally { if (client) await client.end(); unlock() }
}
await main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Catalogue failed'); process.exitCode = 1 })
