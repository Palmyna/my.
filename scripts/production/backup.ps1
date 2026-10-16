param()
$ErrorActionPreference = 'Stop'
$configPath = if ($env:MY_PRODUCTION_CONFIG) { $env:MY_PRODUCTION_CONFIG } else { 'D:\MY-operator\production.json' }
try {
  if (-not [IO.Path]::IsPathRooted($configPath)) { throw 'Absolute configuration path required.' }
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($config.format -ne 'my-production-backup-v1' -or $config.project -ne 'xvtiwhxvtfxvvokquttu') {
    throw 'Invalid Production configuration.'
  }
  & (Join-Path $PSScriptRoot '../backup/secrets.ps1') -Action Run -KeyFile $config.key_file -Tool ProductionBackup -BackupArgs @('--config', $configPath)
  exit $LASTEXITCODE
} catch {
  Write-Error 'Production backup refused. Configure protected production.json outside Git; no secret or raw error is printed.'
  exit 1
}
