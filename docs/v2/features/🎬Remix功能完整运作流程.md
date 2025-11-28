# 🎬 Remix 功能完整运作流程

> **文档创建日期**: 2025-11-28
> **版本**: 1.0
> **状态**: ✅ 生产就绪

---

## 🎯 功能概述

Remix（视频编辑）功能允许用户基于已有视频生成新的变体。核心是使用 **Metadata Pattern** 存储血缘关系，无需修改数据库 Schema。

### 核心特性

| 特性 | 说明 |
|------|------|
| 轻量级实现 | 使用 JSON 接口，不需要 multipart/form-data |
| Metadata 模式 | 血缘关系存储在 `metadata` JSON 字段 |
| 双 ID 系统 | 内部 `videoId` + 外部 `externalTaskId` |
| 自动轮询 | 复用现有的 taskPollingService |
| SSE 推送 | 实时进度更新 |
| 零风险部署 | 不需要数据库迁移 |

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Remix 功能架构图                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [前端 sora-ui]                                                         │
│       │                                                                  │
│       │ 1. POST /api/video/tasks/:videoId/remix                          │
│       │    { prompt: "新提示词", model: "sora_video2" }                   │
│       │                                                                  │
│       ▼                                                                  │
│   [后端 sora-ui-backend]                                                 │
│       │                                                                  │
│       │ 2. remixSoraVideo Controller                                     │
│       │    - 查找原任务 (获取 externalTaskId)                             │
│       │    - 验证权限                                                    │
│       │                                                                  │
│       ▼                                                                  │
│   [外部 Sora API] (45.8.22.95:8000)                                      │
│       │                                                                  │
│       │ 3. POST /sora/v1/videos/{externalTaskId}/remix                   │
│       │    { prompt, model }                                             │
│       │                                                                  │
│       ▼                                                                  │
│   [返回新 externalTaskId]                                                │
│       │                                                                  │
│       │ 4. 保存新任务到 PostgreSQL                                        │
│       │    metadata: { remix_from, remix_from_external, type: 'remix' }  │
│       │                                                                  │
│       ▼                                                                  │
│   [taskPollingService]                                                   │
│       │                                                                  │
│       │ 5. 启动轮询                                                       │
│       │    - Redis 分布式锁 (防止多实例重复)                              │
│       │    - 每 5 秒查询外部 API                                          │
│       │                                                                  │
│       ▼                                                                  │
│   [sseService]                                                           │
│       │                                                                  │
│       │ 6. 推送进度更新到前端                                             │
│       │    { videoId, status, progress, videoUrl }                       │
│       │                                                                  │
│       ▼                                                                  │
│   [前端显示新视频] ✅                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📝 API 规范

### 请求

```http
POST /api/video/tasks/:videoId/remix
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Change style to cyberpunk",
  "model": "sora_video2"
}
```

### 响应

```json
{
  "success": true,
  "data": {
    "videoId": "video_1763642100_abc123",
    "externalTaskId": "video_4d46eb5e-243d-4076-8d89-2a82ebf312df",
    "status": "processing",
    "message": "Remix 任务已提交",
    "remixed_from": "video_1763636624613_k4hkynr"
  },
  "requestTime": 234
}
```

---

## 🔧 核心代码实现

### 1. Controller: `remixSoraVideo`

**文件**: `src/controllers/soraRelayController.ts`

```typescript
export const remixSoraVideo = async (req: AuthRequest, res: Response) => {
  const { videoId } = req.params;
  const { prompt, model } = req.body;
  const userId = req.user!.userId;
  
  // 1️⃣ 查找原任务（获取 externalTaskId）
  const originalTask = await prisma.videoTask.findUnique({
    where: { videoId },
  });
  
  if (!originalTask || !originalTask.externalTaskId) {
    return res.status(404).json({ error: '原视频任务不存在或无外部ID' });
  }
  
  // 2️⃣ 调用外部 Remix API
  const response = await axios.post(
    `${SORA_API_BASE}/sora/v1/videos/${originalTask.externalTaskId}/remix`,
    { prompt, model: model || originalTask.model },
    { headers: { 'Authorization': SORA_API_KEY, 'Content-Type': 'application/json' } }
  );
  
  const newExternalTaskId = response.data.id;
  
  // 3️⃣ 保存新任务 (Metadata Pattern)
  const newVideoId = `video_${Date.now()}_${random()}`;
  await prisma.videoTask.create({
    data: {
      videoId: newVideoId,
      externalTaskId: newExternalTaskId,
      userId,
      model: model || originalTask.model,
      prompt,
      status: TaskStatus.PROCESSING,
      // 🔥 关键：使用 metadata 存储血缘关系
      metadata: {
        remix_from: videoId,
        remix_from_external: originalTask.externalTaskId,
        type: 'remix'
      }
    }
  });
  
  // 4️⃣ 启动轮询
  startTaskPolling({ videoId: newVideoId, externalTaskId: newExternalTaskId, ... });
  
  // 5️⃣ 返回结果
  res.json({
    success: true,
    data: { videoId: newVideoId, externalTaskId: newExternalTaskId, status: 'processing' }
  });
};
```

