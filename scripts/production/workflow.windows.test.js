import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const quote = value => `'${value.replaceAll("'", "''")}'`
const channels = ['MY_BACKUP_KEY', 'MY_BACKUP_DATABASE_PASSWORD', 'MY_RESTORE_DATABASE_PASSWORD',
  'MY_VERCEL_MAINTENANCE_TOKEN', 'MY_NOTIFICATION_DATABASE_PASSWORD', 'MY_NOTIFICATION_DATABASE_URL',
  'MY_PRODUCTION_GITHUB_TOKEN', 'MY_MAINTENANCE_DATABASE_PASSWORD']
for (const command of ['backup', 'open']) for (const outcome of ['success', 'child-failure', 'prompt-failure']) {
  test(`Windows prod:${command}: actual entry, DPAPI, masked prompts, ${outcome} and channel cleanup`, { skip: process.platform !== 'win32' }, async t => {
    const root = await fs.mkdtemp(join(tmpdir(), 'my-auto5-windows-'))
    t.after(async () => {
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + '\\my-auto5-windows-'))
      await fs.rm(root, { recursive: true, force: true })
    })
    const entry = fileURLToPath(new URL(`./${command}.ps1`, import.meta.url)), keyFile = join(root, 'synthetic.dpapi')
    const config = join(root, 'production.json'), runner = join(root, 'run.ps1'), key = Buffer.alloc(32, 5).toString('base64')
    const packageJson = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    assert.equal(packageJson.scripts[`prod:${command}`], `powershell.exe -NoProfile -File scripts/production/${command}.ps1`)
    await fs.writeFile(config, JSON.stringify({ format: 'my-production-backup-v1', project: 'xvtiwhxvtfxvvokquttu', key_file: keyFile }))
    await fs.writeFile(runner, `$ErrorActionPreference='Stop'
$secure=ConvertTo-SecureString ${quote(key)} -AsPlainText -Force
try { ConvertFrom-SecureString $secure | Set-Content -LiteralPath ${quote(keyFile)} } finally { $secure.Dispose() }
$global:prompts=0; $global:nodeCalls=0
function Read-Host {
  param($Prompt,[switch]$AsSecureString)
  if (-not $AsSecureString) { throw 'unmasked_prompt' }
  $global:prompts++
  if (${quote(outcome)} -eq 'prompt-failure' -and $Prompt -match 'Vercel') { throw 'AUTO5_SECRET_prompt_failure' }
  $value=if($Prompt -match 'Vercel'){'AUTO5_SECRET_VERCEL'}elseif($Prompt -match 'GitHub'){''}elseif($Prompt -match 'publisher'){'AUTO5_SECRET_PUBLISHER'}else{'AUTO5_SECRET_DATABASE'}
  if ($value.Length -eq 0) { New-Object Security.SecureString } else { ConvertTo-SecureString $value -AsPlainText -Force }
}
function node {
  $global:nodeCalls++
  if ($env:MY_BACKUP_KEY -ne ${quote(key)} -or $env:MY_BACKUP_DATABASE_PASSWORD -ne 'AUTO5_SECRET_DATABASE' -or $env:MY_VERCEL_MAINTENANCE_TOKEN -ne 'AUTO5_SECRET_VERCEL') { throw 'missing_secret_channel' }
  if (${quote(command)} -eq 'open' -and ($env:MY_NOTIFICATION_DATABASE_PASSWORD -ne 'AUTO5_SECRET_PUBLISHER' -or $env:MY_PRODUCTION_GITHUB_TOKEN)) { throw 'publisher_or_optional_GitHub_invalid' }
  if ($args.Count -ne 3 -or [IO.Path]::GetFullPath($args[0]) -ne ${quote(fileURLToPath(new URL(command === 'open' ? './open-cli.js' : './cli.js', import.meta.url)))} -or $args[1] -ne '--config' -or $args[2] -ne ${quote(config)}) { throw 'wrong_entry_or_config' }
  if (($args -join ' ') -match 'AUTO5_SECRET' -or ($args -join ' ').Contains(${quote(key)})) { throw 'secret_in_argv' }
  $global:LASTEXITCODE=if(${quote(outcome)} -eq 'child-failure'){23}else{0}
}
$env:MY_PRODUCTION_CONFIG=${quote(config)}
try { & ${quote(entry)}; $observed=$LASTEXITCODE } catch { $observed=1 }
foreach($name in @(${channels.filter(c => c !== 'MY_NOTIFICATION_DATABASE_URL' && c !== 'MY_MAINTENANCE_DATABASE_PASSWORD').map(quote).join(',')})) {
  if ([Environment]::GetEnvironmentVariable($name,'Process')) { throw 'channel_not_cleaned' }
}
$expected=if(${quote(outcome)} -eq 'success'){0}elseif(${quote(outcome)} -eq 'child-failure'){23}else{1}
if ($observed -ne $expected -or $global:nodeCalls -ne $(if(${quote(outcome)} -eq 'prompt-failure'){0}else{1})) { throw 'wrong_exit_or_child_count' }
if ($global:prompts -ne $(if(${quote(outcome)} -eq 'prompt-failure'){2}elseif(${quote(command)} -eq 'open'){4}else{2})) { throw 'redundant_or_missing_prompt' }
Write-Output 'AUTO5_WINDOWS_entry_exit_masking_DPAPI_cleanup_verified'
`)
    const env = { ...process.env }
    for (const channel of channels) env[channel] = ''
    delete env.NODE_OPTIONS
    const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-File', runner], { windowsHide: true, env, timeout: 20_000 })
    assert.match(stdout, /AUTO5_WINDOWS_entry_exit_masking_DPAPI_cleanup_verified/)
    assert.ok(!(stdout + stderr).includes('AUTO5_SECRET')); assert.ok(!(stdout + stderr).includes(key))
    if (outcome !== 'prompt-failure') assert.equal(stderr, '')
  })
}
