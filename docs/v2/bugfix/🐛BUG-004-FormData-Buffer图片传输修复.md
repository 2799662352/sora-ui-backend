# 🐛 BUG-004: FormData Buffer 图片传输修复

## 问题描述

**问题现象**：后端转发参考图片到外部 Sora API 时失败

**根本原因**：
1. 原实现使用 URL 方式传递图片给外部 API
2. 后端服务运行在 Docker 容器中，生成的 URL（如 `http://175.27.250.155/uploads/xxx.jpg`）
3. 外部 API 服务器无法访问该 URL（防火墙、网络隔离等）

```
❌ 原流程（不可靠）：
前端上传图片 → 后端保存到 uploads → 生成公网 URL → 传 URL 给外部 API
                                                    ↓
                                          外部 API 无法访问 ❌

✅ 修复后流程（可靠）：
前端上传图片 → 后端直接传 Buffer 给外部 API → 成功 ✅
                 ↓
            同时保存本地（用于重试）
```

## 修复内容

### 文件 1: `src/controllers/soraRelayController.ts`

**修改**：直接传 Buffer，而不是 URL

```typescript
// ❌ 原来（URL 方式）：
formData.append('input_reference', imageUrl);

// ✅ 修复后（Buffer 方式）：
formData.append('input_reference', file.buffer, {
  filename: file.originalname,
  contentType: file.mimetype,
});
```

**同时保存本地文件用于重试**：

```typescript
// 🔥 保存到本地（用于重试和备份）
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const imageHash = ImageDeduplication.createImageHash(file.buffer);
const safeFilename = `ref_${imageHash}.${file.mimetype === 'image/png' ? 'png' : 'jpg'}`;
const filePath = path.join(uploadsDir, safeFilename);
fs.writeFileSync(filePath, file.buffer);

// 🔥 保存本地路径到数据库（用于重试时读取）
savedImagePath = filePath;
```

### 文件 2: `src/services/taskPollingService.ts`

**修改**：重试时读取本地文件，传 Buffer

```typescript
// ❌ 原来（URL 方式）：
formData.append('input_reference', dbTask.referenceImage);

// ✅ 修复后（Buffer 方式）：
const imagePath = dbTask.referenceImage;

if (fs.existsSync(imagePath)) {
  // 本地文件存在，读取并传递 Buffer
  const imageBuffer = fs.readFileSync(imagePath);
  const filename = path.basename(imagePath);
  const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  
  formData.append('input_reference', imageBuffer, {
    filename,
    contentType,
  });
} else {
  // 兼容旧数据：尝试 URL 方式
  formData.append('input_reference', imagePath);
}
```

## 数据库字段说明

`VideoTask.referenceImage` 字段存储内容变化：

| 版本 | 存储内容 | 示例 |
|------|----------|------|
| 旧版 | 公网 URL | `http://175.27.250.155/uploads/ref_abc123.jpg` |
| **新版** | **本地路径** | `/app/uploads/ref_abc123.jpg` |

## Docker 配置

确保 `uploads` 目录已正确挂载：

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ./uploads:/app/uploads     # 🔥 参考图片存储（可读写）
```

## 验证方法

1. 上传带参考图片的视频生成请求
2. 检查日志输出：
   ```
   [SoraRelay] 📎 处理参考图片...
   [SoraRelay] 📊 原始文件: test.jpg (150.23 KB)
   [SoraRelay] 📊 MIME类型: image/jpeg
   [SoraRelay] ✅ 图片已添加到 FormData (Buffer 方式)
   [SoraRelay] 💾 图片已保存: /app/uploads/ref_abc123def.jpg
   ```

3. 如果任务失败需要重试，检查重试日志：
   ```
   [TaskPolling] 🔄 开始重试任务: video_xxx
   [TaskPolling] 🖼️ 检测到参考图片，将带上图片重试
   [TaskPolling] 📁 图片路径: /app/uploads/ref_abc123def.jpg
   [TaskPolling] 📎 图片已添加到重试请求 (Buffer: 150.23 KB)
   ```

## 参考资料

- [form-data npm 文档](https://www.npmjs.com/package/form-data)
- [multer memoryStorage](https://github.com/expressjs/multer#memorystorage)

## 修复日期

2025-11-28



