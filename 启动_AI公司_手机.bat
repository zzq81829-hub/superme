@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 AI Founder OS 手机访问模式...
call npm run start:phone
pause
