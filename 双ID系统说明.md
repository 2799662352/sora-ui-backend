# 🆔 双 ID 系统设计说明

**更新时间**: 2025-11-13  
**架构决策**: 保持双ID系统，确保逻辑正确

---

## 📋 两个 ID 的作用

### 1️⃣ **后端数据库 ID** (videoId)

**格式**：`video_xxx-xxx-xxx-xxx`（UUID）

**生成时机**：后端创建任务记录时

**用途**：
- ✅ 数据库主键
- ✅ 前端查询任务的唯一标识
- ✅ API 路由参数：`/api/video/tasks/:videoId`
- ✅ WebSocket 订阅参数

**示例**：
```
video_e7a620c7-2829-40d8-bbfb-77891f4621cc
```

---

### 2️⃣ **外部 Sora API ID** (externalVideoId)

**格式**：`video_xxx-xxx-xxx-xxx`（由外部API生成）

**生成时机**：提交任务到外部 Sora API 后

**用途**：
- ✅ 后台轮询外部API状态
- ✅ 直接访问外部API资源
- ✅ 存储在 `metadata.externalTaskId` 中
- ✅ WebSocket 推送时同时返回（透明化）

**示例**：
```
video_4df24bdc-4f66-4e02-a608-6ce4a12f154a
```

---

## 🔗 ID 映射关系

```
后端数据库
┌─────────────────────────────────────────┐
│ VideoTask                               │
├─────────────────────────────────────────┤
│ videoId: video_e7a620c7... (主键)       │  ← 前端使用这个查询
│ userId: 1f081744-...                    │
│ status: PROCESSING                      │
│ progress: 65%                           │
│ videoUrl: http://45.8.22.95/videos/...  │  ← 完整URL（来自外部）
│ metadata: {                             │
│   externalTaskId: video_4df24bdc...     │  ← 外部API ID
│   createdAt: 1763027892                 │
│ }                                       │
└─────────────────────────────────────────┘
         │
         │ 关联关系
         ▼
外部 Sora API
┌─────────────────────────────────────────┐
│ 视频生成任务                             │
├─────────────────────────────────────────┤
│ id: video_4df24bdc...                   │  ← 外部系统的主键
│ status: completed                       │
│ progress: 100                           │
│ url: /videos/xxx.mp4                    │
└─────────────────────────────────────────┘
```

---

## 📡 API 响应中的双 ID

### 1. 创建任务

**请求**：
```http
POST /api/video/tasks
{
  "prompt": "测试视频",
  "model": "sora_video2"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",  // 后端ID
    "status": "QUEUED",
    "progress": 0,
    // 注意：此时还没有 externalVideoId（异步提交中）
  }
}
```

### 2. 查询任务状态

**请求**：
```http
GET /api/video/tasks/video_e7a620c7-2829-40d8-bbfb-77891f4621cc
```

**响应**：
```json
{
  "success": true,
  "data": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",  // 后端ID
    "status": "PROCESSING",
    "progress": 65,
    "metadata": {
      "externalTaskId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a"  // 外部API ID
    }
  }
}
```

### 3. 获取视频内容

**请求**：
```http
GET /api/video/tasks/video_e7a620c7-2829-40d8-bbfb-77891f4621cc/content
```

**响应**：
```json
{
  "success": true,
  "data": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",       // 后端ID
    "externalVideoId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a",  // 外部API ID
    "url": "http://45.8.22.95:8000/sora/videos/xxx.mp4"           // 完整视频URL
  }
}
```

**注意**：`url` 字段已经是完整的外部API URL，可以直接播放！

---

## 🔌 WebSocket 推送中的双 ID

### 进度更新

```json
{
  "type": "taskProgress",
  "timestamp": 1763027892000,
  "payload": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",       // 后端ID
    "externalVideoId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a", // 外部API ID
    "status": "in_progress",
    "progress": 65,
    "message": "正在生成视频..."
  }
}
```

### 任务完成

```json
{
  "type": "taskCompleted",
  "timestamp": 1763027892000,
  "payload": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",       // 后端ID
    "externalVideoId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a", // 外部API ID
    "status": "completed",
    "progress": 100,
    "result": {
      "videoUrl": "http://45.8.22.95:8000/sora/videos/xxx.mp4"    // 使用外部API的完整URL
    }
  }
}
```

---

## 💡 为什么需要双 ID？

### ✅ 优点：

1. **解耦系统**
   - 后端独立管理任务记录
   - 即使外部API更换，本地记录不变

2. **可追溯性**
   - 清晰的映射关系
   - 方便调试和问题排查

3. **灵活性**
   - 支持多个外部API（未来可扩展）
   - 同一任务可以有不同的外部ID（重试场景）

4. **一致性**
   - 前端始终使用后端ID
   - 内部逻辑使用外部ID

### 🎯 使用建议：

| 场景 | 使用哪个 ID |
|------|-----------|
| **前端查询任务** | 后端 ID (videoId) |
| **前端订阅 WebSocket** | 后端 ID (videoId) |
| **播放视频** | 完整 URL（来自 videoUrl 字段）|
| **后台轮询进度** | 外部 ID (externalVideoId) |
| **直接访问外部资源** | 外部 ID (externalVideoId) |
| **调试/日志** | 两个都显示 |

---

## 🎬 完整工作流程

```
1. 前端创建任务
   ├─> POST /api/video/tasks
   └─> 返回：videoId (后端ID)

2. 后端提交到外部API
   ├─> POST http://45.8.22.95:8000/sora/v1/videos
   └─> 返回：externalVideoId (外部API ID)
   
3. 存储映射关系
   ├─> 数据库：videoId (主键)
   └─> metadata: { externalTaskId: externalVideoId }

4. WebSocket 推送进度
   ├─> type: taskProgress
   └─> payload: { videoId, externalVideoId, progress }

5. 前端接收
   ├─> 显示：videoId (用户看到)
   ├─> 显示：externalVideoId (技术信息)
   └─> 使用：videoUrl (直接播放)

6. 后台轮询
   ├─> GET http://45.8.22.95:8000/sora/v1/videos/{externalVideoId}
   └─> 使用：externalVideoId

7. 获取视频内容
   ├─> GET /api/video/tasks/{videoId}/content
   └─> 返回：{ videoId, externalVideoId, url }
```

---

## 📊 控制台日志改进

**修改前**：
```
[WS] 📤 广播任务更新: video_e7a620c7-2829-40d8-bbfb-77891f4621cc -> 1 个客户端
```

**修改后**：
```
[WS] 📤 广播: video_e7a620c7-... (外部: video_4df24bdc-...) -> 1 客户端
```

---

## ✅ 已实现功能

- [x] 所有 WebSocket 推送包含双 ID
- [x] 控制台日志显示双 ID
- [x] API 响应包含双 ID（需要时）
- [x] 测试页面展示双 ID
- [x] 视频 URL 使用外部API的完整路径
- [x] camelCase 驼峰命名统一

**系统已优化完成！** 🎉

