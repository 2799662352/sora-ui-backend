# 📹 视频任务 API 文档

本文档描述了 Sora UI 后端新增的视频任务管理 API 接口。

## 概述

视频任务 API 提供了完整的视频生成任务管理功能，包括：
- 创建视频/图片生成任务
- 查询任务状态和进度
- 获取生成的视频/图片内容
- 管理用户的历史任务记录
- 任务统计信息

## 认证

所有 API 接口都需要 JWT Token 认证：

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

## API 端点

### 1. 创建视频任务

创建一个新的视频或图片生成任务。

```
POST /api/video/tasks
```

#### 请求参数

```json
{
  "prompt": "一只可爱的小猫在阳光下玩耍",
  "model": "sora_video2",
  "size": "1280x720",
  "duration": 10,
  "watermark": false,
  "aspectRatio": "16:9",
  "referenceImage": "data:image/png;base64,...",
  "apiConfigId": "apiyi-sora2-async"
}
```

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| prompt | string | ✅ | 生成视频/图片的文本描述 |
| model | string | ✅ | 模型名称 (见下方支持的模型列表) |
| size | string | ❌ | 视频尺寸，如 "1280x720" |
| duration | number | ❌ | 视频时长（秒），默认 10 |
| watermark | boolean | ❌ | 是否添加水印，默认 false |
| aspectRatio | string | ❌ | 宽高比，如 "16:9", "9:16", "1:1" |
| referenceImage | string | ❌ | Base64 编码的参考图片 |
| apiConfigId | string | ❌ | API 配置 ID，默认使用第一个可用配置 |

#### 支持的模型

- `sora_video2` - 标准视频生成
- `sora_video2-portrait` - 竖屏视频
- `sora_video2-landscape` - 横屏视频
- `gemini-2.5-flash-imagen` - Gemini 图片生成
- `gemini-2.5-flash-imagen-edit` - Gemini 图片编辑

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "clxxxxx",
    "videoId": "video_d4ed36bb-5522-4c56-8464-159348dea3c5",
    "userId": "user_12345",
    "status": "QUEUED",
    "progress": 0,
    "prompt": "一只可爱的小猫在阳光下玩耍",
    "model": "sora_video2",
    "createdAt": "2024-01-01T10:00:00Z",
    "mediaType": "VIDEO"
  },
  "message": "任务创建成功"
}
```

### 2. 获取任务详情

获取单个视频任务的详细信息。

```
GET /api/video/tasks/:videoId
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "clxxxxx",
    "videoId": "video_d4ed36bb-5522-4c56-8464-159348dea3c5",
    "status": "COMPLETED",
    "progress": 100,
    "videoUrl": "https://api.example.com/v1/videos/xxx/content",
    "prompt": "一只可爱的小猫在阳光下玩耍",
    "model": "sora_video2",
    "duration": 10,
    "size": "1280x720",
    "createdAt": "2024-01-01T10:00:00Z",
    "completedAt": "2024-01-01T10:05:00Z"
  }
}
```

### 3. 获取视频内容 URL

获取已完成任务的视频/图片 URL。

```
GET /api/video/tasks/:videoId/content
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "videoId": "video_d4ed36bb-5522-4c56-8464-159348dea3c5",
    "url": "https://api.example.com/v1/videos/xxx/content"
  }
}
```

### 4. 获取任务列表

获取当前用户的视频任务列表。

```
GET /api/video/tasks?page=1&pageSize=20&status=COMPLETED&orderBy=createdAt&order=desc
```

#### 查询参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|-----|-------|-----|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 |
| status | string | - | 任务状态筛选 |
| mediaType | string | - | 媒体类型筛选 (VIDEO/IMAGE) |
| orderBy | string | createdAt | 排序字段 |
| order | string | desc | 排序方向 (asc/desc) |

#### 任务状态

- `QUEUED` - 排队中
- `PROCESSING` - 处理中
- `COMPLETED` - 已完成
- `FAILED` - 失败
- `CANCELLED` - 已取消

#### 响应示例

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "videoId": "video_xxx",
        "status": "COMPLETED",
        "prompt": "...",
        "createdAt": "2024-01-01T10:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 5. 获取任务统计

获取用户的任务统计信息。

```
GET /api/video/stats
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 100,
    "completed": 80,
    "failed": 5,
    "processing": 10,
    "queued": 5
  }
}
```

### 6. 取消任务

取消一个正在进行中的任务。

```
POST /api/video/tasks/:videoId/cancel
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "videoId": "video_xxx",
    "status": "CANCELLED"
  },
  "message": "任务已取消"
}
```

## 错误处理

所有 API 在出错时返回标准错误格式：

```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

