import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The CLI mounts tests into pg_prove, but not the sibling migrations directory.
// Stage the actual migration beside the regression test, without duplicating SQL.
const migration = new URL('../supabase/migrations/20260906082314_harden_rls_auto_enable.sql', import.meta.url)
const include = new URL('../supabase/tests/database/harden_rls_auto_enable.generated.inc', import.meta.url)
writeFileSync(include, readFileSync(migration), { flag: 'wx' })

try {
  const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url))
  const result = spawnSync(process.execPath, [cli, 'test', 'db', '--local'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error.message)
  process.exitCode = result.status ?? 1
} finally {
  unlinkSync(include)
}
