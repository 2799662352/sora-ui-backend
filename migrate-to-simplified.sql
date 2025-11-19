-- 🔥 数据库迁移脚本：从完整版迁移到精简版
-- 
-- 目标：
-- 1. 保留所有现有任务数据
-- 2. 提取核心字段到新表
-- 3. 丢弃大额数据字段
-- 4. 确保数据完整性

-- ============================================================
-- Step 1: 创建新的精简表
-- ============================================================

CREATE TABLE IF NOT EXISTS "VideoTask_simplified" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "videoId" TEXT NOT NULL UNIQUE,
  "externalTaskId" TEXT,
  
  -- 用户关联
  "userId" TEXT NOT NULL,
  
  -- 核心状态
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  
  -- 基本信息
  "model" TEXT NOT NULL,
  "apiConfigId" TEXT,
  "mediaType" TEXT NOT NULL DEFAULT 'VIDEO',
  
  -- Prompt 摘要
  "promptHash" TEXT,
  "promptPreview" TEXT,
  
  -- 错误信息
  "errorCode" TEXT,
  "errorMessage" TEXT,
  
  -- 时间戳
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3)
);

-- ============================================================
-- Step 2: 迁移数据（提取核心字段）
-- ============================================================

INSERT INTO "VideoTask_simplified" (
  id, 
  videoId, 
  externalTaskId,
  userId, 
  status, 
  progress,
  model, 
  apiConfigId, 
  mediaType,
  promptHash,
  promptPreview,
  errorCode, 
  errorMessage,
  createdAt, 
  updatedAt, 
  completedAt
)
SELECT 
  id, 
  videoId,
  -- 从 metadata 中提取 externalTaskId
  COALESCE(
    (metadata->>'externalTaskId')::text,
    taskId
  ) as externalTaskId,
  userId,
  status::text,
  progress,
  model,
  apiConfigId,
  mediaType::text,
  -- 生成 promptHash（使用 MD5 作为简化版）
  MD5(prompt) as promptHash,
  -- 截取 prompt 前 200 字符
  SUBSTRING(prompt FROM 1 FOR 200) as promptPreview,
  errorCode,
  errorMessage,
  createdAt,
  updatedAt,
  completedAt
FROM "VideoTask"
WHERE 1=1;

-- 验证数据迁移
SELECT 
  COUNT(*) as total_migrated,
  COUNT(DISTINCT userId) as unique_users,
  COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks,
  COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END) as processing_tasks
FROM "VideoTask_simplified";

-- ============================================================
-- Step 3: 备份旧表并切换
-- ============================================================

-- 重命名旧表（保留备份）
ALTER TABLE "VideoTask" RENAME TO "VideoTask_backup_20251115";

-- 重命名新表为正式表名
ALTER TABLE "VideoTask_simplified" RENAME TO "VideoTask";

-- ============================================================
-- Step 4: 创建索引
-- ============================================================

CREATE INDEX "VideoTask_videoId_idx" ON "VideoTask"("videoId");
CREATE INDEX "VideoTask_externalTaskId_idx" ON "VideoTask"("externalTaskId");
CREATE INDEX "VideoTask_userId_idx" ON "VideoTask"("userId");
CREATE INDEX "VideoTask_status_idx" ON "VideoTask"("status");
CREATE INDEX "VideoTask_createdAt_idx" ON "VideoTask"("createdAt");
CREATE INDEX "VideoTask_mediaType_idx" ON "VideoTask"("mediaType");
CREATE INDEX "VideoTask_userId_status_idx" ON "VideoTask"("userId", "status");
CREATE INDEX "VideoTask_status_createdAt_idx" ON "VideoTask"("status", "createdAt");
CREATE INDEX "VideoTask_promptHash_idx" ON "VideoTask"("promptHash");

-- ============================================================
-- Step 5: 添加外键约束
-- ============================================================

ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Step 6: 验证迁移结果
-- ============================================================

-- 验证记录数匹配
SELECT 
  '迁移前' as stage,
  COUNT(*) as task_count
FROM "VideoTask_backup_20251115"
UNION ALL
SELECT 
  '迁移后' as stage,
  COUNT(*) as task_count
FROM "VideoTask";

-- 验证数据完整性
SELECT 
  '有 externalTaskId' as check_type,
  COUNT(*) as count
FROM "VideoTask" 
WHERE externalTaskId IS NOT NULL
UNION ALL
SELECT 
  '有 promptPreview' as check_type,
  COUNT(*) as count
FROM "VideoTask" 
WHERE promptPreview IS NOT NULL;

-- ============================================================
-- 🎉 迁移完成！
-- ============================================================

-- 如果验证通过，可以删除备份表（可选）：
-- DROP TABLE "VideoTask_backup_20251115";

-- 查看新表大小
SELECT 
  pg_size_pretty(pg_total_relation_size('VideoTask')) as new_table_size,
  pg_size_pretty(pg_total_relation_size('VideoTask_backup_20251115')) as old_table_size;

