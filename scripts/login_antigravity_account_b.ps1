# ==========================================
# Antigravity 账号 B 独立登录脚本
# ==========================================
$accountBDir = "C:\Users\22145\.antigravity_account_b"
if (!(Test-Path $accountBDir)) {
    New-Item -ItemType Directory -Path $accountBDir -Force | Out-Null
}

$env:USERPROFILE = $accountBDir
$env:HOME = $accountBDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  正在启动 Antigravity 账号 B 独立登录环境..." -ForegroundColor Yellow
Write-Host "  存储路径: $accountBDir" -ForegroundColor Gray
Write-Host "  提示: 浏览器弹出后，请登录您的【第二个 Google 账号】并完成授权。" -ForegroundColor Green
Write-Host "  授权成功进入命令行后，输入 /exit 退出即可。" -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan

agy
