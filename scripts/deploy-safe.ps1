# ╔══════════════════════════════════════════════════════════════╗
# ║  🛡️ Sora UI Backend - 安全部署脚本                         ║
# ║  只更新 API，100% 保护 PostgreSQL 数据库                    ║
# ╚══════════════════════════════════════════════════════════════╝

param(
    [string]$Action = "deploy",  # deploy, rollback, status
    [switch]$SkipBackup = $false
)

Clear-Host

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🛡️  安全部署 - 保护数据库                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============ 配置 ============
$SERVER_IP = "175.27.250.155"
$SERVER_USER = "root"
$DEPLOY_PATH = "/opt/sora-ui-deploy"
$BACKEND_PATH = "$DEPLOY_PATH/sora-backend"
$BACKUP_DIR = "$DEPLOY_PATH/backups"

# ============ 函数定义 ============

function Check-Prerequisites {
    Write-Host "[前置检查] 验证环境..." -ForegroundColor Yellow
    
    # 检查必要命令
    $commands = @("ssh", "scp", "docker", "npm", "tar")
    foreach ($cmd in $commands) {
        try {
            Get-Command $cmd -ErrorAction Stop | Out-Null
            Write-Host "   ✓ $cmd" -ForegroundColor Green
        } catch {
            Write-Host "   ✗ $cmd 未安装" -ForegroundColor Red
            return $false
        }
    }
    
    # 检查服务器连接
    Write-Host "   ⏳ 测试服务器连接..." -ForegroundColor Gray
    $result = ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "echo OK" 2>&1
    if ($result -like "*OK*") {
        Write-Host "   ✓ 服务器连接正常" -ForegroundColor Green
        return $true
    } else {
        Write-Host "   ✗ 无法连接到服务器" -ForegroundColor Red
        return $false
    }
}

function Check-DatabaseStatus {
    Write-Host "`n[数据库检查] 确认 PostgreSQL 状态..." -ForegroundColor Yellow
    
    $dbCheck = @"
#!/bin/bash
cd $DEPLOY_PATH

# 检查数据库容器
if ! docker compose ps postgres | grep -q "Up"; then
    echo "ERROR: PostgreSQL 容器未运行"
    exit 1
fi

# 检查数据库连接
if ! docker compose exec -T postgres pg_isready -U sorauser > /dev/null 2>&1; then
    echo "ERROR: PostgreSQL 无法连接"
    exit 1
fi

# 统计数据
USER_COUNT=`$(docker compose exec -T postgres psql -U sorauser -d soraui -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
LICENSE_COUNT=`$(docker compose exec -T postgres psql -U sorauser -d soraui -t -c "SELECT COUNT(*) FROM licenses;" 2>/dev/null | xargs)

echo "✓ PostgreSQL 运行正常"
echo "✓ 用户数: `$USER_COUNT"
echo "✓ 许可证数: `$LICENSE_COUNT"
"@
    
    $result = $dbCheck | ssh ${SERVER_USER}@${SERVER_IP} "bash -s"
    
    if ($result -like "*ERROR*") {
        Write-Host "   ✗ 数据库状态异常" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        return $false
    } else {
        $result -split "`n" | ForEach-Object {
            Write-Host "   $_" -ForegroundColor Green
        }
        return $true
    }
}

function Backup-CurrentVersion {
    if ($SkipBackup) {
        Write-Host "`n[跳过备份] --SkipBackup 已设置" -ForegroundColor Yellow
        return $true
    }
    
    Write-Host "`n[备份当前版本] 创建回滚点..." -ForegroundColor Yellow
    
    $backupScript = @"
#!/bin/bash
cd $DEPLOY_PATH

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份时间戳
TIMESTAMP=`$(date +%Y%m%d_%H%M%S)

# 1. 备份后端代码
if [ -d "$BACKEND_PATH" ]; then
    tar -czf $BACKUP_DIR/backend_`$TIMESTAMP.tar.gz -C $BACKEND_PATH .
    echo "✓ 后端代码已备份: backend_`$TIMESTAMP.tar.gz"
fi

# 2. 备份数据库（可选）
docker compose exec -T postgres pg_dump -U sorauser soraui > $BACKUP_DIR/database_`$TIMESTAMP.sql
echo "✓ 数据库已备份: database_`$TIMESTAMP.sql"

# 3. 清理旧备份（保留最近 5 个）
cd $BACKUP_DIR
ls -t backend_*.tar.gz | tail -n +6 | xargs rm -f 2>/dev/null || true
ls -t database_*.sql | tail -n +6 | xargs rm -f 2>/dev/null || true

echo "✓ 备份完成"
"@
    
    $result = $backupScript | ssh ${SERVER_USER}@${SERVER_IP} "bash -s"
    Write-Host $result -ForegroundColor Green
    return $true
}

