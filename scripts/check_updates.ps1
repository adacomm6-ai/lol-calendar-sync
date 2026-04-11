$repo = "jlcodes99/cockpit-tools"
$versionFile = Join-Path $PSScriptRoot "cockpit_version.txt"
$installLog = Join-Path $PSScriptRoot "cockpit_install.log"

# Get current version
if (Test-Path $versionFile) {
    $currentVersion = Get-Content $versionFile
} else {
    $currentVersion = "v0.0.0"
}

Write-Host "Current Version: $currentVersion"

# Get latest release from GitHub
try {
    $latestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
    $latestVersion = $latestRelease.tag_name
    Write-Host "Latest Version: $latestVersion"

    if ($latestVersion -ne $currentVersion) {
        Write-Host "New version found: $latestVersion. Downloading..."
        
        # Find Windows setup asset
        $asset = $latestRelease.assets | Where-Object { $_.name -like "*x64-setup.exe" }
        if ($null -eq $asset) {
            $asset = $latestRelease.assets | Where-Object { $_.name -like "*.msi" }
        }

        if ($null -ne $asset) {
            $downloadUrl = $asset.browser_download_url
            $tempSetup = Join-Path $env:TEMP $asset.name
            
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempSetup
            Write-Host "Downloaded to $tempSetup. Starting installation..."
            
            # Run installer and wait
            $process = Start-Process -FilePath $tempSetup -ArgumentList "/S" -PassThru -Wait # Try silent if possible, otherwise interactive
            
            if ($process.ExitCode -eq 0) {
                Write-Host "Installation successful."
                $latestVersion | Out-File $versionFile
                "$(Get-Date): Updated to $latestVersion" | Out-File $installLog -Append
            } else {
                Write-Host "Installation failed with exit code $($process.ExitCode)."
            }
        } else {
            Write-Host "No suitable Windows asset found in release $latestVersion."
        }
    } else {
        Write-Host "Already up to date."
    }
} catch {
    Write-Host "Error checking for updates: $_"
}
