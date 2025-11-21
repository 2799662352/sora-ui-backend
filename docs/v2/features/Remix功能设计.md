# 🎨 视频 Remix (编辑) 功能 - 架构设计方案

## 1. 需求分析

用户希望在 `sora-ui` 中添加视频编辑 (Remix) 功能，允许基于已有的视频生成新的变体。

**外部 API 规范**:
- **URL**: `POST /sora/v1/videos/{video_id}/remix`
- **Header**: `Content-Type: application/json`
- **Body**: 
  ```json
  {
    "prompt": "新的提示词",
    "model": "sora_video2"
  }
  ```

## 2. 现有架构挑战

目前后端的 Relay 端点 (`/api/relay/sora/videos`) 设计为 **通用生成接口**，使用了 `multer` 处理 `multipart/form-data` (为了支持图片上传)。

虽然理论上可以用同一个端点处理 Remix，但存在以下问题：
1. **语义不符**: Remix 是对"特定视频"的操作，RESTful 风格应为 `POST /videos/:id/remix`。
2. **格式差异**: 生成接口强制 `multipart/form-data`，而 Remix 接口通常使用轻量级的 `application/json`。
3. **双 ID 逻辑**: Remix 需要先根据内部 `videoId` 查找对应的 `externalTaskId`，逻辑与纯生成不同。

## 3. 推荐方案：新增专用 Remix 端点

我们不修改现有的生成端点，而是新增一个专门处理编辑的端点。

### 3.1 API 设计

**前端调用**:
```http
POST /api/relay/sora/videos/:videoId/remix
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Change style to cyberpunk",
  "model": "sora_video2"
}
```

### 3.2 后端处理逻辑 (`soraRelayController.ts`)

1. **接收请求**: 获取 URL 中的 `videoId` (内部ID) 和 Body 中的 `prompt`。
2. **查找原任务**: 
   - 查询数据库 `VideoTask` 表。
   - 验证 `userId` (确保只能编辑自己的视频)。
   - 获取对应的 `externalTaskId`。
3. **调用外部 API**:
   - URL: `${SORA_API_BASE}/sora/v1/videos/${externalTaskId}/remix`
   - Method: `POST`
   - Body: JSON 数据
4. **处理响应**:
   - 获取新的 `externalTaskId` (Remix 会产生一个新的任务 ID)。
5. **保存新任务**:
   - 创建新的 `VideoTask` 记录。
   - **关键**: 记录 `parentId` (需要 Schema 变更) 或仅在 Prompt 中注明来源。
6. **启动轮询**:
   - 复用现有的 `startTaskPolling` 服务。

## 4. 数据库变更建议

为了更好地追踪视频的演变历史，建议在 `VideoTask` 表中添加父子关系字段。

**修改 `prisma/schema.prisma`**:

```prisma
model VideoTask {
  // ... 现有字段 ...

  // 🔥 新增：血缘关系
  parentId    String?       // 来源视频的内部 ID
  parent      VideoTask?    @relation("VideoRemixHistory", fields: [parentId], references: [id])
  children    VideoTask[]   @relation("VideoRemixHistory")
  
  // ...
}
```

*如果不希望修改数据库 Schema，也可以暂时将来源 ID 记录在 `metadata` JSON 字段中。*

## 5. 开发计划 (TODO)

1.  [ ] **数据库**: 添加 `parentId` 字段 (可选，或使用 metadata)。
2.  [ ] **后端**: 
    - 在 `soraRelayController.ts` 中添加 `remixSoraVideo` 函数。
    - 注册路由 `POST /api/relay/sora/videos/:videoId/remix`。
3.  [ ] **前端**:
    - 在 API 层添加 `remixVideo` 方法。
    - 在 UI 上添加 "编辑/Remix" 按钮。

## 6. 结论 (回答用户问题)

> 这个 编辑视频 的功能 是不是也可以 添加一下？

**是的，非常有必要添加。**

> 这个也是Relay端点需要 multipart/form-data 格式的格式吗？

**不需要。** 
根据 API 文档，Remix 接口明确使用 `application/json`。
我们应该在后端创建一个新的专用端点来处理 JSON 请求，而不是强行塞入现有的 `multipart/form-data` 处理器中。这样代码更清晰，性能更好。





