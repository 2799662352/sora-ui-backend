# 🐛 BUG-003: 本地任务重复与 externalTaskId 丢失修复

## 问题描述

### Bug 1: 本地生成历史任务重复
- **现象**: 在 `electron:dev` 模式下，后端任务会重复记录在本地生成历史中
- **详情**: 
  - 任务开始时，本地生成历史会生成一个任务
  - 这个任务不会随着后端任务更新状态
  - 后端任务完成时，又会有一个真实状态的后端任务出现
  - 导致第一个本地任务永久处于 "generating" 状态

### Bug 2: externalTaskId 丢失
- **现象**: Web 版本刷新后 `externalTaskId` 丢失
- **详情**: 
  - `externalTaskId` 存储在本地内存中
  - 刷新页面后丢失，导致 Remix 功能无法使用

## 根本原因分析

### ID 格式不匹配
- **前端任务 ID**: 时间戳格式，如 `1764291396110`
- **后端任务 ID**: `video_{Date.now()}_{random}` 格式，如 `video_1764291402480_4xj89sk`

### 时间差问题
```
前端创建任务: 1764291396110 (08:56:36.110)
后端返回 ID:  video_1764291402480_4xj89sk (08:56:42.480)
时间差: 6.37 秒
```

### 匹配失败
- 前端使用时间戳 ID 保存任务
- 后端返回不同格式的 ID
- SSE 更新时无法匹配到原始任务
- 导致任务重复

## 解决方案: clientRequestId 机制

### 核心思想
前端在创建任务时生成一个 `clientRequestId`，传给后端保存。这样无论何时退出/刷新，都能通过 `clientRequestId` 关联本地任务和后端任务。

这是分布式系统的最佳实践：**幂等性 key / correlation ID**

### 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                         clientRequestId 数据流                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [前端]                                                              │
│    │                                                                │
│    │ 1. 创建任务，生成 clientRequestId = "1764291396110"             │
│    │                                                                │
│    ▼                                                                │
│  [API 调用] ──────────────────────────────────────────────────────► │
│    │         POST /api/relay/sora/videos                            │
│    │         body: { prompt, model, clientRequestId }               │
│    │                                                                │
│    ▼                                                                │
│  [后端 Controller]                                                   │
│    │                                                                │
│    │ 2. 接收 clientRequestId，保存到数据库                           │
│    │                                                                │
│    ▼                                                                │
│  [PostgreSQL]                                                        │
│    │  VideoTask {                                                   │
│    │    id: "video_1764291402480_4xj89sk",                          │
│    │    clientRequestId: "1764291396110",  ← 关联字段               │
│    │    externalTaskId: "video_8efddf51-...",                       │
│    │  }                                                             │
│    │                                                                │
│    ▼                                                                │
│  [Redis 轮询缓存]                                                    │
│    │  polling:video_1764291402480_4xj89sk {                         │
│    │    videoId: "video_1764291402480_4xj89sk",                     │
│    │    clientRequestId: "1764291396110",  ← 关联字段               │
│    │    externalTaskId: "video_8efddf51-...",                       │
│    │  }                                                             │
│    │                                                                │
│    ▼                                                                │
│  [SSE 推送]                                                          │
│    │  {                                                             │
│    │    videoId: "video_1764291402480_4xj89sk",                     │
│    │    clientRequestId: "1764291396110",  ← 用于匹配               │
│    │    status: "COMPLETED",                                        │
│    │    videoUrl: "http://..."                                      │
│    │  }                                                             │
│    │                                                                │
│    ▼                                                                │
│  [前端 App.tsx]                                                      │
│    │                                                                │
│    │ 3. 使用 clientRequestId 匹配本地任务                            │
│    │    if (payload.clientRequestId === token.id) → 匹配成功!       │
│    │                                                                │
│    ▼                                                                │
│  [更新本地任务状态] ✅                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 修改文件清单

### 后端修改

