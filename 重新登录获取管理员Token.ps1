# 重新登录获取包含 role 的管理员 Token

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Re-login to Get Admin Token with Role" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$BASE_URL = "http://localhost:3001"
$ADMIN_USERNAME = "zuozuoliang999"
$ADMIN_PASSWORD = "bryan2002127"

Write-Host "Step 1: Login with admin account..." -ForegroundColor Yellow
Write-Host "  Username: $ADMIN_USERNAME" -ForegroundColor Gray
Write-Host "  Password: $ADMIN_PASSWORD" -ForegroundColor Gray
Write-Host ""

$loginBody = @{
    username = $ADMIN_USERNAME
    password = $ADMIN_PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"
    
    $TOKEN = $loginResponse.data.token
    $USER = $loginResponse.data.user
    
    Write-Host "Success! Login completed." -ForegroundColor Green
    Write-Host ""
    Write-Host "User Info:" -ForegroundColor Cyan
    Write-Host "  ID: $($USER.id)" -ForegroundColor White
    Write-Host "  Username: $($USER.username)" -ForegroundColor White
    Write-Host "  Email: $($USER.email)" -ForegroundColor White
    Write-Host ""
    Write-Host "Token (first 50 chars):" -ForegroundColor Cyan
    Write-Host "  $($TOKEN.Substring(0, [Math]::Min(50, $TOKEN.Length)))..." -ForegroundColor Gray
    Write-Host ""
    
    # Decode JWT to verify role
    Write-Host "Step 2: Verify JWT token contains role..." -ForegroundColor Yellow
    
    $parts = $TOKEN.Split('.')
    if ($parts.Length -eq 3) {
        $payload = $parts[1]
        # Pad base64 string
        while ($payload.Length % 4 -ne 0) {
            $payload += '='
        }
        
        $decodedBytes = [System.Convert]::FromBase64String($payload)
        $decodedJson = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
        $tokenData = $decodedJson | ConvertFrom-Json
        
        Write-Host "JWT Payload:" -ForegroundColor Cyan
        Write-Host "  userId: $($tokenData.userId)" -ForegroundColor White
        Write-Host "  username: $($tokenData.username)" -ForegroundColor White
        Write-Host "  role: $($tokenData.role)" -ForegroundColor Yellow
        Write-Host ""
        
        if ($tokenData.role -eq 'ADMIN') {
            Write-Host "✅ JWT contains ADMIN role!" -ForegroundColor Green
        } else {
            Write-Host "❌ JWT role is: $($tokenData.role)" -ForegroundColor Red
            Write-Host "   Expected: ADMIN" -ForegroundColor Red
        }
    }
    Write-Host ""
    
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Test global stats API
Write-Host "Step 3: Test global stats API (admin only)..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

try {
    $statsResponse = Invoke-RestMethod -Uri "$BASE_URL/api/video/stats/global" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✅ Global stats API access successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Global Stats:" -ForegroundColor Cyan
    Write-Host "  Total Tasks: $($statsResponse.data.totalTasks)" -ForegroundColor White
    Write-Host "  Total Users: $($statsResponse.data.totalUsers)" -ForegroundColor White
    Write-Host "  Completed: $($statsResponse.data.completedTasks)" -ForegroundColor Green
    Write-Host "  Failed: $($statsResponse.data.failedTasks)" -ForegroundColor Red
    Write-Host "  Success Rate: $([math]::Round($statsResponse.data.successRate, 2))%" -ForegroundColor Yellow
    Write-Host ""
    
} catch {
    Write-Host "❌ Global stats access failed: $_" -ForegroundColor Red
    Write-Host "   This should not happen if role is included in JWT" -ForegroundColor Red
    exit 1
}

# Success summary
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  All Tests Passed!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Admin account is ready" -ForegroundColor Green
Write-Host "✅ JWT token includes role" -ForegroundColor Green
Write-Host "✅ Global stats API accessible" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Re-login in Next.js admin panel" -ForegroundColor White
Write-Host "     http://localhost:3000/login" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. View revenue stats" -ForegroundColor White
Write-Host "     http://localhost:3000/dashboard/video-stats" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Re-login in Electron app" -ForegroundColor White
Write-Host "     to access global stats tab" -ForegroundColor Gray
Write-Host ""
Write-Host "Important: You must re-login to get new token with role!" -ForegroundColor Yellow
Write-Host ""