常见错误码：

- `400` - 请求参数错误
- `401` - 未认证
- `403` - 无权限
- `404` - 资源不存在
- `500` - 服务器内部错误

## 使用示例

### JavaScript/TypeScript

```typescript
// 创建任务
const createTask = async () => {
  const response = await fetch('http://localhost:3001/api/video/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      prompt: '一只可爱的小猫在阳光下玩耍',
      model: 'sora_video2',
      duration: 10,
      aspectRatio: '16:9'
    })
  });
  
  const data = await response.json();
  return data.data;
};

// 轮询任务状态
const pollTaskStatus = async (videoId: string) => {
  let task;
  do {
    const response = await fetch(`http://localhost:3001/api/video/tasks/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    task = data.data;
    
    console.log(`任务状态: ${task.status}, 进度: ${task.progress}%`);
    
    if (task.status === 'PROCESSING' || task.status === 'QUEUED') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
    }
  } while (task.status === 'PROCESSING' || task.status === 'QUEUED');
  
  return task;
};
```

## 数据库迁移

在部署前，需要运行数据库迁移来创建 video_tasks 表：

### 使用 Prisma 迁移

```bash
# 生成迁移文件
npx prisma migrate dev --name add_video_tasks

# 在生产环境应用迁移
npx prisma migrate deploy
```

### 手动 SQL 迁移

```bash
# 运行 SQL 迁移脚本
psql -U your_username -d your_database -f add-video-tasks-migration.sql
```

## 配置说明

### 环境变量

在 `.env` 文件中添加：

```env
# API易配置
APIYI_API_KEY=sk-fkmcuF2M7pwW1X9oE8E9Ba553e694f5388A85519A4D2Bc67

# 轮询配置
VIDEO_POLL_INTERVAL=30000  # 30秒
VIDEO_MAX_POLL_ATTEMPTS=20  # 最多轮询20次
```

### API 配置

在 `videoTaskService.ts` 中可以配置多个 API 端点：

```typescript
const API_CONFIGS: ApiConfig[] = [
  {
    id: 'apiyi-sora2-async',
    name: 'API易 Sora 2',
    type: 'sora2-async',
    baseUrl: 'https://api.apiyi.com',
    apiKey: process.env.APIYI_API_KEY,
    pollInterval: 30000,
    maxPollAttempts: 20,
  },
  // 添加更多 API 配置
];
```

## 定时任务（可选）

如果需要自动轮询待处理的任务，可以设置定时任务：

```typescript
// 在 app.ts 中添加
import { videoTaskService } from './services/videoTaskService';

// 每分钟轮询一次待处理任务
setInterval(() => {
  videoTaskService.pollPendingTasks().catch(console.error);
}, 60000);
```

## 注意事项

1. **任务轮询**: 异步任务会自动在后台轮询，直到完成或失败
2. **任务过期**: 建议定期清理过期任务（可使用 `cleanupOldTasks` 方法）
3. **并发限制**: 建议限制同一用户的并发任务数量
4. **存储优化**: 大量任务时考虑分区表或归档策略
5. **安全性**: 参考图片使用 Base64 编码，注意大小限制

## 与前端集成

前端（sora-ui）可以直接调用这些 API 接口，无需修改现有的生成逻辑，只需要：

1. 在生成视频时，同时调用后端 API 创建任务记录
2. 使用后端返回的 `videoId` 作为唯一标识
3. 定期查询任务列表，展示历史记录
4. 从后端获取视频 URL，而不是只依赖本地存储
