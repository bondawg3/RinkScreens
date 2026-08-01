# Builds the update package (scripts/build-update-package.ps1) and publishes
# it as a GitHub Release tagged with the current package.json version, so
# the rink PC's self-updater (Settings > Updates) can find it. Requires the
# GitHub CLI (`gh`), already authenticated.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\publish-release.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json | ConvertFrom-Json).version
$tag = "v$version"
$zipPath = Join-Path $root "release\rinkscreens-update.zip"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) not found. Install it from https://cli.github.com/ and run 'gh auth login' first."
}

Write-Host "==> Building update package for $tag" -ForegroundColor Cyan
& "$PSScriptRoot\build-update-package.ps1"

# Pull this version's changelog section as release notes, if present
$notes = ""
if (Test-Path "$root\CHANGELOG.md") {
  $lines = Get-Content "$root\CHANGELOG.md"
  $capture = $false
  $notesLines = @()
  foreach ($line in $lines) {
    if ($line -match "^## \[$([regex]::Escape($version))\]") { $capture = $true; continue }
    if ($capture -and $line -match "^## \[") { break }
    if ($capture) { $notesLines += $line }
  }
  $notes = ($notesLines -join "`n").Trim()
}
if (-not $notes) { $notes = "RinkScreens $tag" }

# Write notes to a file and use --notes-file instead of passing the raw text
# as a command-line argument — changelog entries contain markdown (**bold**,
# parens, quotes) that native-argument quoting/globbing can mangle depending
# on what invokes gh, which is exactly what happened here.
$notesFile = Join-Path $root "release\release-notes.txt"
Set-Content -Path $notesFile -Value $notes -Encoding utf8 -NoNewline

# "release not found" is expected on a repo's first-ever release; under
# $ErrorActionPreference = "Stop", a native command's stderr output becomes
# a terminating error even when redirected to $null, so this has to be
# caught explicitly instead of just checking $LASTEXITCODE afterward.
try {
  $existingRelease = gh release view $tag 2>$null
} catch {
  $existingRelease = $null
}
if ($LASTEXITCODE -eq 0) {
  Write-Host "==> Release $tag already exists, uploading updated asset" -ForegroundColor Cyan
  gh release upload $tag $zipPath --clobber
} else {
  Write-Host "==> Creating release $tag" -ForegroundColor Cyan
  gh release create $tag $zipPath --title $tag --notes-file $notesFile
}
$ghExitCode = $LASTEXITCODE
Remove-Item $notesFile -ErrorAction SilentlyContinue
if ($ghExitCode -ne 0) { throw "gh release command failed." }

Write-Host "==> Published $tag to GitHub Releases" -ForegroundColor Green
