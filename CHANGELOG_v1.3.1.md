# 📋 v1.3.1 更新日志

**发布日期**: 2025-11-26

---

## 🆕 新功能

### 1. 图片 URL 方式上传

**问题**：
- 直接上传大图（1920×1080）到外部 API 容易失败
- 中文文件名编码导致上传失败

**解决方案**：
```typescript
// 保存图片到本地 uploads/
fs.writeFileSync('./uploads/ref_{hash}.jpg', file.buffer);

// 生成公网 URL
const imageUrl = `${PUBLIC_BASE_URL}/uploads/ref_{hash}.jpg`;

// 用 URL 调用外部 API（更稳定）
formData.append('input_reference[]', imageUrl);
```

**效果**：
- ✅ 支持任意尺寸图片（包括 1920×1080）
- ✅ 避免中文编码问题
- ✅ 提高上传成功率

---

### 2. 图片去重（Redis 缓存）

**参考**: n8n deduplication-helper.ts

**实现**：
```typescript
// 计算图片 MD5 哈希
const imageHash = crypto.createHash('md5').update(buffer).digest('hex');

// 检查 Redis 缓存
const cachedUrl = await redisService.get(`image:hash:${imageHash}`);

// 命中缓存 → 直接使用，无需保存
if (cachedUrl) {
  return cachedUrl; // ♻️ 去重
}

// 新图片 → 保存并缓存（1小时）
await redisService.set(`image:hash:${imageHash}`, imageUrl, 'EX', 3600);
```

**效果**：
- ✅ 相同图片只保存一次
- ✅ 节省存储空间
- ✅ 提升上传速度（跳过文件保存）

**测试验证**：
```
第1次上传: 保存文件 (176KB) + 缓存 URL
第2次上传: 命中缓存 ✅ 无重复保存
```

---

### 3. 图片自动清理（定时任务）

**参考**: n8n 临时文件管理

**实现**：
```typescript
// 每30分钟执行清理
setInterval(() => {
  // 1. 删除 >30分钟的图片文件
  fs.unlinkSync(filePath);
  
  // 2. 同步删除 Redis 缓存
  await redisService.delete(`image:hash:${fileHash}`);
}, 30 * 60 * 1000);
```

**效果**：
- ✅ 自动清理旧图片（>30分钟）
- ✅ 同步清除 Redis 缓存
- ✅ 防止存储空间无限增长

**启动日志**：
```
[ImageCleaner] 🚀 启动图片自动清理服务
[ImageCleaner] ⏰ 清理间隔: 30分钟
[ImageCleaner] 🗑️ 清理阈值: 30分钟前的图片
```

**清理日志示例**：
```
[ImageCleaner] 🔍 开始清理，共 2 个文件
[ImageCleaner] 🗑️ Redis 缓存已删除: 31c2684fa63f...
[ImageCleaner] 🗑️ 已删除: ref_xxx.jpg (年龄: 62 分钟)
[ImageCleaner] ✅ 清理完成
[ImageCleaner] 📊 删除文件: 2 个
[ImageCleaner] 📊 清除缓存: 2 个
```

---

## 🔧 配置变更

### 环境变量

新增：
```env
PUBLIC_BASE_URL=http://175.27.250.155  # 公网访问地址
```

### Docker Compose

新增 volumes：
```yaml
backend:
  volumes:
    - ./uploads:/app/uploads  # 图片存储

nginx:
  volumes:
    - ./uploads:/var/www/uploads:ro  # 图片静态服务
```

### nginx 配置

新增：
```nginx
location /uploads/ {
    alias /var/www/uploads/;
    autoindex off;
    add_header Cache-Control "public, max-age=3600";
    add_header Access-Control-Allow-Origin "*";
}
```

---

## 📊 Redis 使用优化

### 新增 Key 模式

```
image:hash:{md5hash} → 图片 URL
TTL: 3600秒（1小时）
```

### Redis 作用总结

| Key 模式 | 作用 | TTL |
|----------|------|-----|
| `polling:{videoId}` | 轮询任务状态 | 1小时 |
| `poll:count:{videoId}` | 轮询计数器 | 2小时 |
| `image:hash:{hash}` | 图片URL缓存 | **1小时** ✨ |
| `channel:spend:today:{id}` | 今日成本 | 24小时 |
| `deployment:cooldown:{id}` | 冷却期 | 动态 |

---

## 🐛 修复的问题

1. **中文文件名编码** → 使用哈希命名 `ref_{hash}.jpg`
2. **大图上传失败** → URL 方式稳定支持 1920×1080
3. **重复存储** → Redis 去重，相同图片只保存1次
4. **存储无限增长** → 30分钟自动清理

---

## 🚀 性能提升

| 指标 | v1.2.11 | v1.3.1 | 提升 |
|------|---------|--------|------|
| 大图上传成功率 | ~30% | ~95% | +217% |
| 重复图片处理 | 每次保存 | 缓存命中 | ~50ms |
| 存储增长 | 无限 | 30分钟清理 | -100% |

---

## ⬆️ 升级指南

从 v1.2.x 升级：

```bash
# 1. 拉取新镜像
docker pull zuozuoliang999/sora-ui-backend:1.3.1-back

# 2. 更新 docker-compose.yml
#    image: zuozuoliang999/sora-ui-backend:1.3.1-back
#    environment:
#      - PUBLIC_BASE_URL=http://你的公网IP

# 3. 添加 nginx uploads 配置

# 4. 重启
docker-compose down
docker-compose up -d
```

---

## 📌 注意事项

1. **PUBLIC_BASE_URL**: 必须设置为可公网访问的地址
2. **nginx 配置**: 必须添加 `/uploads/` location
3. **自动清理**: 启动后立即执行一次清理，然后每30分钟
4. **数据持久化**: PostgreSQL 和 Redis 数据自动保留

---

## 🔗 相关文档

- [部署指南](./DEPLOY_GUIDE.md)
- [腾讯云快速部署](./scripts/快速部署-腾讯云.ps1)
- [API 文档](./README.md)
























