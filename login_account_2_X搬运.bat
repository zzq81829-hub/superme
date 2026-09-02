@echo off
chcp 65001 >nul
echo [X搬运] 独立窗口启动中 (强制直连，绕过全局代理)...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%~dp0data\profiles\xhs_account_2" --new-window --no-first-run --no-default-browser-check --no-proxy-server "https://creator.xiaohongshu.com/login"
