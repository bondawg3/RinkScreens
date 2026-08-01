# Applies a downloaded RinkScreens update in place, then restarts the app.
# Run detached by server/update.js so it can safely overwrite the running
# app's files after the Node process exits. Never touches data/ or uploads/
# since those directories are not part of the update zip.
#
# Params:
#   -ZipPath    Path to the downloaded rinkscreens-update.zip
#   -AppDir     RinkScreens install directory (e.g. C:\RinkScreens)
#   -ParentPid  PID of the Node process to wait for before copying files
#   -LogPath    Where to write progress/errors for troubleshooting

param(
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [Parameter(Mandatory = $true)][string]$LogPath
)

function Log($msg) {
  "$(Get-Date -Format o)  $msg" | Out-File -FilePath $LogPath -Append -Encoding utf8
}

try {
  Log "Waiting for RinkScreens process (PID $ParentPid) to exit..."
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  # Give the OS a moment to release file handles even after the process exits
  Start-Sleep -Seconds 1

  $stageDir = Join-Path (Split-Path -Parent $ZipPath) "staged"
  Log "Extracting $ZipPath to $stageDir"
  Expand-Archive -Path $ZipPath -DestinationPath $stageDir -Force

  Log "Copying updated files into $AppDir (data/ and uploads/ are excluded from the update package, so they are never touched)"
  robocopy $stageDir $AppDir /E /NFL /NDL /NJH /NJS /NC /NS | Out-File -FilePath $LogPath -Append -Encoding utf8
  # robocopy exit codes 0-7 are success; 8+ indicate a real failure
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

  Log "Restarting RinkScreens..."
  $vbs = Join-Path $AppDir "run-hidden.vbs"
  if (Test-Path $vbs) {
    Start-Process "wscript.exe" -ArgumentList "`"$vbs`"" -WindowStyle Hidden
  } else {
    Start-Process "$AppDir\start-rinkscreens.bat" -WindowStyle Hidden
  }

  Log "Update applied successfully."
  Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $stageDir -Recurse -Force -ErrorAction SilentlyContinue
} catch {
  Log "ERROR: $($_.Exception.Message)"
}
