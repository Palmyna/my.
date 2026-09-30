import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Invoke the pinned npm CLI without a shell. Buffer the generated result so a
// failed CLI run never truncates the previously generated types.
const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url))
const result = spawnSync(process.execPath, [cli, 'gen', 'types', '--local', '--lang', 'typescript', '--schema', 'public'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  encoding: 'utf8',
})

if (result.stderr) process.stderr.write(result.stderr)
if (result.error || result.status !== 0 || !result.stdout.includes('export type Database')) {
  console.error(result.error?.message ?? 'Supabase type generation failed; existing file preserved.')
  process.exit(result.status || 1)
}

// Current CLI output is unformatted and includes trailing spaces. Normalize only
// line-end whitespace and the final newline; generated declarations stay intact.
const generated = result.stdout.replace(/[\t ]+$/gm, '').trimEnd()
writeFileSync(new URL('../src/types/database.generated.ts', import.meta.url), `${generated}\n`, 'utf8')
console.log('Generated src/types/database.generated.ts from local Supabase.')
