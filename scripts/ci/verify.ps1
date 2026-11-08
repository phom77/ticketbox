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
        $serviceRepo = $repoPath.Replace('\', '/')
        Invoke-Check 'service-reactor' $repoPath 'docker' @(
            'run','--rm','--add-host','host.docker.internal:host-gateway',
            '-v','/var/run/docker.sock:/var/run/docker.sock','-v','ticketbox-maven-cache:/root/.m2',
            '-v',"${serviceRepo}:/workspace",'-w','/workspace',
            '-e',"TESTCONTAINERS_HOST_OVERRIDE=$TestcontainersHost",'-e','JAVA_TOOL_OPTIONS=-Dapi.version=1.44','-e','JWT_SECRET',
            'maven:3.9.9-eclipse-temurin-21','mvn','-B','-ntp','clean','verify'
        )
    } else {
        $mavenArguments = @('-B','-ntp','clean','verify')
        if ($IsWindows) {
            Invoke-Check 'service-reactor' $repoPath (Join-Path $repoPath 'mvnw.cmd') $mavenArguments
        } else {
            Invoke-Check 'service-reactor' $repoPath 'bash' (@((Join-Path $repoPath 'mvnw')) + $mavenArguments)
        }
    }
    $pythonCommand = if ($IsWindows) { 'python' } else { 'python3' }
    Invoke-Check 'ci-unit' $repoPath $pythonCommand @(
        '-B', '-m', 'unittest', 'discover', '-s', 'scripts/ci', '-p', 'test_*.py'
    )
    Invoke-Check 'java-reports' $repoPath $pythonCommand @('-B', 'scripts/ci/java_reports.py')
    $manifest.java = Get-Content -LiteralPath (Join-Path $outputPath 'java-reports.log') -Raw | ConvertFrom-Json
    $manifest.outputs = [ordered]@{}
    foreach ($service in @('identity', 'catalog', 'checkin', 'ticketing', 'payment', 'notification')) {
        $jar = Join-Path $repoPath "services/$service/target/$service-service-0.0.1-SNAPSHOT.jar"
        $manifest.outputs["${service}JarSha256"] = (Get-FileHash $jar -Algorithm SHA256).Hash
        Invoke-Check "service-boundary-$service" $repoPath $pythonCommand @(
            'scripts/ci/verify-service-boundaries.py', '--service', $service
        )
    }
    Invoke-Check 'compose-default' $repoPath 'docker' @('compose', '-f', 'compose.yaml', 'config', '--quiet')
    Invoke-Check 'compose-lab' $repoPath 'docker' @('compose', '-f', 'compose.yaml', '-f', 'compose.lab.yaml', '--profile', 'lab', 'config', '--quiet')
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
