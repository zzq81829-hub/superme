param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$port = (& $nodePath --input-type=module -e "import {loadConfig} from './src/config.js'; console.log(loadConfig().port)").Trim()
$workspaceUrl = "http://127.0.0.1:$port"

function Test-Workspace {
  try {
    $health = Invoke-RestMethod -Uri "$workspaceUrl/api/health" -TimeoutSec 5
    return $health.ok -eq $true -and $health.controlPlane -eq 'local'
  } catch { return $false }
}

if (-not (Test-Workspace)) {
  $logDirectory = Join-Path $workspaceRoot 'outputs/os-audit'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  # Keep existing work and trash records during normal desktop startup.
  $env:AI_FOUNDER_OS_RETENTION_ENABLED = 'false'
  $process = Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $workspaceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'service-output.txt') -RedirectStandardError (Join-Path $logDirectory 'service-error.txt')
  $connected = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-Workspace) { $connected = $true; break }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $connected) { throw "Founder OS could not start. Check outputs/os-audit/service-error.txt." }
}
if ($NoLaunch) { Write-Output $workspaceUrl; exit 0 }
$edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (Test-Path -LiteralPath $edgePath) {
  Start-Process -FilePath $edgePath -ArgumentList "--app=$workspaceUrl"
} else {
  Start-Process $workspaceUrl
}
