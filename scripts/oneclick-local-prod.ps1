$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$env:APP_DB_TARGET = 'local'
$env:DATABASE_URL = 'file:./prisma/dev.db'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3000'
$localUrl = "http://$($env:HOSTNAME):$($env:PORT)"

$logDir = Join-Path $projectRoot 'logs'
$prodLog = Join-Path $logDir 'prod-local.log'
$prodErr = Join-Path $logDir 'prod-local.err.log'
$pidFile = Join-Path $logDir '.local-prod.pid'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (Test-Path $pidFile) {
    $oldPid = ((Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1) | Out-String).Trim()
    if ($oldPid) {
        cmd /c "taskkill /PID $oldPid /F >nul 2>nul" | Out-Null
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$listeners = netstat -ano | Select-String -Pattern (":" + $env:PORT + "\s+.*LISTENING")
foreach ($line in $listeners) {
    $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
    $targetPid = $parts[-1]
    if ($targetPid -and $targetPid -ne '0') {
        cmd /c "taskkill /PID $targetPid /F >nul 2>nul" | Out-Null
    }
}

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    $busy = netstat -ano | Select-String -Pattern (":" + $env:PORT + "\s+.*LISTENING")
    if (-not $busy) { break }
    Start-Sleep -Milliseconds 500
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js not found in PATH.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd not found in PATH.' }

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    & npm.cmd install --prefer-offline --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}

$buildCheckOutput = (& node .\scripts\needs-local-build.js 2>&1 | Out-String).Trim()
$buildCheckExit = $LASTEXITCODE
if ($buildCheckOutput) {
    Write-Host "[BUILD] $buildCheckOutput"
}
if ($buildCheckExit -eq 2) {
    Write-Host "[BUILD] Starting local production rebuild..."
    & powershell -NoProfile -ExecutionPolicy Bypass -Command "`$env:ONECLICK_LOCAL_PROD='1'; `$env:LOCAL_START_SKIP_TYPECHECK='1'; Set-Location '$projectRoot'; cmd /c .\node_modules\.bin\next.cmd build --webpack --experimental-build-mode compile"
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
    & node .\scripts\needs-local-build.js --write
    if ($LASTEXITCODE -ne 0) { throw 'Failed to write build fingerprint.' }
    Write-Host "[BUILD] Rebuild finished."
} elseif ($buildCheckExit -ne 0) {
    throw 'Build status check failed.'
} elseif (-not (Test-Path (Join-Path $projectRoot '.next\local-build-fingerprint.json'))) {
    & node .\scripts\needs-local-build.js --write
    if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize build fingerprint.' }
}

if (Test-Path $prodLog) { Remove-Item $prodLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $prodErr) { Remove-Item $prodErr -Force -ErrorAction SilentlyContinue }

& powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\launch-local-prod-hidden.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Hidden production launch failed.' }

$reachable = $false
$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
    try {
        Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
        $reachable = $true
        break
    } catch {
        if ($_.Exception.Response) {
            $reachable = $true
            break
        }
    }
    Start-Sleep -Seconds 2
}

if (-not $reachable) {
    throw "Local production server did not become reachable at $localUrl."
}

$buildIdPath = Join-Path $projectRoot '.next\BUILD_ID'
$currentBuildId = if (Test-Path $buildIdPath) { (Get-Content $buildIdPath -Raw).Trim() } else { '<missing>' }
Write-Host "[READY] URL: $localUrl"
Write-Host "[READY] BUILD_ID: $currentBuildId"

if ($env:ONECLICK_SKIP_BROWSER_OPEN -ne '1') {
    try {
        Start-Process -FilePath 'explorer.exe' -ArgumentList $localUrl | Out-Null
    } catch {
        Write-Host "[INFO] Browser auto-open skipped. Open this URL manually: $localUrl"
    }
} else {
    Write-Host "[INFO] Browser auto-open skipped by ONECLICK_SKIP_BROWSER_OPEN. URL: $localUrl"
}

