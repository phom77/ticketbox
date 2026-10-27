param(
    [ValidateSet('Docker', 'Local')][string]$BackendMode = 'Docker',
    [string]$OutputDirectory = '.artifacts/verification',
    [string]$TestcontainersHost = 'host.docker.internal'
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$outputPath = [IO.Path]::GetFullPath((Join-Path $repoPath $OutputDirectory))
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$steps = [Collections.Generic.List[object]]::new()
$manifest = [ordered]@{ startedAt = [DateTime]::UtcNow.ToString('o'); backendMode = $BackendMode; passed = $false }
$previousJwtSecret = $env:JWT_SECRET
$previousJavaToolOptions = $env:JAVA_TOOL_OPTIONS
$previousApiBase = $env:VITE_API_BASE_URL

function Invoke-Check([string]$Name, [string]$Directory, [string]$Command, [string[]]$Arguments) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    Push-Location $Directory
    try {
        & $Command @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $outputPath "$Name.log")
        $code = $LASTEXITCODE
        $steps.Add([ordered]@{ name = $Name; exitCode = $code; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 2) })
        if ($code -ne 0) { throw "$Name failed (exit $code). See $outputPath/$Name.log" }
    } finally { Pop-Location }
}

Push-Location $repoPath
try {
    if ($null -eq $env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL='/' }
    $manifest.frontendApiBaseUrl=$env:VITE_API_BASE_URL
    $env:JWT_SECRET = 'ticketbox-test-fixture-secret-with-at-least-sixty-four-characters-local-only'
    $env:JAVA_TOOL_OPTIONS = "$previousJavaToolOptions -Dapi.version=1.44".Trim()
    $source = & node scripts/ci/source-manifest.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not record source manifest' }
    $manifest.source = $source | ConvertFrom-Json
    if ($BackendMode -eq 'Docker') {
        $backendPath = (Join-Path $repoPath 'backend').Replace('\', '/')
        Invoke-Check 'backend' $repoPath 'docker' @(
            'run', '--rm', '--cpus', '4', '--memory', '3g', '--add-host', 'host.docker.internal:host-gateway',
            '-v', '/var/run/docker.sock:/var/run/docker.sock',
            '-v', 'ticketbox-maven-cache:/root/.m2', '-v', "${backendPath}:/workspace", '-w', '/workspace',
            '-e', "TESTCONTAINERS_HOST_OVERRIDE=$TestcontainersHost", '-e', 'JAVA_TOOL_OPTIONS=-Dapi.version=1.44',
            '-e', 'JWT_SECRET=ticketbox-test-fixture-secret-with-at-least-sixty-four-characters-local-only',
            'maven:3.9.9-eclipse-temurin-21', 'mvn', '-B', '-ntp', 'clean', 'verify', '-DargLine=-Xmx1536m'
        )
    } else {
        $wrapper = if ($IsWindows) { Join-Path $repoPath 'backend/mvnw.cmd' } else { Join-Path $repoPath 'backend/mvnw' }
        if ($IsWindows) {
            Invoke-Check 'backend' (Join-Path $repoPath 'backend') $wrapper @('-B', '-ntp', 'clean', 'verify', '-DargLine=-Xmx1536m')
        } else {
            Invoke-Check 'backend' (Join-Path $repoPath 'backend') 'bash' @($wrapper, '-B', '-ntp', 'clean', 'verify', '-DargLine=-Xmx1536m')
        }
    }
    $reports = @(Get-ChildItem (Join-Path $repoPath 'backend/target/surefire-reports') -Filter 'TEST-*.xml')
    if ($reports.Count -eq 0) { throw 'No backend test reports generated' }
    $suites = @($reports | ForEach-Object {
        $backendReport = [xml](Get-Content -LiteralPath $_.FullName -Raw)
        [ordered]@{ name = $backendReport.testsuite.name; tests = [int]$backendReport.testsuite.tests;
            failures = [int]$backendReport.testsuite.failures; errors = [int]$backendReport.testsuite.errors; skipped = [int]$backendReport.testsuite.skipped }
    })
    $totals = [ordered]@{}
    foreach ($field in @('tests', 'failures', 'errors', 'skipped')) {
        $totals[$field] = ($suites | ForEach-Object { $_[$field] } | Measure-Object -Sum).Sum
    }
    $manifest.backend = [ordered]@{ totals = $totals; suites = $suites }
    if ($totals.tests -le 0 -or $totals.failures -gt 0 -or $totals.errors -gt 0 -or $totals.skipped -gt 0) {
        throw 'Backend suite must pass without skipped tests'
    }
    foreach ($required in @('com.ticketbox.ModularityTest', 'com.ticketbox.PurchaseJourneyIntegrationTest',
            'com.ticketbox.module.payment.infrastructure.ProductionPaymentBoundaryTest')) {
        if (-not ($suites | Where-Object { $_.name -eq $required })) { throw "Missing required suite: $required" }
    }
    $notificationPath = (Join-Path $repoPath 'services/notification').Replace('\', '/')
    if ($BackendMode -eq 'Docker') {
        Invoke-Check 'notification' $repoPath 'docker' @(
            'run','--rm','--cpus','3','--memory','2g','--add-host','host.docker.internal:host-gateway',
            '-v','/var/run/docker.sock:/var/run/docker.sock','-v','ticketbox-maven-cache:/root/.m2',
            '-v',"${notificationPath}:/workspace",'-w','/workspace',
            '-e',"TESTCONTAINERS_HOST_OVERRIDE=$TestcontainersHost",'-e','JAVA_TOOL_OPTIONS=-Dapi.version=1.44',
            'maven:3.9.9-eclipse-temurin-21','mvn','-B','-ntp','clean','verify','-DargLine=-Xmx1024m'
        )
    } else {
        $notificationPom = Join-Path $notificationPath 'pom.xml'
        if ($IsWindows) {
            Invoke-Check 'notification' $notificationPath $wrapper @('-B','-ntp','-f',$notificationPom,'clean','verify','-DargLine=-Xmx1024m')
        } else {
            Invoke-Check 'notification' $notificationPath 'bash' @($wrapper,'-B','-ntp','-f',$notificationPom,'clean','verify','-DargLine=-Xmx1024m')
        }
    }
    $notificationReports = @(Get-ChildItem (Join-Path $notificationPath 'target/surefire-reports') -Filter 'TEST-*.xml')
    if ($notificationReports.Count -eq 0) { throw 'Notification reports missing' }
    $notificationTests=0
    foreach ($file in $notificationReports) {
        $notificationReport=[xml](Get-Content -LiteralPath $file.FullName -Raw)
        $notificationTests += [int]$notificationReport.testsuite.tests
        if ([int]$notificationReport.testsuite.failures -gt 0 -or [int]$notificationReport.testsuite.errors -gt 0 -or [int]$notificationReport.testsuite.skipped -gt 0) {
            throw 'Notification suite must pass without skipped tests'
        }
    }
    if ($notificationTests -lt 4) { throw 'Notification integration tests missing' }
    $manifest.notification = [ordered]@{ tests=$notificationTests; failures=0; errors=0; skipped=0 }
    $paymentPath=(Join-Path $repoPath 'services/payment').Replace('\','/')
    if ($BackendMode -eq 'Docker') {
        Invoke-Check 'payment' $repoPath 'docker' @(
            'run','--rm','--cpus','3','--memory','2g','--add-host','host.docker.internal:host-gateway',
            '-v','/var/run/docker.sock:/var/run/docker.sock','-v','ticketbox-maven-cache:/root/.m2',
            '-v',"${paymentPath}:/workspace",'-w','/workspace',
            '-e',"TESTCONTAINERS_HOST_OVERRIDE=$TestcontainersHost",'-e','JAVA_TOOL_OPTIONS=-Dapi.version=1.44',
            'maven:3.9.9-eclipse-temurin-21','mvn','-B','-ntp','clean','verify','-DargLine=-Xmx1024m'
        )
    } else {
        $paymentPom=Join-Path $paymentPath 'pom.xml'
        if ($IsWindows) { Invoke-Check 'payment' $paymentPath $wrapper @('-B','-ntp','-f',$paymentPom,'clean','verify','-DargLine=-Xmx1024m') }
        else { Invoke-Check 'payment' $paymentPath 'bash' @($wrapper,'-B','-ntp','-f',$paymentPom,'clean','verify','-DargLine=-Xmx1024m') }
    }
    $paymentReports=@(Get-ChildItem (Join-Path $paymentPath 'target/surefire-reports') -Filter 'TEST-*.xml')
    $paymentTests=0
    foreach ($file in $paymentReports) {
        $paymentReport=[xml](Get-Content -LiteralPath $file.FullName -Raw)
        $paymentTests += [int]$paymentReport.testsuite.tests
        if ([int]$paymentReport.testsuite.failures -gt 0 -or [int]$paymentReport.testsuite.errors -gt 0 -or [int]$paymentReport.testsuite.skipped -gt 0) { throw 'Payment suite must pass without skipped tests' }
    }
    if ($paymentTests -lt 12) { throw 'Payment integration/protocol tests missing' }
    $manifest.payment=[ordered]@{tests=$paymentTests;failures=0;errors=0;skipped=0}
    $manifest.outputs = [ordered]@{
        coreJarSha256=(Get-FileHash (Join-Path $repoPath 'backend/target/ticketbox-api-0.0.1-SNAPSHOT.jar') -Algorithm SHA256).Hash
        notificationJarSha256=(Get-FileHash (Join-Path $notificationPath 'target/notification-service-0.0.1-SNAPSHOT.jar') -Algorithm SHA256).Hash
        paymentJarSha256=(Get-FileHash (Join-Path $paymentPath 'target/payment-service-0.0.1-SNAPSHOT.jar') -Algorithm SHA256).Hash
    }
    Invoke-Check 'frontend-install' (Join-Path $repoPath 'frontend') 'npm' @('ci', '--no-audit', '--no-fund')
    Invoke-Check 'frontend-lint' (Join-Path $repoPath 'frontend') 'npm' @('run', 'lint')
    Invoke-Check 'frontend-build' (Join-Path $repoPath 'frontend') 'npm' @('run', 'build')
    Invoke-Check 'mobile-install' (Join-Path $repoPath 'mobile-scanner') 'npm' @('ci', '--no-audit', '--no-fund')
    Invoke-Check 'mobile-typecheck' (Join-Path $repoPath 'mobile-scanner') 'npm' @('run', 'typecheck')
    $finalSource = (& node scripts/ci/source-manifest.mjs) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $finalSource.sourceSha256 -ne $manifest.source.sourceSha256) {
        throw 'Source changed during verification; run again on a fixed source tree'
    }
    $manifest.passed = $true
} catch {
    $manifest.error = $_.Exception.Message
    throw
} finally {
    $manifest.steps = @($steps.ToArray())
    $manifest.completedAt = [DateTime]::UtcNow.ToString('o')
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputPath 'verification.json') -Encoding utf8
    $env:JWT_SECRET = $previousJwtSecret
    $env:JAVA_TOOL_OPTIONS = $previousJavaToolOptions
    $env:VITE_API_BASE_URL = $previousApiBase
    Pop-Location
}
