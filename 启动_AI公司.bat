@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安装依赖，先运行 安装依赖.bat
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-founder-os.ps1"
if errorlevel 1 (
  echo AI Founder OS 启动失败，请查看 data\server-error.log
  pause
  exit /b 1
)