| 文件 | 修改内容 |
|------|----------|
| `prisma/schema.prisma` | 添加 `clientRequestId` 字段和索引 |
| `src/controllers/soraRelayController.ts` | 接收、保存、返回 `clientRequestId` |
| `src/services/sseService.ts` | `TaskUpdatePayload` 添加 `clientRequestId` |
| `src/services/taskPollingService.ts` | `TaskDetails` 添加 `clientRequestId`，Redis 缓存和 SSE 推送 |

### 前端修改

| 文件 | 修改内容 |
|------|----------|
| `src/types/index.ts` | `SoraRequest` 添加 `clientRequestId` |
| `src/api/sora.ts` | FormData 添加 `clientRequestId` |
| `src/components/VideoGenerator.tsx` | 传递 `taskId` 作为 `clientRequestId` |
| `src/App.tsx` | 任务匹配优先使用 `clientRequestId` |

### 配置修改

| 文件 | 修改内容 |
|------|----------|
| `docker-compose.yml` | Redis 密码、后端镜像版本 |

## Docker 镜像

| 标签 | 状态 | 说明 |
|------|------|------|
| `zuozuoliang999/sora-ui-backend:1.6.0-clientRequestId` | ✅ 已推送 | BUG-003 修复版本 |
| `zuozuoliang999/sora-ui-backend:latest` | ✅ 已推送 | 最新版本 |

## MCP 工具验证（2025-11-28 已验证）

### Redis MCP ✅
```bash
mcp_redis_info()
# → Redis 7.4.7, 内存 1.21M/256M, 运行正常

mcp_redis_dbsize()
# → 0 keys (当前无活跃轮询任务)

mcp_redis_scan_keys(pattern="polling:*")
# → 查看轮询任务
```

### DockerHub MCP ✅
```bash
mcp_dockerhub_getRepositoryInfo(namespace="zuozuoliang999", repository="sora-ui-backend")
# → 仓库存在, 550 次拉取, 活跃状态

mcp_dockerhub_listRepositoryTags(namespace="zuozuoliang999", repository="sora-ui-backend")
# → 26 个标签，包含 1.6.0-clientRequestId
```

### PostgreSQL MCP ✅
```sql
SELECT COUNT(*) as total, 
       COUNT("clientRequestId") as with_client_id,
       COUNT("externalTaskId") as with_external_id 
FROM "VideoTask";
# → total: 469, with_client_id: 0, with_external_id: 400
# 注：clientRequestId 为 0 是因为旧任务没有此字段，新任务会有
```

## 🔥 增强修复：任务执行中重启恢复（2025-11-28）

### 问题场景
任务执行过程中重启（前端还没收到后端的 `backendVideoId`），导致：
- 本地任务只有 `clientRequestId`，没有 `backendVideoId`
- 重启后无法匹配后端任务
- 出现任务重复

### 解决方案

#### 后端新增 API
```typescript
// POST /api/video/tasks/recover
// 通过 clientRequestId 批量查询任务
router.post('/tasks/recover', authMiddleware, async (req, res) => {
  const { clientRequestIds } = req.body;
  const tasks = await videoTaskRepository.findByClientRequestIds(clientRequestIds, userId);
  // 返回匹配的任务列表
});
```

#### 前端启动时恢复
```typescript
// App.tsx - 启动时恢复 generating 任务
useEffect(() => {
  const generatingTasks = taskTokens.filter(t => 
    t.status === 'generating' && !t.backendVideoId
  );
  
  if (generatingTasks.length > 0) {
    const clientRequestIds = generatingTasks.map(t => t.id);
    const result = await recoverTasks(clientRequestIds, token);
    
    // 更新本地任务的 backendVideoId
    result.tasks.forEach(backendTask => {
      updateToken(backendTask.clientRequestId, {
        backendVideoId: backendTask.videoId,
        externalTaskId: backendTask.externalTaskId,
      });
    });
  }
}, [taskTokens.length]);
```

### 新增文件

| 文件 | 修改内容 |
|------|----------|
| `src/repositories/videoTaskRepository.ts` | 添加 `findByClientRequestIds` 方法 |
| `src/routes/videoTask.ts` | 添加 `POST /api/video/tasks/recover` 路由 |
| `src/api/backend-api.ts` (前端) | 添加 `recoverTasks` 函数 |
| `src/App.tsx` (前端) | 添加启动时任务恢复逻辑 |

