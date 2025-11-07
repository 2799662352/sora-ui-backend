@echo off
chcp 65001 >nul
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║     🚀 腾讯云 Docker 快速部署                         ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo 📋 请按照以下步骤操作：
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤1: 在新的PowerShell窗口中执行以下命令
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo PowerShell -ExecutionPolicy Bypass -File ".\快速部署-腾讯云.ps1"
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 或者使用分步部署：
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 1. 打开 PowerShell（管理员模式）
echo 2. cd D:\tecx\text\25\soraui_4.0\sora-ui-backend
echo 3. 执行命令...
echo.
pause
start powershell -NoExit -Command "cd '%~dp0'; Write-Host '╔════════════════════════════════════════╗' -ForegroundColor Cyan; Write-Host '║  准备执行部署脚本...                 ║' -ForegroundColor Cyan; Write-Host '╚════════════════════════════════════════╝' -ForegroundColor Cyan; Write-Host ''; Write-Host '按任意键开始部署...' -ForegroundColor Yellow; pause; .\快速部署-腾讯云.ps1"