function Build-LocalCode {
    Write-Host "`n[本地构建] 编译后端代码..." -ForegroundColor Yellow
    
    # 清理
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path "node_modules") { Remove-Item "node_modules" -Recurse -Force }
    
    # 安装依赖
    Write-Host "   ⏳ 安装依赖..." -ForegroundColor Gray
    npm ci --only=production 2>&1 | Out-Null
    
    # 安装 devDependencies（编译需要）
    npm install --only=dev 2>&1 | Out-Null
    
    # 构建
    Write-Host "   ⏳ 编译 TypeScript..." -ForegroundColor Gray
    npm run build 2>&1 | Out-Null
    
    if (Test-Path "dist/app.js") {
        Write-Host "   ✓ 构建成功" -ForegroundColor Green
        return $true
    } else {
        Write-Host "   ✗ 构建失败" -ForegroundColor Red
        return $false
    }
}

function Package-Code {
    Write-Host "`n[打包代码] 创建部署包..." -ForegroundColor Yellow
    
    $packageFile = "sora-backend-$(Get-Date -Format 'yyyyMMdd_HHmmss').tar.gz"
    
    # 使用 tar 打包
    tar -czf $packageFile `
        --exclude='*.log' `
        --exclude='*.md' `
        --exclude='test*' `
        dist `
        node_modules `
        prisma `
        package.json `
        package-lock.json
    
    if (Test-Path $packageFile) {
        $size = (Get-Item $packageFile).Length / 1MB
        Write-Host "   ✓ 打包完成: $packageFile ($('{0:N2}' -f $size) MB)" -ForegroundColor Green
        return $packageFile
    } else {
        Write-Host "   ✗ 打包失败" -ForegroundColor Red
        return $null
    }
}

function Deploy-ToServer {
    param([string]$PackageFile)
    
    Write-Host "`n[部署到服务器] 上传并切换版本..." -ForegroundColor Yellow
    
    # 1. 上传包
    Write-Host "   ⏳ 上传文件..." -ForegroundColor Gray
    scp -q $PackageFile ${SERVER_USER}@${SERVER_IP}:/tmp/
    
    # 2. 服务器端部署
    $deployScript = @"
#!/bin/bash
set -e
cd $DEPLOY_PATH

echo "   [1/5] 解压新版本..."
mkdir -p $BACKEND_PATH-new
tar -xzf /tmp/$PackageFile -C $BACKEND_PATH-new

echo "   [2/5] 复制环境变量..."
if [ -f "$BACKEND_PATH/.env" ]; then
    cp $BACKEND_PATH/.env $BACKEND_PATH-new/.env
fi

echo "   [3/5] 生成 Prisma Client..."
cd $BACKEND_PATH-new
npx prisma generate > /dev/null 2>&1

echo "   [4/5] 切换版本..."
cd $DEPLOY_PATH
if [ -d "$BACKEND_PATH" ]; then
    rm -rf $BACKEND_PATH-old 2>/dev/null || true
    mv $BACKEND_PATH $BACKEND_PATH-old
fi
mv $BACKEND_PATH-new $BACKEND_PATH

echo "   [5/5] 重启 API 服务（数据库保持运行）..."
docker compose stop api
docker compose rm -f api
docker compose up -d api

echo "   ⏳ 等待服务启动..."
sleep 5

# 健康检查
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✓ 服务启动成功"
    # 清理旧版本
    rm -rf $BACKEND_PATH-old
else
    echo "   ⚠️  健康检查失败，可能需要查看日志"
fi

# 清理临时文件
rm -f /tmp/$PackageFile
"@
    
    $result = $deployScript | ssh ${SERVER_USER}@${SERVER_IP} "bash -s"
    Write-Host $result -ForegroundColor Green
}

