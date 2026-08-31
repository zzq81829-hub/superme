$ErrorActionPreference = "Stop"

$hermesExe = Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe"
if (-not (Test-Path -LiteralPath $hermesExe)) {
  throw "Hermes Desktop is not built: $hermesExe"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Hermes Desktop.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $hermesExe
$shortcut.WorkingDirectory = Split-Path -Parent $hermesExe
$shortcut.Description = "Hermes 原生桌面客户端"
$shortcut.IconLocation = "$hermesExe,0"
$shortcut.Save()

Write-Output $shortcutPath
