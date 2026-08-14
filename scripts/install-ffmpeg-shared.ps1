<#
Installs a "shared" FFmpeg build (with separate avcodec/avformat/avutil... DLLs) into
%LOCALAPPDATA%\ffmpeg-shared and adds it to the User PATH.

Needed for torchcodec (used by torchaudio.load() in src/tts/worker.py) - torchcodec loads
those DLLs itself via ctypes, it does not shell out to ffmpeg.exe. A "static" FFmpeg build
(just .exe files, no separate DLLs - e.g. the winget Gyan.FFmpeg package) is not enough.

Usage:
  powershell -ExecutionPolicy Bypass -File scripts\install-ffmpeg-shared.ps1

This script does not touch any static FFmpeg already installed - it only appends the new
bin folder to the END of PATH, so typing `ffmpeg` still resolves to the old build; only
torchcodec ends up finding the new DLLs.

After running: fully close and reopen VSCode / your terminal to pick up the new PATH.
Opening a new terminal TAB inside the same VSCode window is NOT enough - it inherits the
PATH that was cached when VSCode itself started.
#>

$ErrorActionPreference = "Stop"

$destRoot = "$env:LOCALAPPDATA\ffmpeg-shared"
$zipUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip"
$zipPath = "$env:TEMP\ffmpeg-shared.zip"

function Find-BinDir($root) {
    if (-not (Test-Path $root)) { return $null }
    $ffmpegExe = Get-ChildItem -Path $root -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ffmpegExe) { return $ffmpegExe.DirectoryName }
    return $null
}

function Has-AvcodecDll($dir) {
    if (-not $dir) { return $false }
    return [bool](Get-ChildItem -Path $dir -Filter "avcodec-*.dll" -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$binDir = Find-BinDir $destRoot

if (Has-AvcodecDll $binDir) {
    Write-Host "FFmpeg shared build already present at: $binDir"
} else {
    Write-Host "Downloading FFmpeg shared build (BtbN, ~70-80MB)..."
    New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

    Write-Host "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $destRoot -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

    $binDir = Find-BinDir $destRoot
    if (-not $binDir) {
        throw "Could not find ffmpeg.exe after extraction - the build's folder layout may have changed."
    }
    Write-Host "Installed to: $binDir"
}

if (-not (Has-AvcodecDll $binDir)) {
    throw "Folder $binDir has no avcodec-*.dll - not a valid shared build."
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = $userPath -split ";" | Where-Object { $_ }

if ($pathEntries -contains $binDir) {
    Write-Host "Already on User PATH, nothing to add."
} else {
    $newPath = ($pathEntries + $binDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "Added to User PATH: $binDir"
}

# Also update the current session's PATH so you can test immediately without a new terminal.
if (($env:PATH -split ";") -notcontains $binDir) {
    $env:PATH = "$env:PATH;$binDir"
}

Write-Host ""
Write-Host "Verify:" -ForegroundColor Cyan
& (Join-Path $binDir "ffmpeg.exe") -version | Select-Object -First 1

Write-Host ""
Write-Host "DONE. Fully close and reopen VSCode/your terminal so other processes pick up the new PATH." -ForegroundColor Green
