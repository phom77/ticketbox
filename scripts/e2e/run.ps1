param([switch]$Build, [switch]$Restore)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$project = 'ticketbox-e2e'
$saved = @{}
foreach ($name in @('APP_PORT', 'APP_PUBLIC_URL', 'APP_ALLOWED_ORIGINS', 'E2E_PROJECT', 'E2E_PORT', 'PAYMENT_SERVICE_TOKEN', 'NOTIFICATION_SERVICE_TOKEN')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
Push-Location $repoPath
try {
    $env:APP_PORT = '18092'
    $env:APP_PUBLIC_URL = 'http://localhost:18092'
    $env:APP_ALLOWED_ORIGINS = 'http://localhost:18092'
    $env:E2E_PROJECT = $project
    $env:E2E_PORT = '18092'
    $env:PAYMENT_SERVICE_TOKEN = 'ticketbox-local-payment-service-token-change-before-deploy'
    $env:NOTIFICATION_SERVICE_TOKEN = 'ticketbox-local-notification-service-token-change-before-deploy'
    New-Item -ItemType Directory -Force '.artifacts/e2e' | Out-Null
    $arguments = @('compose', '-p', $project, '-f', 'compose.yaml', 'up', '-d')
    if ($Build) { $arguments += '--build' }
    & docker @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated end-to-end stack' }
    node scripts/e2e/resilience.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Distributed workflow checks failed' }
    if ($Restore) {
        node scripts/e2e/restore.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Application restore checks failed' }
    }
} finally {
    docker compose -p $project -f compose.yaml logs --no-color > .artifacts/e2e/services.log
    docker compose -p $project -f compose.yaml down
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Pop-Location
}
