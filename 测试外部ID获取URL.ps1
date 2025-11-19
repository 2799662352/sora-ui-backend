# 🧪 测试通过外部ID获取视频URL
# 
# 功能：直接通过外部API的video_id获取video_url
# 无需查询后端数据库

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  🧪 测试通过外部ID获取视频URL" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# 配置
$BACKEND_URL = "http://localhost:3001"
$USERNAME = "admin"
$PASSWORD = "admin123"

Write-Host "📋 配置信息:" -ForegroundColor Yellow
Write-Host "  后端地址: $BACKEND_URL" -ForegroundColor Gray
Write-Host "  用户名: $USERNAME" -ForegroundColor Gray
Write-Host ""

# Step 1: 登录获取Token
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "  Step 1: 登录获取 Token" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

$loginBody = @{
    username = $USERNAME
    password = $PASSWORD
} | ConvertTo-Json -Compress

try {
    $loginResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody

    $TOKEN = $loginResponse.data.token
    Write-Host "✅ 登录成功！" -ForegroundColor Green
    Write-Host "Token: $($TOKEN.Substring(0,20))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ 登录失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: 输入外部Video ID
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "  Step 2: 输入外部Video ID" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

# 示例ID
$exampleIds = @(
    "video_0d954741-0240-4390-94b9-a1169b20a72a",
    "video_ee834171-005e-448d-b325-adbb62feaaa0",
    "video_eaf388db-f325-45d4-972a-b146e078b775"
)

Write-Host "示例ID（按Enter使用第一个）:" -ForegroundColor Cyan
for ($i = 0; $i -lt $exampleIds.Count; $i++) {
    Write-Host "  $($i+1). $($exampleIds[$i])" -ForegroundColor Gray
}
Write-Host ""

$userInput = Read-Host "请输入外部Video ID（或直接按Enter使用第一个示例）"

if ([string]::IsNullOrWhiteSpace($userInput)) {
    $EXTERNAL_VIDEO_ID = $exampleIds[0]
    Write-Host "✅ 使用示例ID: $EXTERNAL_VIDEO_ID" -ForegroundColor Green
} else {
    $EXTERNAL_VIDEO_ID = $userInput
}
Write-Host ""

# Step 3: 调用API获取视频URL
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "  Step 3: 调用API获取视频URL" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

$apiUrl = "$BACKEND_URL/api/video/external/$EXTERNAL_VIDEO_ID/url"

Write-Host "📡 请求地址: $apiUrl" -ForegroundColor Cyan
Write-Host "🔐 认证: Bearer Token" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏳ 正在查询..." -ForegroundColor Yellow
Write-Host ""

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri $apiUrl `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalMilliseconds

    Write-Host "✅ 请求成功！(耗时: $([math]::Round($duration))ms)" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  📊 响应数据" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    
    $data = $response.data
    
    Write-Host "外部Video ID: " -NoNewline -ForegroundColor Cyan
    Write-Host $data.externalVideoId -ForegroundColor White
    Write-Host ""
    
    Write-Host "状态: " -NoNewline -ForegroundColor Cyan
    if ($data.status -eq "completed") {
        Write-Host $data.status -ForegroundColor Green
    } else {
        Write-Host $data.status -ForegroundColor Yellow
    }
    Write-Host ""
    
    Write-Host "进度: " -NoNewline -ForegroundColor Cyan
    Write-Host "$($data.progress)%" -ForegroundColor $(if ($data.progress -eq 100) { "Green" } else { "Yellow" })
    Write-Host ""
    
    Write-Host "视频URL: " -NoNewline -ForegroundColor Cyan
    Write-Host $data.videoUrl.Substring(0, [Math]::Min(80, $data.videoUrl.Length)) -ForegroundColor White
    if ($data.videoUrl.Length -gt 80) {
        Write-Host "         ..." -ForegroundColor Gray
    }
    Write-Host ""
    
    # 保存完整URL到文件
    $urlFile = "video_url_$EXTERNAL_VIDEO_ID.txt"
    $data.videoUrl | Out-File -FilePath $urlFile -Encoding UTF8
    Write-Host "💾 完整URL已保存到: $urlFile" -ForegroundColor Green
    Write-Host ""
    
    # 显示完整JSON响应
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  📋 完整JSON响应" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host ""
    
    $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
    Write-Host ""
    
    # Step 4: 测试视频URL是否可访问
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "  Step 4: 测试视频URL可访问性" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "⏳ 正在测试URL..." -ForegroundColor Yellow
    
    try {
        $urlTest = Invoke-WebRequest -Uri $data.videoUrl -Method HEAD -TimeoutSec 10
        
        Write-Host "✅ URL可访问！" -ForegroundColor Green
        Write-Host ""
        Write-Host "状态码: " -NoNewline -ForegroundColor Cyan
        Write-Host $urlTest.StatusCode -ForegroundColor Green
        Write-Host ""
        Write-Host "Content-Type: " -NoNewline -ForegroundColor Cyan
        Write-Host $urlTest.Headers["Content-Type"] -ForegroundColor White
        Write-Host ""
        Write-Host "Content-Length: " -NoNewline -ForegroundColor Cyan
        if ($urlTest.Headers["Content-Length"]) {
            $sizeMB = [math]::Round($urlTest.Headers["Content-Length"] / 1MB, 2)
            Write-Host "$sizeMB MB" -ForegroundColor White
        } else {
            Write-Host "未知" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠️  URL测试失败: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "可能原因：" -ForegroundColor Yellow
        Write-Host "  1. 需要开启VPN" -ForegroundColor Gray
        Write-Host "  2. URL已过期" -ForegroundColor Gray
        Write-Host "  3. 网络连接问题" -ForegroundColor Gray
        Write-Host "  4. CDN限制" -ForegroundColor Gray
    }
    
    Write-Host ""
    
} catch {
    Write-Host "❌ 请求失败！" -ForegroundColor Red
    Write-Host ""
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP状态码: $statusCode" -ForegroundColor Red
        
        switch ($statusCode) {
            401 { Write-Host "原因: 认证失败，Token无效或已过期" -ForegroundColor Yellow }
            404 { Write-Host "原因: 视频不存在或ID错误" -ForegroundColor Yellow }
            500 { Write-Host "原因: 服务器内部错误" -ForegroundColor Yellow }
            default { Write-Host "原因: 未知错误" -ForegroundColor Yellow }
        }
    }
    Write-Host ""
    exit 1
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅ 测试完成" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Cyan
Write-Host "  • 完整URL已保存到: $urlFile" -ForegroundColor Gray
Write-Host "  • 可在浏览器中打开URL测试播放" -ForegroundColor Gray
Write-Host "  • 如遇403错误，请开启VPN" -ForegroundColor Gray
Write-Host ""

