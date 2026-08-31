@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在安装依赖...
npm install
echo.
echo 完成。按任意键关闭。
pause >nul
