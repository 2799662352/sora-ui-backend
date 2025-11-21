# ╔══════════════════════════════════════════════════════════════╗
# ║  🚀 Sora UI Backend - 一键部署到生产环境                    ║
# ║  自动打包、上传、配置、部署                                  ║
# ╚══════════════════════════════════════════════════════════════╝

Clear-Host

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🚀 Sora UI Backend - 生产环境部署                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============ 配置信息 ============

$SERVER_IP = "175.27.250.155"
$SERVER_USER = "root"
$SERVER_PATH = "/opt/sora-ui-deploy/sora-backend"
$LOCAL_PATH = $PSScriptRoot
$ARCHIVE_NAME = "sora-backend-production.tar.gz"

# ============ Step 1: 清理和准备 ============

Write-Host "[1/7] 清理旧文件..." -ForegroundColor Yellow

# 删除旧的打包文件
if (Test-Path $ARCHIVE_NAME) {
    Remove-Item $ARCHIVE_NAME -Force
    Write-Host "   ✓ 已删除旧的打包文件" -ForegroundColor Green
}

# 清理 node_modules 和 dist
if (Test-Path "node_modules") {
    Write-Host "   ⏳ 清理 node_modules（可能需要1-2分钟）..." -ForegroundColor Gray
    Remove-Item "node_modules" -Recurse -Force
}

if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "   ✓ 已清理 dist 目录" -ForegroundColor Green
}

Write-Host "   ✅ 清理完成" -ForegroundColor Green
Write-Host ""

# ============ Step 2: 安装生产依赖 ============

Write-Host "[2/7] 安装生产依赖..." -ForegroundColor Yellow
Write-Host "   ⏳ 正在安装（需要2-3分钟）..." -ForegroundColor Gray

npm install --production 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "   ❌ 依赖安装失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============ Step 3: 编译 TypeScript ============

Write-Host "[3/7] 编译 TypeScript..." -ForegroundColor Yellow

# 临时安装 devDependencies
npm install --only=dev 2>&1 | Out-Null
npm run build 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0 -and (Test-Path "dist")) {
    Write-Host "   ✅ 编译成功" -ForegroundColor Green
} else {
    Write-Host "   ❌ 编译失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============ Step 4: 打包文件 ============

Write-Host "[4/7] 打包项目文件..." -ForegroundColor Yellow

# 使用 tar 打包（需要 Git for Windows 或 WSL）
$filesToPack = @(
    "dist",
    "node_modules",
    "prisma",
    "package.json",
    "package-lock.json"
)

# 检查是否有 tar 命令
try {
    $tarVersion = tar --version 2>&1
    
    # 创建打包命令
    $packCommand = "tar -czf $ARCHIVE_NAME " + ($filesToPack -join " ")
    
    Invoke-Expression $packCommand
    
    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item $ARCHIVE_NAME).Length / 1MB
        Write-Host "   ✅ 打包完成: $ARCHIVE_NAME ($('{0:N2}' -f $size) MB)" -ForegroundColor Green
    } else {
        throw "打包失败"
    }
} catch {
    Write-Host "   ❌ 打包失败: $_" -ForegroundColor Red
    Write-Host "   💡 请确保已安装 Git for Windows (包含 tar 命令)" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# ============ Step 5: 上传到服务器 ============

Write-Host "[5/7] 上传到服务器..." -ForegroundColor Yellow
Write-Host "   服务器: $SERVER_USER@$SERVER_IP" -ForegroundColor Cyan
Write-Host "   目标路径: $SERVER_PATH" -ForegroundColor Cyan
Write-Host "   ⏳ 上传中（需要1-2分钟）..." -ForegroundColor Gray

# 使用 SCP 上传
scp -o StrictHostKeyChecking=no $ARCHIVE_NAME ${SERVER_USER}@${SERVER_IP}:/tmp/

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 上传成功" -ForegroundColor Green
} else {
    Write-Host "   ❌ 上传失败" -ForegroundColor Red
    Write-Host "   💡 请检查：" -ForegroundColor Yellow
    Write-Host "      1. SSH密钥是否正确配置" -ForegroundColor Gray
    Write-Host "      2. 服务器是否可访问" -ForegroundColor Gray
    Write-Host "      3. 网络连接是否正常" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# ============ Step 6: 服务器端部署 ============

Write-Host "[6/7] 在服务器上部署..." -ForegroundColor Yellow

$deployScript = @"
#!/bin/bash
set -e

echo '   [6.1/6.4] 创建部署目录...'
mkdir -p $SERVER_PATH
cd $SERVER_PATH

echo '   [6.2/6.4] 备份旧版本...'
if [ -d 'dist' ]; then
    mv dist dist.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
fi

echo '   [6.3/6.4] 解压新版本...'
tar -xzf /tmp/$ARCHIVE_NAME -C $SERVER_PATH

echo '   [6.4/6.4] 设置权限...'
chmod +x dist/app.js

echo '   ✅ 部署完成'
"@

# 执行部署脚本
$deployScript | ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "bash -s"

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 服务器部署完成" -ForegroundColor Green
} else {
    Write-Host "   ❌ 部署失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============ Step 7: 配置环境变量 ============

Write-Host "[7/7] 配置生产环境..." -ForegroundColor Yellow

$envContent = @"
# Sora UI Backend - 生产环境配置
NODE_ENV=production
PORT=3001

# JWT 配置
JWT_SECRET=\$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

# 数据库配置
DATABASE_URL=postgresql://sorauser:sora123456@postgres:5432/soraui

# CORS 配置
CORS_ORIGIN=*

# 日志配置
LOG_LEVEL=info
"@

# 上传环境变量文件
$envContent | ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "cat > $SERVER_PATH/.env"

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 环境变量配置完成" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  环境变量配置失败，请手动配置" -ForegroundColor Yellow
}
Write-Host ""

