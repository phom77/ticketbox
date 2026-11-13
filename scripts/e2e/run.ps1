param([switch]$Build, [switch]$Restore, [switch]$LocalAcceptance)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$project = if ($LocalAcceptance) { 'ticketbox-e2e-acceptance' } else { 'ticketbox-e2e' }
$fixture = [ordered]@{
    APP_BIND_ADDRESS = '127.0.0.1'; CHECKIN_BIND_ADDRESS = '127.0.0.1'
    COMPOSE_DISABLE_ENV_FILE = '1'; E2E_REPORT_DIRECTORY = '.artifacts/e2e/local-acceptance'
    TICKETBOX_PAYMENT_PROFILE = 'dev'; ARTIST_BIO_AI_PROVIDER = 'mock'
    PASSWORD_RESET_KEY = 'ticketbox-e2e-only-password-reset-key-at-least-32'
    JWT_SECRET = 'ticketbox-test-fixture-secret-with-at-least-sixty-four-characters-local-only'
    SPLIT_SERVICE_TOKEN = 'ticketbox-local-split-service-token-change-before-deploy'
    VNPAY_TMN_CODE = ''; VNPAY_HASH_SECRET = ''; VNPAY_QUERY_URL = ''
    MOMO_PARTNER_CODE = ''; MOMO_ACCESS_KEY = ''; MOMO_SECRET_KEY = ''
    CLOUDINARY_CLOUD_NAME = ''; CLOUDINARY_API_KEY = ''; CLOUDINARY_API_SECRET = ''
    VITE_SUPPORT_URL = ''; VITE_TERMS_URL = ''; TICKETBOX_LOCAL_ACCEPTANCE = '1'
}
$saved = @{}
foreach ($name in (@('APP_PORT', 'APP_PUBLIC_URL', 'APP_ALLOWED_ORIGINS', 'E2E_PROJECT', 'E2E_PORT', 'PAYMENT_SERVICE_TOKEN', 'NOTIFICATION_SERVICE_TOKEN', 'CHECKIN_PORT') + @($fixture.Keys))) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
Push-Location $repoPath
try {
    if ($LocalAcceptance) {
        foreach ($name in $fixture.Keys) { [Environment]::SetEnvironmentVariable($name, $fixture[$name]) }
    }
    $env:APP_PORT = if ($LocalAcceptance) { '18096' } else { '18092' }
    $env:APP_PUBLIC_URL = "http://localhost:$env:APP_PORT"
    $env:APP_ALLOWED_ORIGINS = $env:APP_PUBLIC_URL
    $env:E2E_PROJECT = $project
    $env:E2E_PORT = $env:APP_PORT
    $env:CHECKIN_PORT = if ($LocalAcceptance) { '18097' } else { '18094' }
    $env:PAYMENT_SERVICE_TOKEN = 'ticketbox-local-payment-service-token-change-before-deploy'
    $env:NOTIFICATION_SERVICE_TOKEN = 'ticketbox-local-notification-service-token-change-before-deploy'
    New-Item -ItemType Directory -Force '.artifacts/e2e' | Out-Null
    $arguments = @('compose', '-p', $project, '-f', 'compose.yaml', 'up', '-d')
    if ($Build) { $arguments += '--build' }
    & docker @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated end-to-end stack' }
    python scripts/e2e/split.py
    if ($LASTEXITCODE -ne 0) { throw 'Distributed workflow checks failed' }
    if ($Restore -or $LocalAcceptance) {
        python scripts/e2e/split-restore.py
        if ($LASTEXITCODE -ne 0) { throw 'Application restore checks failed' }
    }
} finally {
    $reportDirectory = if ($LocalAcceptance) { $fixture.E2E_REPORT_DIRECTORY } else { '.artifacts/e2e' }
    New-Item -ItemType Directory -Force $reportDirectory | Out-Null
    docker compose -p $project -f compose.yaml logs --no-color > (Join-Path $reportDirectory 'services.log')
    docker compose -p $project -f compose.yaml down
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Pop-Location
}
