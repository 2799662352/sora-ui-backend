# 🔧 修复 metadata 字段引用

## 问题
精简版 Schema 将 `externalTaskId` 提升为顶级字段，删除了 `metadata` 字段，但代码中还在使用 `task.metadata`。

## 需要修改的文件

1. `src/services/videoTaskService.ts` - 多处使用 metadata
2. `src/services/websocketService.ts` - 使用 metadata
3. `src/routes/videoTask.ts` - 使用 metadata

## 修改规则

### ✅ 将 metadata.externalTaskId 改为 externalTaskId
```typescript
// ❌ 旧代码
const metadata = task.metadata as any;
const externalTaskId = metadata?.externalTaskId;

// ✅ 新代码
const externalTaskId = task.externalTaskId;
```

### ✅ 删除 metadata 更新
```typescript
// ❌ 旧代码
await videoTaskRepository.updateTask(videoId, {
  status: TaskStatus.COMPLETED,
  metadata: {
    ...(task.metadata as object || {}),
    externalTaskId: data.id,
  },
});

// ✅ 新代码
await videoTaskRepository.updateTask(videoId, {
  status: TaskStatus.COMPLETED,
  externalTaskId: data.id,
});
```

### ✅ 删除 metadata 依赖的逻辑
```typescript
// ❌ 旧代码
if (!metadata?.externalTaskId) { ... }

// ✅ 新代码
if (!task.externalTaskId) { ... }
```

## 批量替换脚本

```bash
# 使用 sed 或手动替换所有引用

