@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安装依赖，先运行 安装依赖.bat
  pause
  exit /b 1
)
start "" http://localhost:3210
npm start
pause
