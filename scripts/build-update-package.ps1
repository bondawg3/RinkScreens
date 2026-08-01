# Builds a code-only update package for the self-updater (server/update.js).
# Unlike package-release.ps1 (used for the initial install), this NEVER
# includes data/ or uploads/, so the rink PC's live data can never be
# clobbered by an auto-update.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\build-update-package.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json | ConvertFrom-Json).version
$releaseDir = Join-Path $root "release"
$stageDir = Join-Path $releaseDir "update-stage"
$zipPath = Join-Path $releaseDir "rinkscreens-update.zip"

Write-Host "==> Building update package for v$version" -ForegroundColor Cyan

Write-Host "--> Running tests" -ForegroundColor Cyan
npx vitest run
if ($LASTEXITCODE -ne 0) { throw "Tests failed - fix before building an update package." }

Write-Host "--> Building admin client" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Client build failed." }

Write-Host "--> Staging update package (code only, no data/uploads)" -ForegroundColor Cyan
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item "$root\server" "$stageDir\server" -Recurse
Copy-Item "$root\client\dist" "$stageDir\client\dist" -Recurse
Copy-Item "$root\package.json" "$stageDir\package.json"
Copy-Item "$root\package-lock.json" "$stageDir\package-lock.json"
Copy-Item "$root\README.md" "$stageDir\README.md"
Copy-Item "$root\CHANGELOG.md" "$stageDir\CHANGELOG.md"

Write-Host "--> Installing production dependencies into the staged package" -ForegroundColor Cyan
Push-Location $stageDir
npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed in the staged package." }
Pop-Location

Write-Host "--> Zipping" -ForegroundColor Cyan
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath

Write-Host "==> Done: $zipPath" -ForegroundColor Green
