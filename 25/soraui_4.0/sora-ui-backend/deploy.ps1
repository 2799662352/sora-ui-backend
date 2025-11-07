# deploy.ps1
# Sora UI Backend 生产部署脚本

Write-Host ''
Write-Host '╔════════════════════════════════════════╗' -ForegroundColor Green
Write-Host '║                                        ║' -ForegroundColor Green
Write-Host '║  🚀 Sora UI Backend 生产部署           ║' -ForegroundColor Green
Write-Host '║                                        ║' -ForegroundColor Green
Write-Host '╚════════════════════════════════════════╝' -ForegroundColor Green
Write-Host ''

# ============ 配置信息 ============

$SERVER_IP = "175.27.250.155"
$SERVER_USER = "root"
$SERVER_DIR = "/root/sora-backend"
$BACKUP_DIR = "/root/sora-backend-backup"
$DEPLOY_PACKAGE = "sora-backend-$(Get-Date -Format 'yyyyMMdd-HHmmss').tar.gz"

Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host '  📋 部署配置' -ForegroundColor Cyan
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host ''
Write-Host "   服务器: $SERVER_IP" -ForegroundColor White
Write-Host "   用户: $SERVER_USER" -ForegroundColor White
Write-Host "   目标目录: $SERVER_DIR" -ForegroundColor White
Write-Host "   部署包: $DEPLOY_PACKAGE" -ForegroundColor White
Write-Host ''

# ============ 步骤1：打包本地代码 ============

Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host '  📦 步骤1：打包本地代码' -ForegroundColor Yellow
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host ''

Write-Host '清理旧的部署包...' -ForegroundColor Gray
Remove-Item -Path "*.tar.gz" -Force -ErrorAction SilentlyContinue
Write-Host '✅ 清理完成' -ForegroundColor Green
Write-Host ''

Write-Host '创建临时目录...' -ForegroundColor Gray
$TempDir = Join-Path $env:TEMP "sora-backend-deploy"
if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempDir | Out-Null
Write-Host "✅ 临时目录: $TempDir" -ForegroundColor Green
Write-Host ''

Write-Host '复制源代码（排除 node_modules 和 dist）...' -ForegroundColor Gray
$CopyItems = @(
    'src',
    'prisma',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.env.production'
)

foreach ($item in $CopyItems) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $TempDir -Recurse -Force
        Write-Host "   ✅ $item" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $item (不存在，跳过)" -ForegroundColor Yellow
    }
}
Write-Host ''

Write-Host '创建 tar.gz 压缩包...' -ForegroundColor Gray
# 使用 Windows 的 tar 命令（Windows 10 1809+）
cd $TempDir
tar -czf "$PSScriptRoot\$DEPLOY_PACKAGE" .
cd $PSScriptRoot

if (Test-Path $DEPLOY_PACKAGE) {
    $size = (Get-Item $DEPLOY_PACKAGE).Length / 1MB
    Write-Host "✅ 部署包创建成功: $DEPLOY_PACKAGE ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host '❌ 部署包创建失败！' -ForegroundColor Red
    exit 1
}

# 清理临时目录
Remove-Item -Path $TempDir -Recurse -Force
Write-Host ''

# ============ 步骤2：上传到服务器 ============

Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host '  📤 步骤2：上传到服务器' -ForegroundColor Yellow
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host ''

Write-Host '上传部署包...' -ForegroundColor Gray
Write-Host "   使用 SCP 上传到 ${SERVER_USER}@${SERVER_IP}:/tmp/$DEPLOY_PACKAGE" -ForegroundColor Cyan
Write-Host ''
Write-Host '⚠️  请输入服务器密码：' -ForegroundColor Yellow

# 使用 SCP 上传（需要安装 OpenSSH）
scp $DEPLOY_PACKAGE "${SERVER_USER}@${SERVER_IP}:/tmp/"

if ($LASTEXITCODE -eq 0) {
    Write-Host '✅ 上传成功！' -ForegroundColor Green
} else {
    Write-Host '❌ 上传失败！请检查：' -ForegroundColor Red
    Write-Host '   1. 是否安装了 OpenSSH？' -ForegroundColor Yellow
    Write-Host '   2. 服务器密码是否正确？' -ForegroundColor Yellow
    Write-Host '   3. 服务器是否可以访问？' -ForegroundColor Yellow
    exit 1
}
Write-Host ''

