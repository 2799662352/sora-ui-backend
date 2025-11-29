###########################################
# 🚀 一键拉取 Docker Hub 镜像部署到腾讯云
# 直接使用预构建镜像，无需服务器编译
###########################################

param(
    [string]$Version = "1.7.1-remixpro",
    [string]$ServerIP = "175.27.250.155",
    [string]$ServerUser = "ubuntu",
    [string]$DeployDir = "/opt/sora-ui-backend",
    [string]$SSHKey = ".\123456"
)

Clear-Host
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🚀 一键拉取 Docker Hub 镜像部署                          ║" -ForegroundColor Cyan
Write-Host "║  版本: zuozuoliang999/sora-ui-backend:$Version            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# SSH 命令封装
function Invoke-SSH {
    param([string]$Command)
    if (Test-Path $SSHKey) {
        ssh -i $SSHKey "$ServerUser@$ServerIP" $Command
    } else {
        ssh "$ServerUser@$ServerIP" $Command
    }
}

# ============ 步骤1: 测试连接 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤1/4: 测试服务器连接" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$testResult = Invoke-SSH "echo 'OK'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 无法连接服务器，请检查 SSH 密钥配置" -ForegroundColor Red
    Write-Host "   尝试: ssh -i .\123456 $ServerUser@$ServerIP" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ 服务器连接成功" -ForegroundColor Green
Write-Host ""

# ============ 步骤2: 拉取最新镜像 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤2/4: 拉取 Docker Hub 镜像" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$pullScript = @"
echo '⏳ 正在拉取镜像: zuozuoliang999/sora-ui-backend:$Version'
docker pull zuozuoliang999/sora-ui-backend:$Version
if [ \$? -eq 0 ]; then
    echo '✅ 镜像拉取成功'
    docker images | grep sora-ui-backend | head -5
else
    echo '❌ 镜像拉取失败'
    exit 1
fi
"@

Invoke-SSH $pullScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 镜像拉取失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============ 步骤3: 更新 docker-compose 并重启 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤3/4: 更新并重启服务" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$restartScript = @"
cd $DeployDir

# 更新 docker-compose.yml 中的镜像版本
if [ -f docker-compose.yml ]; then
    echo '⏳ 更新 docker-compose.yml 镜像版本...'
    sed -i 's|image: zuozuoliang999/sora-ui-backend:.*|image: zuozuoliang999/sora-ui-backend:$Version|g' docker-compose.yml
    
    echo '⏳ 重启 backend 服务...'
    docker-compose up -d backend
    
    echo '⏳ 等待服务启动...'
    sleep 5
    
    echo ''
    echo '📋 服务状态:'
    docker-compose ps
else
    echo '❌ 未找到 docker-compose.yml'
    echo '💡 请先完成初始部署'
    exit 1
fi
"@

Invoke-SSH $restartScript
Write-Host ""

# ============ 步骤4: 健康检查 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤4/4: 健康检查" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$healthScript = @"
echo '⏳ 等待服务完全启动...'
sleep 10

echo '🔍 检查 API 健康状态...'
curl -s http://localhost:3001/health || echo '健康检查失败'

echo ''
echo '📊 容器资源使用:'
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep sora
"@

Invoke-SSH $healthScript
Write-Host ""

# ============ 完成 ============
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  🎉 部署完成！                                            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 访问地址:" -ForegroundColor Cyan
Write-Host "   API: http://$ServerIP`:3001" -ForegroundColor White
Write-Host "   健康检查: http://$ServerIP`:3001/health" -ForegroundColor White
Write-Host ""
Write-Host "📋 管理命令:" -ForegroundColor Cyan
Write-Host "   查看日志: ssh $ServerUser@$ServerIP 'cd $DeployDir && docker-compose logs -f backend'" -ForegroundColor White
Write-Host "   重启服务: ssh $ServerUser@$ServerIP 'cd $DeployDir && docker-compose restart backend'" -ForegroundColor White
Write-Host ""

