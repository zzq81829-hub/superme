$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = "http://127.0.0.1:3210"
$nodeCommand = Get-Command node -ErrorAction Stop
$dataDir = Join-Path $projectRoot "data"
$stdoutLog = Join-Path $dataDir "server.log"
$stderrLog = Join-Path $dataDir "server-error.log"

if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
}

function Test-FounderOsReady {
  try {
    $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-FounderOsReady)) {
  Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-FounderOsReady) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "AI Founder OS did not become ready. Check $stderrLog"
  }
}

$edgeCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if ($edge) {
  Start-Process -FilePath $edge -ArgumentList "--app=$appUrl"
} else {
  Start-Process $appUrl
}