# ============ Step 8: 重启服务 ============

Write-Host "[8/7] 重启后端服务..." -ForegroundColor Yellow

$restartScript = @"
#!/bin/bash
cd /opt/sora-ui-deploy

# 停止并重建 API 容器
docker compose stop api
docker compose rm -f api
docker compose up -d api

# 等待服务启动
echo '   ⏳ 等待服务启动...'
sleep 5

# 检查服务状态
docker compose ps api
docker compose logs --tail=20 api
"@

$restartScript | ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "bash -s"

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 服务重启完成" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  服务重启可能有问题，请检查日志" -ForegroundColor Yellow
}
Write-Host ""

# ============ 部署完成 ============

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   🎉 部署成功！                                        ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 生产环境地址：" -ForegroundColor Cyan
Write-Host "   https://api.zuo2799662352.xyz" -ForegroundColor White
Write-Host ""
Write-Host "🧪 测试命令：" -ForegroundColor Cyan
Write-Host '   Invoke-RestMethod -Uri "https://api.zuo2799662352.xyz/health"' -ForegroundColor White
Write-Host ""
Write-Host "📋 查看日志：" -ForegroundColor Cyan
Write-Host "   ssh $SERVER_USER@$SERVER_IP 'cd /opt/sora-ui-deploy && docker compose logs -f api'" -ForegroundColor White
Write-Host ""
Write-Host "🔧 手动重启：" -ForegroundColor Cyan
Write-Host "   ssh $SERVER_USER@$SERVER_IP 'cd /opt/sora-ui-deploy && docker compose restart api'" -ForegroundColor White
Write-Host ""

# 清理临时文件
Write-Host "🧹 清理本地临时文件..." -ForegroundColor Gray
if (Test-Path $ARCHIVE_NAME) {
    Remove-Item $ARCHIVE_NAME -Force
}
Write-Host "   ✅ 清理完成" -ForegroundColor Green
Write-Host ""

Write-Host "💡 下一步建议：" -ForegroundColor Yellow
Write-Host "   1. 运行测试脚本: .\test-production-api.ps1" -ForegroundColor Gray
Write-Host "   2. 检查API日志确认无错误" -ForegroundColor Gray
Write-Host "   3. 测试客户端连接" -ForegroundColor Gray
Write-Host ""