# ============ 步骤3：部署到服务器 ============

Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host '  🚀 步骤3：在服务器上部署' -ForegroundColor Yellow
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Yellow
Write-Host ''

Write-Host '连接到服务器执行部署...' -ForegroundColor Gray
Write-Host "   SSH: ${SERVER_USER}@${SERVER_IP}" -ForegroundColor Cyan
Write-Host ''

# SSH 部署命令
$DeployCommands = @"
echo '';
echo '╔════════════════════════════════════════╗';
echo '║  🚀 开始部署后端代码                   ║';
echo '╚════════════════════════════════════════╝';
echo '';

# 1. 备份现有代码
echo '[1/6] 备份现有代码...';
if [ -d "$SERVER_DIR" ]; then
    TIMESTAMP=\$(date +%Y%m%d_%H%M%S);
    BACKUP_PATH="$BACKUP_DIR/backup_\${TIMESTAMP}";
    mkdir -p $BACKUP_DIR;
    cp -r $SERVER_DIR \$BACKUP_PATH;
    echo "✅ 备份到: \$BACKUP_PATH";
else
    echo "⚠️  首次部署，无需备份";
fi
echo '';

# 2. 停止现有服务
echo '[2/6] 停止现有服务...';
if docker ps | grep -q sora-backend; then
    docker stop sora-backend;
    docker rm sora-backend;
    echo '✅ 服务已停止';
else
    echo '⚠️  服务未运行';
fi
echo '';

# 3. 创建目录
echo '[3/6] 准备部署目录...';
mkdir -p $SERVER_DIR;
cd $SERVER_DIR;
rm -rf *;
echo '✅ 目录准备完成';
echo '';

# 4. 解压代码
echo '[4/6] 解压部署包...';
tar -xzf /tmp/$DEPLOY_PACKAGE -C $SERVER_DIR;
echo '✅ 解压完成';
echo '';

# 5. 构建 Docker 镜像
echo '[5/6] 构建 Docker 镜像...';
cat > Dockerfile << 'DOCKERFILE'
FROM node:18-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["node", "dist/app.js"]
DOCKERFILE

docker build -t sora-backend:latest .;
echo '✅ 镜像构建完成';
echo '';

# 6. 启动服务
echo '[6/6] 启动服务...';
docker run -d \
  --name sora-backend \
  --network sora-network \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://soraui:soraui@sora-postgres:5432/soraui?schema=public" \
  -e NODE_ENV="production" \
  --restart always \
  sora-backend:latest;

echo '✅ 服务启动成功';
echo '';

# 等待服务启动
echo '⏳ 等待服务启动...';
sleep 5;

# 检查服务状态
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
echo '  📊 部署结果验证';
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
echo '';

if docker ps | grep -q sora-backend; then
    echo '✅ 容器运行正常';
    docker ps | grep sora-backend;
else
    echo '❌ 容器启动失败！';
    docker logs sora-backend;
    exit 1;
fi

echo '';
echo '测试 API...';
if curl -s http://localhost:3001/health > /dev/null; then
    echo '✅ API 响应正常';
else
    echo '❌ API 无响应';
fi

echo '';
echo '╔════════════════════════════════════════╗';
echo '║  ✅ 部署完成！                         ║';
echo '╚════════════════════════════════════════╝';
"@

# 执行 SSH 命令
ssh "${SERVER_USER}@${SERVER_IP}" $DeployCommands

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host '╔════════════════════════════════════════╗' -ForegroundColor Green
    Write-Host '║                                        ║' -ForegroundColor Green
    Write-Host '║  🎉 部署成功！                         ║' -ForegroundColor Green
    Write-Host '║                                        ║' -ForegroundColor Green
    Write-Host '╚════════════════════════════════════════╝' -ForegroundColor Green
    Write-Host ''
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
    Write-Host '  🌐 访问地址' -ForegroundColor Cyan
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
    Write-Host ''
    Write-Host "   HTTPS: https://api.zuo2799662352.xyz/health" -ForegroundColor White
    Write-Host "   HTTP:  http://${SERVER_IP}:3001/health" -ForegroundColor White
    Write-Host ''
    
    # 清理本地部署包
    Write-Host '清理本地部署包...' -ForegroundColor Gray
    Remove-Item -Path $DEPLOY_PACKAGE -Force
    Write-Host '✅ 清理完成' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host '❌ 部署失败！请检查服务器日志。' -ForegroundColor Red
    exit 1
}


