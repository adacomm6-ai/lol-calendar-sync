$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nodePath = (Get-Command node -ErrorAction Stop).Source
$scriptPath = Join-Path $projectRoot 'scripts\start-local-prod.js'
$logDir = Join-Path $projectRoot 'logs'
$pidFile = Join-Path $logDir '.local-prod.pid'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodePath
$psi.Arguments = '"' + $scriptPath + '"'
$psi.WorkingDirectory = $projectRoot
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

$process = [System.Diagnostics.Process]::Start($psi)
if (-not $process) {
    throw 'Failed to start hidden local production process.'
}

[System.IO.File]::WriteAllText($pidFile, [string]$process.Id)
