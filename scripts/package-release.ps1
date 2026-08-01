# Builds a self-contained RinkScreens release package for deployment on the
# rink's PC. Runs tests, builds the admin client, stages a minimal production
# copy of the app (server + built client + prod-only node_modules), and zips
# it with an installer batch file and instructions.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json | ConvertFrom-Json).version
$pkgName = "rinkscreens-v$version"
$releaseDir = Join-Path $root "release"
$stageDir = Join-Path $releaseDir $pkgName
$zipPath = Join-Path $releaseDir "$pkgName.zip"

Write-Host "==> Packaging RinkScreens v$version" -ForegroundColor Cyan

Write-Host "--> Running tests" -ForegroundColor Cyan
npx vitest run
if ($LASTEXITCODE -ne 0) { throw "Tests failed - fix before packaging a release." }

Write-Host "--> Building admin client" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Client build failed." }

Write-Host "--> Staging release folder" -ForegroundColor Cyan
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item "$root\server" "$stageDir\server" -Recurse
Copy-Item "$root\client\dist" "$stageDir\client\dist" -Recurse
Copy-Item "$root\package.json" "$stageDir\package.json"
Copy-Item "$root\package-lock.json" "$stageDir\package-lock.json"
Copy-Item "$root\README.md" "$stageDir\README.md"
Copy-Item "$root\CHANGELOG.md" "$stageDir\CHANGELOG.md"
Copy-Item "$root\data" "$stageDir\data" -Recurse
Copy-Item "$root\uploads" "$stageDir\uploads" -Recurse

Write-Host "--> Installing production dependencies into the release copy" -ForegroundColor Cyan
Push-Location $stageDir
npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed in the release copy." }
Pop-Location

Copy-Item "$PSScriptRoot\release-assets\start-rinkscreens.bat" "$stageDir\start-rinkscreens.bat"
Copy-Item "$PSScriptRoot\release-assets\install-autostart.bat" "$stageDir\install-autostart.bat"
Copy-Item "$PSScriptRoot\release-assets\uninstall-autostart.bat" "$stageDir\uninstall-autostart.bat"
Copy-Item "$PSScriptRoot\release-assets\run-hidden.vbs" "$stageDir\run-hidden.vbs"
Copy-Item "$PSScriptRoot\release-assets\INSTALL.md" "$stageDir\INSTALL.md"
New-Item -ItemType Directory -Path "$stageDir\scripts\release-assets" -Force | Out-Null
Copy-Item "$PSScriptRoot\release-assets\apply-update.ps1" "$stageDir\scripts\release-assets\apply-update.ps1"

Write-Host "--> Zipping" -ForegroundColor Cyan
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath

Write-Host "==> Done: $zipPath" -ForegroundColor Green
Write-Host "    Unzip on the rink PC and follow INSTALL.md." -ForegroundColor Green