function Verify-Deployment {
    Write-Host "`n[部署验证] 检查服务状态..." -ForegroundColor Yellow
    
    # 1. API 健康检查
    Write-Host "   [1/4] API 健康检查..." -ForegroundColor Gray
    try {
        $health = Invoke-RestMethod -Uri "https://api.zuo2799662352.xyz/health" -TimeoutSec 10
        Write-Host "   ✓ API 响应正常" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  API 健康检查失败" -ForegroundColor Yellow
    }
    
    # 2. 数据库连接
    Write-Host "   [2/4] 数据库连接..." -ForegroundColor Gray
    $dbTest = ssh ${SERVER_USER}@${SERVER_IP} "cd $DEPLOY_PATH && docker compose exec -T postgres psql -U sorauser -d soraui -c 'SELECT 1;' > /dev/null 2>&1 && echo OK"
    if ($dbTest -like "*OK*") {
        Write-Host "   ✓ 数据库连接正常" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  数据库连接异常" -ForegroundColor Yellow
    }
    
    # 3. 服务日志
    Write-Host "   [3/4] 最近日志（最后 10 行）..." -ForegroundColor Gray
    $logs = ssh ${SERVER_USER}@${SERVER_IP} "cd $DEPLOY_PATH && docker compose logs --tail=10 api"
    $logs -split "`n" | Select-Object -Last 10 | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Gray
    }
    
    # 4. 容器状态
    Write-Host "   [4/4] 容器状态..." -ForegroundColor Gray
    $status = ssh ${SERVER_USER}@${SERVER_IP} "cd $DEPLOY_PATH && docker compose ps"
    Write-Host $status -ForegroundColor Gray
}

function Rollback-Previous {
    Write-Host "`n[回滚] 恢复到上一个版本..." -ForegroundColor Yellow
    
    $rollbackScript = @"
#!/bin/bash
cd $DEPLOY_PATH

# 查找最新备份
LATEST_BACKUP=`$(ls -t $BACKUP_DIR/backend_*.tar.gz 2>/dev/null | head -1)

if [ -z "`$LATEST_BACKUP" ]; then
    echo "✗ 未找到备份文件"
    exit 1
fi

echo "⏳ 恢复备份: `$(basename `$LATEST_BACKUP)"

# 停止当前服务
docker compose stop api
docker compose rm -f api

# 恢复备份
rm -rf $BACKEND_PATH
mkdir -p $BACKEND_PATH
tar -xzf `$LATEST_BACKUP -C $BACKEND_PATH

# 重启服务
docker compose up -d api

echo "✓ 回滚完成"
"@
    
    $result = $rollbackScript | ssh ${SERVER_USER}@${SERVER_IP} "bash -s"
    Write-Host $result -ForegroundColor Green
}

# ============ 主流程 ============

switch ($Action) {
    "deploy" {
        # 完整部署流程
        if (-not (Check-Prerequisites)) { exit 1 }
        if (-not (Check-DatabaseStatus)) {
            Write-Host "`n⚠️  数据库状态异常，部署已取消" -ForegroundColor Red
            exit 1
        }
        
        if (-not (Backup-CurrentVersion)) { exit 1 }
        if (-not (Build-LocalCode)) { exit 1 }
        
        $package = Package-Code
        if (-not $package) { exit 1 }
        
        Deploy-ToServer -PackageFile $package
        
        # 清理本地打包文件
        Remove-Item $package -Force
        
        Verify-Deployment
        
        Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║   🎉 部署成功！                                        ║" -ForegroundColor Green
        Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 API 地址: https://api.zuo2799662352.xyz" -ForegroundColor Cyan
        Write-Host "📊 监控: ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_PATH && docker compose logs -f api'" -ForegroundColor Gray
    }
    
    "rollback" {
        # 回滚到上一个版本
        if (-not (Check-Prerequisites)) { exit 1 }
        Rollback-Previous
        Verify-Deployment
    }
    
    "status" {
        # 查看当前状态
        Check-DatabaseStatus
        Verify-Deployment
    }
    
    default {
        Write-Host "未知操作: $Action" -ForegroundColor Red
        Write-Host "使用方法:" -ForegroundColor Yellow
        Write-Host "  .\deploy-safe.ps1 -Action deploy    # 部署新版本" -ForegroundColor Gray
        Write-Host "  .\deploy-safe.ps1 -Action rollback  # 回滚到上一版本" -ForegroundColor Gray
        Write-Host "  .\deploy-safe.ps1 -Action status    # 查看状态" -ForegroundColor Gray
        exit 1
    }
}