### 2. Route 配置

**文件**: `src/routes/videoTask.ts`

```typescript
// 🔥 Remix (视频编辑) 接口
router.post('/tasks/:videoId/remix', authMiddleware, remixSoraVideo as any);
```

### 3. 轮询服务

**文件**: `src/services/taskPollingService.ts`

轮询服务的核心逻辑：

| 功能 | 实现 |
|------|------|
| 分布式锁 | Redis SETNX (10分钟过期) |
| 任务持久化 | Redis 缓存 (1小时 TTL) |
| 原子计数 | `poll:count:{videoId}` |
| 状态推送 | SSE 实时推送 |
| 自动重试 | 失败任务自动重试一次 |

---

## 💾 数据存储

### Metadata 结构

```json
{
  "remix_from": "video_1763636624613_k4hkynr",
  "remix_from_external": "video_372198d6-d441-4443-8f19-c355d65d050a",
  "type": "remix"
}
```

### PostgreSQL 任务表 (VideoTask)

| 字段 | 类型 | 说明 |
|------|------|------|
| videoId | String | 内部任务 ID |
| externalTaskId | String | 外部 API 任务 ID |
| userId | String | 用户 ID |
| prompt | String | 提示词 |
| model | String | 模型名称 |
| status | Enum | 任务状态 |
| metadata | Json | 扩展元数据 (含 Remix 血缘) |

### Redis 键结构

| 键 | 用途 | TTL |
|----|------|-----|
| `sora-ui:polling:{videoId}` | 轮询任务详情 | 1小时 |
| `sora-ui:poll:count:{videoId}` | 轮询次数计数器 | 2小时 |
| `sora-ui:lock:polling:{videoId}` | 分布式锁 | 10分钟 |

---

## 📊 当前系统状态 (2025-11-28)

### Redis 状态

```
redis_version: 7.4.7
used_memory_human: 1.04M
db0: { keys: 6, expires: 6 }

活跃键:
- lock:polling:video_1764314990984_9y6j9mq (轮询锁)
- lock:polling:video_1764314985555_y8l4sty (轮询锁)
- sora-ui:image:hash:* (图片去重缓存)
- sora-ui:sse:sessions:* (SSE 会话)
```

### PostgreSQL 状态

```sql
-- 任务统计
total: 480
with_client_id: 11
with_external_id: 411
completed: 383
```

---

## 🧪 测试命令

### PowerShell 测试脚本

```powershell
# 1. 登录获取 Token
$loginResult = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"testuser","password":"Test123456"}'

$token = $loginResult.data.token

# 2. 获取已完成任务列表
$tasks = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks?status=COMPLETED" `
  -Method Get `
  -Headers @{ "Authorization" = "Bearer $token" }

$videoId = $tasks.data.tasks[0].videoId
Write-Host "选择任务: $videoId"

# 3. Remix 视频
$remixResult = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks/$videoId/remix" `
  -Method Post `
  -Headers @{ 
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json" 
  } `
  -Body '{"prompt":"添加赛博朋克风格","model":"sora_video2"}'

Write-Host "Remix 结果:"
$remixResult | ConvertTo-Json -Depth 5
```

---

## 📚 相关文档

| 文档 | 路径 |
|------|------|
| BUG-001 修复 | `docs/v2/bugfix/🐛BUG-001-input_reference字段名修复.md` |
| BUG-002 修复 | `docs/v2/bugfix/🐛BUG-002-SSE连接URL不一致修复.md` |
| BUG-003 修复 | `docs/v2/bugfix/🐛BUG-003-本地任务重复与externalTaskId丢失修复.md` |
| Remix 设计方案 | `docs/v2/features/Remix功能设计.md` |
| 实现报告 | `docs/v2/features/Remix功能实现详情.md` |

---

## 🔗 参考资料

| 项目 | 用途 |
|------|------|
| LiteLLM (31K⭐) | Metadata Pattern 参考 |
| One API (27K⭐) | 中转层架构参考 |
| n8n | 任务轮询和重试机制参考 |

---

## ✅ 实现状态

- [x] Remix Controller 实现
- [x] Route 配置
- [x] Metadata Pattern 血缘存储
- [x] 轮询服务集成
- [x] SSE 实时推送
- [x] 前端 API Client
- [x] 错误处理
- [x] 文档完善


