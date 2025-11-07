###########################################
# 腾讯云 Docker 快速部署脚本 (Windows版)
# 一键完成：上传代码 → 构建 → 启动 → 配置SSL
###########################################

# 配置区域
$SERVER_IP = "175.27.250.155"
$SERVER_USER = "ubuntu"
$DEPLOY_DIR = "/opt/sora-ui-deploy"
$DOMAIN_API = "api.zuo2799662352.xyz"
$DOMAIN_UPDATE = "update.zuo2799662352.xyz"
$EMAIL = "zuozuoliang999@gmail.com"

Clear-Host
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 腾讯云 Docker 快速部署脚本 (Windows)          ║" -ForegroundColor Cyan
Write-Host "║     Sora UI Backend 一键部署                           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============ 步骤1: 检查环境 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤1/6: 检查本地环境" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

# 检查必要文件
if (-not (Test-Path "package.json")) {
    Write-Host "❌ 错误：未找到 package.json，请在项目根目录执行此脚本" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "Dockerfile")) {
    Write-Host "❌ 错误：未找到 Dockerfile" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 本地环境检查通过" -ForegroundColor Green
Write-Host ""

# ============ 步骤2: 测试服务器连接 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤2/6: 测试服务器连接" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

try {
    $testConnection = ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER_IP" "echo 'OK'" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 服务器连接正常" -ForegroundColor Green
    } else {
        throw "连接失败"
    }
} catch {
    Write-Host "❌ 错误：无法连接到服务器 $SERVER_IP" -ForegroundColor Red
    Write-Host "💡 请检查：" -ForegroundColor Yellow
    Write-Host "   1. 服务器IP是否正确"
    Write-Host "   2. SSH密钥是否配置"
    Write-Host "   3. 安全组是否开放22端口"
    exit 1
}
Write-Host ""

# ============ 步骤3: 准备部署目录 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤3/6: 准备服务器部署目录" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$prepareScript = @"
# 创建部署目录
sudo mkdir -p $DEPLOY_DIR/{backend,nginx/conf.d,certbot/{conf,www},logs,updates,postgres-data}
sudo chown -R ubuntu:ubuntu $DEPLOY_DIR

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo '⏳ 正在安装 Docker...'
    curl -fsSL https://get.docker.com | sh
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ubuntu
fi

# 检查Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo '⏳ 正在安装 Docker Compose...'
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-`$(uname -s)-`$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

echo '✅ 服务器环境准备完成'
"@

ssh "$SERVER_USER@$SERVER_IP" $prepareScript

Write-Host "✅ 服务器部署目录已准备" -ForegroundColor Green
Write-Host ""

# ============ 步骤4: 上传项目文件 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤4/6: 上传项目文件到服务器" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

Write-Host "⏳ 正在上传项目文件..." -ForegroundColor Yellow

# 使用 scp 上传（排除不需要的文件）
$excludePatterns = @(
    "node_modules",
    ".git",
    "dist",
    "build",
    ".env.local",
    "logs"
)

# 创建临时目录
$tempDir = New-Item -ItemType Directory -Path "$env:TEMP\sora-deploy-$(Get-Random)" -Force

# 复制文件（排除指定模式）
Get-ChildItem -Path "." -Recurse | Where-Object {
    $item = $_
    -not ($excludePatterns | Where-Object { $item.FullName -like "*$_*" })
} | ForEach-Object {
    $targetPath = $_.FullName.Replace($PWD.Path, $tempDir.FullName)
    $targetDir = Split-Path -Parent $targetPath
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item $_.FullName $targetPath -Force
}

# 上传到服务器
scp -r "$tempDir\*" "$SERVER_USER@${SERVER_IP}:$DEPLOY_DIR/backend/"

# 清理临时目录
Remove-Item -Recurse -Force $tempDir

Write-Host "✅ 项目文件上传完成" -ForegroundColor Green
Write-Host ""

# ============ 步骤5: 配置Docker Compose ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤5/6: 配置 Docker Compose" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$dockerComposeContent = @'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: sora-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=sorauser
      - POSTGRES_PASSWORD=sora_secure_pass_2024
      - POSTGRES_DB=sora_ui
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - sora-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sorauser -d sora_ui"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: sora-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=sorauser
      - DB_PASSWORD=sora_secure_pass_2024
      - DB_NAME=sora_ui
      - JWT_SECRET=your-super-secure-jwt-secret-key-2024
      - LICENSE_SECRET=your-super-secure-license-key-2024
    volumes:
      - ./updates:/app/updates
      - ./logs:/app/logs
    networks:
      - sora-network
    depends_on:
      postgres:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    container_name: sora-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./updates:/usr/share/nginx/html/updates:ro
    networks:
      - sora-network
    depends_on:
      - api

networks:
  sora-network:
    driver: bridge
'@

# 上传配置文件
$dockerComposeContent | ssh "$SERVER_USER@$SERVER_IP" "cat > $DEPLOY_DIR/docker-compose.yml"

Write-Host "✅ Docker Compose 配置完成" -ForegroundColor Green
Write-Host ""

# ============ 步骤6: 启动服务 ============
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "📋 步骤6/6: 启动服务" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$startScript = @"
cd $DEPLOY_DIR
docker-compose up -d postgres
sleep 10
docker-compose up -d --build api
sleep 10
docker-compose up -d nginx
sleep 5
docker-compose ps
"@

ssh "$SERVER_USER@$SERVER_IP" $startScript

Write-Host "✅ 服务启动完成" -ForegroundColor Green
Write-Host ""

# ============ 完成 ============
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     🎉 部署完成！                                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 访问地址：" -ForegroundColor Cyan
Write-Host "   HTTP:  http://$DOMAIN_API" -ForegroundColor White
Write-Host "   HTTPS: https://$DOMAIN_API (需配置SSL)" -ForegroundColor White
Write-Host ""
Write-Host "🧪 测试命令：" -ForegroundColor Cyan
Write-Host "   Invoke-RestMethod -Uri http://$DOMAIN_API/health" -ForegroundColor White
Write-Host ""
Write-Host "📋 查看日志：" -ForegroundColor Cyan
Write-Host "   ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_DIR && docker-compose logs -f api'" -ForegroundColor White
Write-Host ""



































