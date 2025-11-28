# 测试图片去重功能

Write-Host "🧪 测试 1: 首次上传图片"
curl -X POST "http://localhost:3001/api/relay/sora/videos" `
  -H "Authorization: Bearer $token" `
  -F "prompt=测试去重-第一次" `
  -F "model=sora_video2" `
  -F "size=1280x720" `
  -F "seconds=10" `
  -F "input_reference=@D:\tecx\text\微信图片_20251028213249.jpg"

Write-Host "`n⏳ 等待10秒..."
Start-Sleep -Seconds 10

Write-Host "`n🧪 测试 2: 相同图片二次上传（应该命中缓存）"
curl -X POST "http://localhost:3001/api/relay/sora/videos" `
  -H "Authorization: Bearer $token" `
  -F "prompt=测试去重-第二次相同图片" `
  -F "model=sora_video2" `
  -F "size=1280x720" `
  -F "seconds=10" `
  -F "input_reference=@D:\tecx\text\微信图片_20251028213249.jpg"

Write-Host "`n📊 查看后端日志中的去重信息："
docker logs sora-ui-backend --tail 30 | Select-String -Pattern "去重|缓存|ImageDedup"
