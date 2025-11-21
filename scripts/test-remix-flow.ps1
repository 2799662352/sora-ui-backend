# 🧪 Remix 功能端到端测试
# 位置：在 sora-ui-backend 目录下运行

Write-Host "`n🚀 Remix 功能完整测试开始..." -ForegroundColor Green

# Step 1: 登录
Write-Host "`n📝 Step 1: 管理员登录..." -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin123"}'

$token = $login.data.token
Write-Host "✅ 登录成功！" -ForegroundColor Green

# Step 2: 创建视频
Write-Host "`n📝 Step 2: 创建原始视频..." -ForegroundColor Cyan
$create = Invoke-RestMethod -Uri "http://localhost:3001/api/relay/sora/videos" `
  -Method Post `
  -Headers @{"Authorization"="Bearer $token"} `
  -Form @{
    prompt="一只金毛狗在草地上奔跑"
    model="sora_video2"
    size="720x720"
    seconds="10"
  }

$videoId = $create.data.videoId
$externalId = $create.data.externalTaskId
Write-Host "✅ 视频创建成功！" -ForegroundColor Green
Write-Host "   videoId: $videoId" -ForegroundColor Yellow
Write-Host "   externalId: $externalId" -ForegroundColor Yellow

# Step 3: 等待完成
Write-Host "`n📝 Step 3: 等待视频完成（最多5分钟）..." -ForegroundColor Cyan
$maxWait = 60  # 60次 x 5秒 = 5分钟
$count = 0

while ($count -lt $maxWait) {
  $task = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks/$videoId" `
    -Method Get `
    -Headers @{"Authorization"="Bearer $token"}
  
  $status = $task.data.status
  $progress = $task.data.progress
  
  Write-Host "   [$count] 状态: $status | 进度: $progress%" -ForegroundColor Yellow
  
  if ($status -eq "COMPLETED") {
    Write-Host "✅ 视频生成完成！" -ForegroundColor Green
    break
  }
  
  if ($status -eq "FAILED") {
    Write-Host "❌ 视频生成失败！" -ForegroundColor Red
    exit 1
  }
  
  Start-Sleep -Seconds 5
  $count++
}

if ($count -ge $maxWait) {
  Write-Host "❌ 等待超时！" -ForegroundColor Red
  exit 1
}

# Step 4: Remix
Write-Host "`n📝 Step 4: Remix 视频..." -ForegroundColor Cyan
$remix = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks/$videoId/remix" `
  -Method Post `
  -Headers @{"Authorization"="Bearer $token"; "Content-Type"="application/json"} `
  -Body '{"prompt":"再加一只小猫，它们一起玩耍","model":"sora_video2"}'

$newVideoId = $remix.data.videoId
$newExternalId = $remix.data.externalTaskId
Write-Host "✅ Remix 创建成功！" -ForegroundColor Green
Write-Host "   新videoId: $newVideoId" -ForegroundColor Yellow
Write-Host "   新externalId: $newExternalId" -ForegroundColor Yellow

# Step 5: 验证 Remix
Write-Host "`n📝 Step 5: 验证 Remix 任务..." -ForegroundColor Cyan
$count = 0

while ($count -lt $maxWait) {
  $remixTask = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks/$newVideoId" `
    -Method Get `
    -Headers @{"Authorization"="Bearer $token"}
  
  $status = $remixTask.data.status
  $progress = $remixTask.data.progress
  $metadata = $remixTask.data.metadata
  
  Write-Host "   [$count] 状态: $status | 进度: $progress%" -ForegroundColor Yellow
  
  if ($metadata) {
    Write-Host "   Metadata: $($metadata | ConvertTo-Json -Compress)" -ForegroundColor Cyan
  }
  
  if ($status -eq "COMPLETED") {
    Write-Host "✅ Remix 完成！" -ForegroundColor Green
    Write-Host "   视频URL: $($remixTask.data.videoUrl)" -ForegroundColor Yellow
    break
  }
  
  if ($status -eq "FAILED") {
    Write-Host "❌ Remix 失败！" -ForegroundColor Red
    exit 1
  }
  
  Start-Sleep -Seconds 5
  $count++
}

Write-Host "`n🎉 测试完成！" -ForegroundColor Green
Write-Host "`n📊 总结:" -ForegroundColor Cyan
Write-Host "   原视频: $videoId"
Write-Host "   Remix视频: $newVideoId"





