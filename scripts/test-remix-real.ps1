
# 配置
$BaseUrl = "http://localhost:3001"
$Username = "testuser"
$Password = "Test123456"

Write-Host "🚀 开始 Remix 功能真实集成测试 (PowerShell版)..." -ForegroundColor Cyan

try {
    # 1. 登录
    Write-Host "`n1️⃣  正在登录..." -NoNewline
    $LoginBody = @{
        username = $Username
        password = $Password
    } | ConvertTo-Json

    $LoginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $LoginBody -ContentType "application/json"
    $Token = $LoginResponse.data.token
    $UserId = $LoginResponse.data.user.id
    Write-Host " ✅ 成功! Token已获取" -ForegroundColor Green

    # 2. 获取任务列表并查找适合的任务
    Write-Host "`n2️⃣  查找适合 Remix 的原任务..."
    $Headers = @{ Authorization = "Bearer $Token" }
    
    # 获取最近的20个任务
    $TasksResponse = Invoke-RestMethod -Uri "$BaseUrl/api/video/tasks?pageSize=50" -Method Get -Headers $Headers
    $Tasks = $TasksResponse.data.tasks

    # 筛选：状态完成 且 有外部ID
    $OriginalTask = $Tasks | Where-Object { $_.status -eq 'COMPLETED' -and $_.externalTaskId } | Select-Object -First 1

    if (-not $OriginalTask) {
        Write-Host "❌ 未找到适合 Remix 的任务！(需要 COMPLETED 且有 externalTaskId)" -ForegroundColor Red
        Write-Host "   当前用户 ($Username) 的任务总数: $($Tasks.Count)"
        exit
    }

    Write-Host "✅ 找到原任务:" -ForegroundColor Green
    Write-Host "   - VideoID: $($OriginalTask.videoId)"
    Write-Host "   - ExternalID: $($OriginalTask.externalTaskId)"
    Write-Host "   - Model: $($OriginalTask.model)"

    # 3. 发起 Remix 请求
    Write-Host "`n3️⃣  发起 Remix 请求..."
    $RemixBody = @{
        prompt = "Make it anime style, vibrant colors"
        model = if ($OriginalTask.model) { $OriginalTask.model } else { "sora_video2" }
    } | ConvertTo-Json

    try {
        $RemixResponse = Invoke-RestMethod -Uri "$BaseUrl/api/video/tasks/$($OriginalTask.videoId)/remix" `
            -Method Post `
            -Headers $Headers `
            -Body $RemixBody `
            -ContentType "application/json"

        Write-Host "✅ Remix 请求提交成功！" -ForegroundColor Green
        Write-Host "   - 新 VideoID: $($RemixResponse.data.videoId)"
        Write-Host "   - 新 ExternalID: $($RemixResponse.data.externalTaskId)"
        Write-Host "   - 状态: $($RemixResponse.data.status)"
        Write-Host "   - 来源: $($RemixResponse.data.remixed_from)"

        Write-Host "`n✨ 测试通过！后端 Remix 功能工作正常。" -ForegroundColor Cyan
    }
    catch {
        Write-Host "❌ Remix 请求失败:" -ForegroundColor Red
        Write-Host $_.Exception.Message
        if ($_.Exception.Response) {
            $Stream = $_.Exception.Response.GetResponseStream()
            $Reader = New-Object System.IO.StreamReader($Stream)
            Write-Host "   详情: $($Reader.ReadToEnd())"
        }
    }

}
catch {
    Write-Host "❌ 测试过程中发生错误:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $Stream = $_.Exception.Response.GetResponseStream()
        $Reader = New-Object System.IO.StreamReader($Stream)
        Write-Host "   详情: $($Reader.ReadToEnd())"
    }
}

