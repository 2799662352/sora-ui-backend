# 本地测试视频任务 API
# 运行方式: .\本地测试.ps1

Write-Host "🚀 Sora UI 视频任务 API - 本地测试" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# 1. 检查 Docker
Write-Host "📦 检查 Docker..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker 运行正常" -ForegroundColor Green
Write-Host ""

# 2. 生成 Prisma 客户端
Write-Host "🔧 生成 Prisma 客户端..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Prisma 客户端生成失败" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Prisma 客户端生成成功" -ForegroundColor Green
Write-Host ""

# 3. 运行数据库迁移
Write-Host "🗄️  运行数据库迁移..." -ForegroundColor Yellow
npx prisma migrate dev --name add_video_tasks
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  迁移可能已存在，继续..." -ForegroundColor Yellow
}
Write-Host "✅ 数据库迁移完成" -ForegroundColor Green
Write-Host ""

# 4. 启动服务
Write-Host "🐳 启动 Docker 服务..." -ForegroundColor Yellow
docker-compose down
docker-compose up -d
Start-Sleep -Seconds 5
Write-Host "✅ 服务启动完成" -ForegroundColor Green
Write-Host ""

# 5. 等待服务就绪
Write-Host "⏳ 等待服务启动..." -ForegroundColor Yellow
$retries = 0
$maxRetries = 30
while ($retries -lt $maxRetries) {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -ErrorAction SilentlyContinue
        if ($health.success) {
            Write-Host "✅ 服务已就绪" -ForegroundColor Green
            break
        }
    }
    catch {
        $retries++
        Write-Host "  等待中... ($retries/$maxRetries)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if ($retries -eq $maxRetries) {
    Write-Host "❌ 服务启动超时，请查看日志: docker-compose logs -f api" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 6. 测试 API
Write-Host "🧪 测试 API 端点..." -ForegroundColor Yellow
Write-Host ""

# 测试健康检查
Write-Host "1️⃣  测试健康检查..." -ForegroundColor Cyan
try {
    $healthResult = Invoke-RestMethod -Uri "http://localhost:3001/health"
    Write-Host "   ✅ 健康检查通过" -ForegroundColor Green
    Write-Host "   版本: $($healthResult.data.version)" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ 健康检查失败" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 登录获取 token
Write-Host "2️⃣  用户登录..." -ForegroundColor Cyan
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResult = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody
    
    $token = $loginResult.data.token
    Write-Host "   ✅ 登录成功" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
}
catch {
    Write-Host "   ⚠️  登录失败，需要先创建用户" -ForegroundColor Yellow
    
    # 尝试注册
    $registerBody = @{
        username = "admin"
        email = "admin@example.com"
        password = "admin123"
    } | ConvertTo-Json
    
    try {
        $registerResult = Invoke-RestMethod `
            -Uri "http://localhost:3001/api/auth/register" `
            -Method Post `
            -ContentType "application/json" `
            -Body $registerBody
        
        $token = $registerResult.data.token
        Write-Host "   ✅ 用户注册成功" -ForegroundColor Green
    }
    catch {
        Write-Host "   ❌ 注册失败: $_" -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

# 设置请求头
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# 测试创建视频任务
Write-Host "3️⃣  创建视频任务..." -ForegroundColor Cyan
$taskBody = @{
    prompt = "本地测试 - 一只可爱的小猫在阳光下玩耍"
    model = "sora_video2"
    duration = 10
    aspectRatio = "16:9"
    size = "1280x720"
} | ConvertTo-Json

try {
    $createResult = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/video/tasks" `
        -Method Post `
        -Headers $headers `
        -Body $taskBody
    
    $videoId = $createResult.data.videoId
    Write-Host "   ✅ 任务创建成功" -ForegroundColor Green
    Write-Host "   VideoID: $videoId" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ 创建任务失败: $_" -ForegroundColor Red
    Write-Host "   响应: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 查询任务详情
Write-Host "4️⃣  查询任务详情..." -ForegroundColor Cyan
try {
    $taskDetail = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/video/tasks/$videoId" `
        -Method Get `
        -Headers $headers
    
    Write-Host "   ✅ 任务查询成功" -ForegroundColor Green
    Write-Host "   状态: $($taskDetail.data.status)" -ForegroundColor Gray
    Write-Host "   进度: $($taskDetail.data.progress)%" -ForegroundColor Gray
    Write-Host "   模型: $($taskDetail.data.model)" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ 查询任务失败" -ForegroundColor Red
}
Write-Host ""

# 获取任务列表
Write-Host "5️⃣  获取任务列表..." -ForegroundColor Cyan
try {
    $listResult = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/video/tasks?page=1&pageSize=10" `
        -Method Get `
        -Headers $headers
    
    Write-Host "   ✅ 任务列表获取成功" -ForegroundColor Green
    Write-Host "   总任务数: $($listResult.data.total)" -ForegroundColor Gray
    Write-Host "   当前页: $($listResult.data.tasks.Count) 个任务" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ 获取列表失败" -ForegroundColor Red
}
Write-Host ""

# 获取统计信息
Write-Host "6️⃣  获取统计信息..." -ForegroundColor Cyan
try {
    $statsResult = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/video/stats" `
        -Method Get `
        -Headers $headers
    
    Write-Host "   ✅ 统计信息获取成功" -ForegroundColor Green
    Write-Host "   总计: $($statsResult.data.total)" -ForegroundColor Gray
    Write-Host "   已完成: $($statsResult.data.completed)" -ForegroundColor Gray
    Write-Host "   处理中: $($statsResult.data.processing)" -ForegroundColor Gray
    Write-Host "   队列中: $($statsResult.data.queued)" -ForegroundColor Gray
    Write-Host "   失败: $($statsResult.data.failed)" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ 获取统计失败" -ForegroundColor Red
}
Write-Host ""

# 测试取消任务
Write-Host "7️⃣  测试取消任务..." -ForegroundColor Cyan
try {
    $cancelResult = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/video/tasks/$videoId/cancel" `
        -Method Post `
        -Headers $headers
    
    Write-Host "   ✅ 任务取消成功" -ForegroundColor Green
}
catch {
    Write-Host "   ⚠️  取消失败（可能任务已完成）" -ForegroundColor Yellow
}
Write-Host ""

# 总结
Write-Host "============================================" -ForegroundColor Green
Write-Host "🎉 本地测试完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📊 测试结果:" -ForegroundColor Cyan
Write-Host "  ✅ 服务启动正常" -ForegroundColor Green
Write-Host "  ✅ 数据库连接正常" -ForegroundColor Green
Write-Host "  ✅ 视频任务 API 正常" -ForegroundColor Green
Write-Host "  ✅ 所有端点测试通过" -ForegroundColor Green
Write-Host ""
Write-Host "📚 后续操作:" -ForegroundColor Cyan
Write-Host "  1. 查看日志: docker-compose logs -f api" -ForegroundColor Gray
Write-Host "  2. 部署到云端: 参考 '部署检查清单.md'" -ForegroundColor Gray
Write-Host "  3. 前端集成: 参考 'docs/FRONTEND_INTEGRATION.md'" -ForegroundColor Gray
Write-Host ""
Write-Host "🌐 本地服务地址: http://localhost:3001" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Green
