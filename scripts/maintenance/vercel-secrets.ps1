param(
  [Parameter(Mandatory=$true)][string[]]$VercelArgs
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows protected input required.' }
if ($env:MY_VERCEL_MAINTENANCE_TOKEN) { throw 'Clear inherited operator token before this command.' }
# Same volatile secret transport as AUTO.1. Persistent copy stays in approved vault.
# No token value enters argv, transcript, Git, config JSON or a VITE_* variable.
$protected = Read-Host 'Vercel operator API token from approved secret store' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
try {
  $env:MY_VERCEL_MAINTENANCE_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & node (Join-Path $PSScriptRoot 'vercel-cli.js') @VercelArgs
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:MY_VERCEL_MAINTENANCE_TOKEN -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $protected.Dispose()
}
exit $result
