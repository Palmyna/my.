import type { Catalogue, Snapshot } from './model.ts'
import type { Plan } from './plan.ts'
import { hash } from './model.ts'

export function report(catalogue: Catalogue, plan: Plan, source: Snapshot, overridesHash: string, mode: string, started: string) {
  const variants = catalogue.cards.flatMap((card) => card.variants)
  const dates = { card: 0, product: 0, set: 0, override: 0, unknown: 0 }
  for (const card of catalogue.cards) dates[card.dateOrigin]++
  const fr = { confirmed: 0, unknown: 0, unavailable: 0 }
  for (const variant of variants) fr[variant.availability]++
  const diagnosticCounts: Record<string, number> = {}
  for (const diagnostic of catalogue.diagnostics) diagnosticCounts[diagnostic.code] = (diagnosticCounts[diagnostic.code] ?? 0) + 1
  return {
    mode, status: 'success', started_at: started, finished_at: new Date().toISOString(),
    duration_ms: Date.now() - Date.parse(started), pipeline_version: '1',
    source: { repository: source.repository, sha: source.sha, committed_at: source.committedAt }, overrides_hash: overridesHash,
    source_counts: catalogue.counters,
    catalogue: { pokemon: plan.rows.pokemon.length, series: plan.rows.tcg_series.length, sets: plan.rows.tcg_sets.length,
      cards: plan.rows.source_cards.length, variants: plan.rows.catalog_variants.length, mappings: plan.mappings.length,
      pokemon_without_name: plan.rows.pokemon.filter((row) => row.name_fr === null).length },
    french_availability: fr, dates, diff: plan.diffs, mappings: { added: plan.mappingAdds.length, removed: plan.mappingRemoves.length },
    overrides: { total: catalogue.overrides.length, applied: catalogue.overrides.length,
      redundant: catalogue.overrides.filter((entry) => entry.redundant).map((entry) => entry.id), errors: 0 },
    targets: plan.targets, plan_hash: hash({ rows: plan.rows, mappings: plan.mappings, aliases: plan.aliases }),
    diagnostic_counts: diagnosticCounts, diagnostics: catalogue.diagnostics,
    structures: plan.structures,
  }
}
export type Report = ReturnType<typeof report>
export function printReport(value: Report, file: string): void {
  console.log(`Catalogue ${value.mode} LOCAL — ${value.source.sha} (${value.source.committed_at})`)
  console.log(`Catalogue : ${value.catalogue.pokemon} Pokémon, ${value.catalogue.series} séries, ${value.catalogue.sets} sets, ${value.catalogue.cards} cartes, ${value.catalogue.variants} variantes, ${value.catalogue.mappings} rattachements.`)
  console.log(`FR : ${value.french_availability.confirmed} confirmed, ${value.french_availability.unknown} unknown, ${value.french_availability.unavailable} unavailable. Jumbo exclues : ${value.source_counts.jumbo_ignored ?? 0}.`)
  console.table(value.diff)
  console.log('Rattachements :', value.mappings, 'Cibles :', value.targets, 'Dates :', value.dates)
  console.log('Overrides :', value.overrides, 'Diagnostics :', value.diagnostic_counts)
  console.log(`Résultat : ${value.status}, ${value.duration_ms} ms. Rapport : ${file}`)
}
