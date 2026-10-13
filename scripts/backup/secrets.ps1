param(
  [Parameter(Mandatory=$true)][ValidateSet('ImportKey','Run')][string]$Action,
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [string[]]$BackupArgs
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows DPAPI required.' }
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$keyPath = [IO.Path]::GetFullPath($KeyFile)
if (-not [IO.Path]::IsPathRooted($KeyFile) -or $keyPath.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Key must be stored outside Git, separately from backup files.'
}
$parentPath = Split-Path -Parent $keyPath
$null = Resolve-Path -LiteralPath $parentPath
if ($keyPath -match '(?i)[\\/](OneDrive[^\\/]*|Google Drive|Dropbox)[\\/]') { throw 'Synchronized key destination refused.' }
if ($Action -eq 'ImportKey') {
  if (Test-Path -LiteralPath $keyPath) { throw 'Existing key will not be overwritten.' }
  # Generate/store 32 random bytes as base64 in an approved password manager first.
  # Input is masked. DPAPI creates a machine/user-bound working copy, never a log.
  $protected = Read-Host 'Base64 key already saved separately in approved secret store' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
  try {
    $keyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($keyText -notmatch '^[a-zA-Z0-9+/]{43}=$' -or [Convert]::FromBase64String($keyText).Length -ne 32) {
      throw 'Canonical base64 encoding of a random 32-byte key required.'
    }
  } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $keyText = $null }
  $encoded = ConvertFrom-SecureString $protected
  $stream = [IO.File]::Open($keyPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
  try {
    $buffer = [Text.Encoding]::UTF8.GetBytes($encoded)
    $stream.Write($buffer, 0, $buffer.Length)
  } finally { $stream.Dispose(); $protected.Dispose() }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $keyPath /inheritance:r /grant:r "*${sid}:F" '*S-1-5-18:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Key ACL restriction failed.' }
  Write-Output 'DPAPI working key imported. Keep recovery key separately protected.'
  exit 0
}
if (-not $BackupArgs -or $BackupArgs -contains '--command=plan' -or $BackupArgs -contains 'plan') {
  throw 'Run accepts capture/verify; plan needs no secrets.'
}
$directoryIndex = [Array]::IndexOf($BackupArgs, '--directory')
$backupDirectory = $null
if ($directoryIndex -ge 0 -and $directoryIndex + 1 -lt $BackupArgs.Length) { $backupDirectory = $BackupArgs[$directoryIndex + 1] }
foreach ($argument in $BackupArgs) { if ($argument.StartsWith('--directory=')) { $backupDirectory = $argument.Substring(12) } }
if ($backupDirectory) {
  $backupPath = [IO.Path]::GetFullPath($backupDirectory)
  if ($keyPath.StartsWith($backupPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Key cannot be stored with backup.' }
}
$protected = ConvertTo-SecureString ((Get-Content -LiteralPath $keyPath -Raw).Trim())
$password = $null
if ($BackupArgs -contains 'capture' -or $BackupArgs -contains '--command=capture') {
  $password = Read-Host 'Selected PostgreSQL operator password' -AsSecureString
}
function Unprotect-InMemory([Security.SecureString]$value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
try {
  if ($env:MY_BACKUP_KEY -or $env:MY_BACKUP_DATABASE_PASSWORD) { throw 'Clear inherited backup secrets first.' }
  $env:MY_BACKUP_KEY = Unprotect-InMemory $protected
  if ($password) { $env:MY_BACKUP_DATABASE_PASSWORD = Unprotect-InMemory $password }
  & node (Join-Path $PSScriptRoot 'cli.js') @BackupArgs
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:MY_BACKUP_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:MY_BACKUP_DATABASE_PASSWORD -ErrorAction SilentlyContinue
  $protected.Dispose()
  if ($password) { $password.Dispose() }
}
exit $result
