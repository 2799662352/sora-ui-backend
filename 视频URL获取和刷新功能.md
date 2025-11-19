# 🎬 视频 URL 获取和刷新功能

**实现时间**: 2025-11-13  
**关键特性**: 使用外部API ID + 支持URL刷新

---

## 🎯 核心设计

### 视频URL的正确构建方式

根据 API 文档：`http://45.8.22.95:8000`

```
GET /sora/v1/videos/{外部API的video_id}/content
```

**关键**：必须使用**外部API ID**，而不是后端ID！

---

## 📋 实现的功能

### 1️⃣ 任务完成时自动保存 URL

**时机**：任务状态变为 `completed` 时

**保存内容**：
```typescript
// 构建外部API的视频内容端点
const videoContentUrl = `${apiConfig.baseUrl}/v1/videos/${externalTaskId}/content`;

// 保存到数据库
await videoTaskRepository.updateTask(videoId, {
  videoUrl: videoContentUrl,  // 完整的外部API URL
  status: TaskStatus.COMPLETED,
  progress: 100,
  completedAt: new Date(),
  metadata: {
    externalTaskId: externalTaskId,
    externalVideoUrl: data.url,  // 原始响应中的相对URL
  }
});
```

**保存的URL示例**：
```
http://45.8.22.95:8000/sora/v1/videos/video_4df24bdc-4f66-4e02-a608-6ce4a12f154a/content
```

---

### 2️⃣ 获取视频内容 API

**端点**：`GET /api/video/tasks/:videoId/content`

**请求**：
```http
GET /api/video/tasks/video_e7a620c7-2829-40d8-bbfb-77891f4621cc/content
Authorization: Bearer {token}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",       // 后端ID
    "externalVideoId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a", // 外部API ID
    "url": "http://45.8.22.95:8000/sora/v1/videos/video_4df24bdc-4f66-4e02-a608-6ce4a12f154a/content"
  }
}
```

**前端使用**：
```javascript
const response = await fetch(`/api/video/tasks/${videoId}/content`, {
  headers: { Authorization: `Bearer ${token}` }
});
const { url } = response.data;

// 直接播放
<video src={url} controls />
```

---

### 3️⃣ 刷新视频 URL API（新功能）

**端点**：`POST /api/video/tasks/:videoId/refresh-url`

**用途**：
- ✅ URL 过期时重新获取
- ✅ 首次获取失败时重试
- ✅ 用户主动刷新
- ✅ 验证视频是否还可用

**请求**：
```http
POST /api/video/tasks/video_e7a620c7-2829-40d8-bbfb-77891f4621cc/refresh-url
Authorization: Bearer {token}
```

**响应**：
```json
{
  "success": true,
  "message": "视频URL已刷新",
  "data": {
    "videoId": "video_e7a620c7-2829-40d8-bbfb-77891f4621cc",
    "externalVideoId": "video_4df24bdc-4f66-4e02-a608-6ce4a12f154a",
    "videoUrl": "http://45.8.22.95:8000/sora/v1/videos/video_4df24bdc.../content",
    "status": "completed",
    "refreshedAt": "2025-11-13T10:30:00.000Z"
  }
}
```

**工作原理**：
1. 从数据库获取 `externalVideoId`
2. 重新查询外部API：`GET /v1/videos/{externalVideoId}`
3. 验证状态仍为 `completed`
4. 重新构建并保存最新的 `videoUrl`
5. 返回最新的URL给前端

---

## 🎬 完整使用流程

### 场景1：正常流程

```javascript
// 1. 创建任务
const createRes = await fetch('/api/video/tasks', {
  method: 'POST',
  body: JSON.stringify({ prompt: '...', model: 'sora_video2' })
});
const { videoId } = createRes.data;

// 2. WebSocket订阅（实时接收进度）
ws.send(JSON.stringify({
  type: 'subscribe_task',
  payload: { videoId }
}));

// 3. 接收完成推送
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'taskCompleted') {
    const { videoUrl, externalVideoId } = msg.payload.result;
    console.log('后端ID:', msg.payload.videoId);
    console.log('外部ID:', externalVideoId);
    console.log('视频URL:', videoUrl);
    
    // 直接播放
    playVideo(videoUrl);
  }
};

// 4. 或者查询获取
const contentRes = await fetch(`/api/video/tasks/${videoId}/content`);
const { url } = contentRes.data;
playVideo(url);
```

### 场景2：URL过期需要刷新

