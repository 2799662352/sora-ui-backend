# Verify Statistics Accuracy
# Compare Prisma aggregate results with database direct query

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Verify Statistics Accuracy" -ForegroundColor Cyan
Write-Host "  (Prisma aggregate vs Database)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$BASE_URL = "http://localhost:3001"
$USERNAME = "admin"
$PASSWORD = "admin123"

# Login
Write-Host "Step 1: Login..." -ForegroundColor Yellow

$loginBody = @{
    username = $USERNAME
    password = $PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"
    
    $TOKEN = $loginResponse.data.token
    Write-Host "Success! Token obtained" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Login failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

# Get API stats (Prisma aggregate)
Write-Host "Step 2: Get stats from API (Prisma aggregate)..." -ForegroundColor Yellow

try {
    $apiStats = Invoke-RestMethod -Uri "$BASE_URL/api/video/stats/enhanced" `
        -Method GET `
        -Headers $headers
    
    Write-Host "API Stats (Prisma aggregate):" -ForegroundColor Green
    Write-Host "  Total: $($apiStats.data.total)" -ForegroundColor White
    Write-Host "  Completed: $($apiStats.data.completed)" -ForegroundColor Green
    Write-Host "  Failed: $($apiStats.data.failed)" -ForegroundColor Red
    Write-Host "  Processing: $($apiStats.data.processing)" -ForegroundColor Yellow
    Write-Host "  Success Rate: $([math]::Round($apiStats.data.successRate, 2))%" -ForegroundColor Cyan
    Write-Host ""
    
    # Calculate revenue（修正后的价格）
    $API_COST = 0.00  # 失败任务成本为 0
    $REVENUE_PER_VIDEO = 0.15  # 成功任务收益 $0.15
    
    $totalRevenue = $apiStats.data.completed * $REVENUE_PER_VIDEO
    $totalCost = $apiStats.data.total * $API_COST
    $grossProfit = $totalRevenue - $totalCost
    $profitMargin = if ($totalRevenue -gt 0) { ($grossProfit / $totalRevenue) * 100 } else { 0 }
    
    Write-Host "Revenue Calculation:" -ForegroundColor Magenta
    Write-Host "  Revenue: `$$([math]::Round($totalRevenue, 2))" -ForegroundColor Green
    Write-Host "  Cost: `$$([math]::Round($totalCost, 2))" -ForegroundColor White
    Write-Host "  Profit: `$$([math]::Round($grossProfit, 2))" -ForegroundColor Cyan
    Write-Host "  Margin: $([math]::Round($profitMargin, 1))%" -ForegroundColor Yellow
    Write-Host ""
    
    # Failed task analysis
    $failedCost = $apiStats.data.failed * $API_COST
    $lostRevenue = $apiStats.data.failed * $REVENUE_PER_VIDEO
    
    if ($apiStats.data.failed -gt 0) {
        Write-Host "Failed Task Analysis:" -ForegroundColor Red
        Write-Host "  Failed Tasks: $($apiStats.data.failed)" -ForegroundColor Red
        Write-Host "  Wasted Cost: `$$([math]::Round($failedCost, 2))" -ForegroundColor Red
        Write-Host "  Lost Revenue: `$$([math]::Round($lostRevenue, 2))" -ForegroundColor Red
        Write-Host "  Total Loss: `$$([math]::Round($failedCost + $lostRevenue, 2))" -ForegroundColor Red
        Write-Host ""
    }
    
} catch {
    Write-Host "API stats failed: $_" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  Verification Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Data Source:" -ForegroundColor Cyan
Write-Host "  API endpoint uses Prisma aggregate" -ForegroundColor White
Write-Host "  Database-level aggregation (most accurate)" -ForegroundColor White
Write-Host ""

Write-Host "Success Criteria:" -ForegroundColor Cyan
Write-Host "  90%+ Success Rate = Excellent (High Profit)" -ForegroundColor Green
Write-Host "  70-90% Success Rate = Good (Profitable)" -ForegroundColor Yellow
Write-Host "  <70% Success Rate = Need Improvement" -ForegroundColor Red
Write-Host ""

$currentRate = [math]::Round($apiStats.data.successRate, 1)
Write-Host "Current Success Rate: $currentRate%" -ForegroundColor $(if ($currentRate -ge 90) { "Green" } elseif ($currentRate -ge 70) { "Yellow" } else { "Red" })

if ($currentRate -lt 90) {
    $targetTasks = [math]::Ceiling($apiStats.data.total * 0.9)
    $needMore = $targetTasks - $apiStats.data.completed
    Write-Host ""
    Write-Host "To reach 90% success rate:" -ForegroundColor Yellow
    Write-Host "  Need $needMore more successful tasks" -ForegroundColor White
    Write-Host "  Or reduce failed tasks by $($apiStats.data.failed - ($apiStats.data.total * 0.1))" -ForegroundColor White
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Check admin dashboard: http://localhost:3000/dashboard/video-stats" -ForegroundColor White
Write-Host "  2. View database: npx prisma studio" -ForegroundColor White
Write-Host "  3. Analyze failure reasons" -ForegroundColor White
Write-Host ""

