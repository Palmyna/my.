param(
  [Parameter(Mandatory=$true)][string[]]$MaintenanceArgs
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows protected input required.' }
if ($env:MY_MAINTENANCE_DATABASE_URL -or $env:MY_MAINTENANCE_DATABASE_PASSWORD) {
  throw 'Clear inherited maintenance credentials before this Cloud command.'
}
if (-not ($MaintenanceArgs -contains 'cloud' -or $MaintenanceArgs -contains '--environment=cloud')) {
  throw 'Use node directly for Local commands.'
}
# Same protected input and temporary child environment as PROD.4/6. Nothing is
# persisted; the Node process consumes the password before spawning Git.
$protected = Read-Host 'PostgreSQL operator password from approved secret store' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
try {
  $env:MY_MAINTENANCE_DATABASE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & node (Join-Path $PSScriptRoot 'cli.js') @MaintenanceArgs
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:MY_MAINTENANCE_DATABASE_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $protected.Dispose()
}
exit $result
