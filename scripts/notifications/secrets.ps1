param(
  [string[]]$PublisherArgs,
  [switch]$LoadFunctionsOnly
)
$ErrorActionPreference = 'Stop'
function Read-NotificationPublisherPassword {
  if ($env:OS -ne 'Windows_NT') { throw 'Windows protected input required.' }
  Read-Host 'Dedicated PostgreSQL publisher password from approved secret store' -AsSecureString
}
if ($LoadFunctionsOnly) { return }
if (-not $PublisherArgs) { throw 'PublisherArgs required.' }
if ($env:OS -ne 'Windows_NT') { throw 'Windows protected input required.' }
if ($env:MY_NOTIFICATION_DATABASE_URL -or $env:MY_NOTIFICATION_DATABASE_PASSWORD) {
  throw 'Clear inherited notification credentials before this Cloud command.'
}
if (-not ($PublisherArgs -contains 'cloud' -or $PublisherArgs -contains '--environment=cloud') -or
    $PublisherArgs -contains '--validate') { throw 'Use node directly for offline validation and Local commands.' }
# Same masked-input/BSTR/temporary-process-environment convention as PROD.4/5.
# No persistent credential copy needed for this short interactive operation.
$protected = Read-NotificationPublisherPassword
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
try {
  $env:MY_NOTIFICATION_DATABASE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & node (Join-Path $PSScriptRoot 'publish.ts') @PublisherArgs
  $result = $LASTEXITCODE
} finally {
  Remove-Item Env:MY_NOTIFICATION_DATABASE_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $protected.Dispose()
}
exit $result
