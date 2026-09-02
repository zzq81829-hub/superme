@echo off
chcp 65001 >nul
echo [书斋] 独立窗口启动中 (强制直连，绕过全局代理)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%~dp0data\profiles\xhs_account_1" --new-window --no-first-run --no-default-browser-check --no-proxy-server "https://creator.xiaohongshu.com/login"