## 🔥 增强修复：历史同步时的 clientRequestId 匹配（2025-11-28）

### 问题场景
即使后端 recover API 正常工作，但历史同步时仍会创建重复任务：
- `backendHistorySync.ts` 的 `mergeBackendHistoryWithLocal` 只通过 `id` 匹配
- 本地任务 `id` 是 `1764307915985`（clientRequestId）
- 后端任务 `id` 是 `video_1764307918186_v46bozj`（videoId）
- 两者不匹配，导致后端任务被视为新任务

### 解决方案

#### 1. backendHistorySync.ts 修复
```typescript
// 🔥 BUG-003 修复：创建 clientRequestId -> 本地任务 的映射
const localByClientRequestId = new Map<string, VideoGeneration>();
localHistory.forEach(item => {
  localByClientRequestId.set(item.id, item);
});

// 合并时优先通过 clientRequestId 匹配
const clientRequestId = backendItem.clientRequestId || backendItem.metadata?.clientRequestId;
if (!existingItem && clientRequestId) {
  existingItem = localByClientRequestId.get(clientRequestId);
  if (existingItem) {
    // 匹配成功，更新本地任务而不是创建新任务
    const mergedItem = {
      ...backendItem,
      id: existingItem.id,  // 保持本地 id
      backendVideoId: backendItem.id,  // 保存后端 videoId
    };
    merged.set(existingItem.id, mergedItem);
  }
}
```

#### 2. BackendTaskList.tsx 修复
```typescript
// 🔥 BUG-003 修复：保留 clientRequestId 和 backendVideoId
const localRecords = completedTasks.map(task => ({
  id: task.videoId,
  clientRequestId: task.clientRequestId,  // 🔥 保留
  backendVideoId: task.videoId,  // 🔥 保留
  // ...
}));

// 智能合并时通过 clientRequestId 匹配
const clientRequestIdMap = new Map(
  existingTasks
    .filter(t => t.id && !t.id.startsWith('video_'))
    .map(t => [t.id, t])
);

if (!existing && clientRequestId) {
  existing = clientRequestIdMap.get(clientRequestId);
  if (existing) {
    // 更新本地任务，保持本地 id
    const mergedTask = {
      ...existing,
      ...task,
      id: existing.id,
      backendVideoId: task.id,
    };
    taskMap.set(existing.id, mergedTask);
  }
}
```

### 新增/修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/backendHistorySync.ts` | 添加 `clientRequestId` 匹配逻辑 |
| `src/components/TaskList/BackendTaskList.tsx` | 同步时保留 `clientRequestId`，智能合并 |

## 测试验证

| 测试场景 | 验证步骤 |
|----------|----------|
| **正常流程** | 创建任务 → 查看日志 → 等待完成 → 验证无重复 |
| **刷新测试** | 创建任务 → 刷新页面 → 验证状态恢复 → 无重复 |
| **重启测试** | 创建任务 → 重启客户端 → 验证状态恢复 → 无重复 |
| **🔥 执行中重启** | 创建任务 → 任务执行中重启 → 验证自动恢复 backendVideoId → 无重复 |
| **🔥 历史同步** | 登录后自动同步 → 验证通过 clientRequestId 匹配 → 无重复 |

## 修复信息

| 项目 | 内容 |
|------|------|
| **初始修复** | 2025-11-28 (clientRequestId 机制) |
| **增强修复 1** | 2025-11-28 (执行中重启恢复) |
| **增强修复 2** | 2025-11-28 (历史同步 clientRequestId 匹配) |
| **修复版本** | 1.6.1-clientRequestId-recover |
| **修复人** | AI Assistant + 用户协作 |

## 参考资料

- [LiteLLM Redis Cache 实现](https://github.com/BerriAI/litellm/blob/main/litellm/caching/redis_cache.py)
- [分布式系统幂等性设计](https://docs.microsoft.com/en-us/azure/architecture/patterns/idempotent-operation)
- [Correlation ID 模式](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CorrelationIdentifier.html)

## 相关文档

- [MCP 工具配置说明](../mcp/MCP-工具配置说明.md)