```javascript
// 用户点击"播放"时，发现URL过期（404或403）
try {
  await playVideo(oldUrl);
} catch (error) {
  if (error.status === 404 || error.status === 403) {
    // 刷新URL
    const refreshRes = await fetch(`/api/video/tasks/${videoId}/refresh-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const { videoUrl } = refreshRes.data;
    
    // 使用新URL播放
    await playVideo(videoUrl);
  }
}
```

### 场景3：批量刷新多个视频

```javascript
async function refreshAllVideos(videoIds) {
  const results = await Promise.all(
    videoIds.map(id => 
      fetch(`/api/video/tasks/${id}/refresh-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    )
  );
  
  return results.map(r => r.data);
}
```

---

## 🔍 技术细节

### URL 构建规则

**任务完成时**：
```typescript
// 使用外部API ID构建内容端点
const videoContentUrl = `${baseUrl}/v1/videos/${externalVideoId}/content`;

// ✅ 正确示例
http://45.8.22.95:8000/sora/v1/videos/video_4df24bdc-4f66-4e02-a608-6ce4a12f154a/content

// ❌ 错误示例（使用后端ID）
http://45.8.22.95:8000/sora/v1/videos/video_e7a620c7-2829-40d8-bbfb-77891f4621cc/content
```

### URL 存储策略

**数据库字段**：
```sql
"videoUrl" TEXT  -- 存储完整的外部API内容端点URL
```

**metadata 字段**：
```json
{
  "externalTaskId": "video_4df24bdc...",  // 外部API ID
  "externalVideoUrl": "/videos/xxx.mp4",  // 原始响应中的相对路径
  "lastRefreshed": "2025-11-13T10:30:00Z" // 最后刷新时间
}
```

---

## 📊 API 对比

### 两个 API 的区别

| API | 用途 | 特点 | 示例 |
|-----|------|------|------|
| **GET /tasks/:videoId/content** | 获取视频URL | 只读，不刷新 | 快速获取已保存的URL |
| **POST /tasks/:videoId/refresh-url** | 刷新视频URL | 重新查询外部API | URL过期时使用 |

---

## ✅ 完成的改进

### 1. 任务完成时正确保存 URL

**改进前**：
```typescript
// ❌ 可能保存不正确的URL
const videoUrl = data.url ? `${baseUrl}${data.url}` : undefined;
```

**改进后**：
```typescript
// ✅ 明确使用外部API ID构建内容端点
const videoContentUrl = `${baseUrl}/v1/videos/${externalTaskId}/content`;
```

### 2. WebSocket 推送包含完整URL

**taskCompleted 消息**：
```json
{
  "type": "taskCompleted",
  "payload": {
    "videoId": "video_e7a620c7...",
    "externalVideoId": "video_4df24bdc...",
    "result": {
      "videoUrl": "http://45.8.22.95:8000/sora/v1/videos/video_4df24bdc.../content"
    }
  }
}
```

### 3. 新增刷新端点

```http
POST /api/video/tasks/:videoId/refresh-url
```

---

## 🧪 测试

### PowerShell 测试

```powershell
# 1. 登录
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/auth/login" -Body '{"username":"admin","password":"admin123"}' -ContentType "application/json"
$token = $login.data.token

# 2. 获取视频URL
$content = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/api/video/tasks/{videoId}/content" -Headers @{Authorization="Bearer $token"}

Write-Host "后端ID: $($content.data.videoId)"
Write-Host "外部ID: $($content.data.externalVideoId)"
Write-Host "视频URL: $($content.data.url)"

# 3. 刷新URL（如果需要）
$refresh = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/video/tasks/{videoId}/refresh-url" -Headers @{Authorization="Bearer $token"}

Write-Host "刷新后URL: $($refresh.data.videoUrl)"
Write-Host "刷新时间: $($refresh.data.refreshedAt)"
```

### 浏览器测试

打开 `websocket-test.html`：
1. 连接 WebSocket
2. 快速登录
3. 创建任务并订阅
4. 等待任务完成
5. 点击 **"🔄 刷新视频URL"** 按钮
6. 查看刷新后的URL

---

## 📖 API 文档更新

### 新增端点

#### POST /api/video/tasks/:videoId/refresh-url

**说明**：重新从外部API获取视频URL

**请求头**：
```
Authorization: Bearer {token}
```

**路径参数**：
- `videoId` - 任务ID（后端数据库ID）

**响应**：
```json
{
  "success": true,
  "message": "视频URL已刷新",
  "data": {
    "videoId": "video_xxx",           // 后端ID
    "externalVideoId": "video_yyy",   // 外部API ID
    "videoUrl": "http://45.8.22.95:8000/sora/v1/videos/video_yyy/content",
    "status": "completed",
    "refreshedAt": "2025-11-13T10:30:00.000Z"
  }
}
```

**错误响应**：
- `400` - 任务未完成
- `404` - 任务不存在
- `403` - 无权访问
- `500` - 外部API查询失败

---

## 🎉 总结

### ✅ 已实现

- [x] 任务完成时保存正确的外部API视频URL
- [x] URL格式：`{baseUrl}/v1/videos/{externalVideoId}/content`
- [x] WebSocket推送包含完整URL
- [x] 新增刷新URL端点
- [x] 支持用户随时重新获取
- [x] 测试页面包含刷新按钮

### 🎯 URL 来源明确

| 阶段 | URL来源 | 示例 |
|------|--------|------|
| **任务完成** | 外部API ID + `/content` 端点 | `http://.../videos/{外部ID}/content` |
| **首次获取** | 数据库 `videoUrl` 字段 | 已保存的完整URL |
| **刷新URL** | 重新查询外部API | 最新的有效URL |

**所有URL都基于外部API ID，确保正确性！** ✅

