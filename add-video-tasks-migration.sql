-- 添加视频任务表的 SQL 迁移脚本
-- 运行方式: psql -U your_username -d your_database -f add-video-tasks-migration.sql

-- 创建 TaskStatus 枚举类型
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- 创建 MediaType 枚举类型
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE');

-- 创建视频任务表
CREATE TABLE IF NOT EXISTS "video_tasks" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    
    -- 请求参数
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "size" TEXT,
    "duration" INTEGER,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "aspectRatio" TEXT,
    "referenceImage" TEXT,
    
    -- API 配置
    "apiConfigId" TEXT,
    "apiEndpoint" TEXT,
    
    -- 结果数据
    "videoUrl" TEXT,
    "imageUrl" TEXT,
    "mediaType" "MediaType" NOT NULL DEFAULT 'VIDEO',
    
    -- 任务元数据
    "taskId" TEXT,
    "isAsync" BOOLEAN NOT NULL DEFAULT false,
    "pollCount" INTEGER NOT NULL DEFAULT 0,
    "lastPollTime" TIMESTAMP(3),
    
    -- 错误信息
    "errorCode" TEXT,
    "errorMessage" TEXT,
    
    -- 时间戳
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    
    -- 额外数据
    "metadata" JSONB NOT NULL DEFAULT '{}',
    
    CONSTRAINT "video_tasks_pkey" PRIMARY KEY ("id")
);

-- 创建唯一索引
CREATE UNIQUE INDEX "video_tasks_videoId_key" ON "video_tasks"("videoId");

-- 创建普通索引
CREATE INDEX "video_tasks_userId_idx" ON "video_tasks"("userId");
CREATE INDEX "video_tasks_status_idx" ON "video_tasks"("status");
CREATE INDEX "video_tasks_createdAt_idx" ON "video_tasks"("createdAt");
CREATE INDEX "video_tasks_userId_status_idx" ON "video_tasks"("userId", "status");
CREATE INDEX "video_tasks_userId_createdAt_idx" ON "video_tasks"("userId", "createdAt");

-- 添加外键约束
ALTER TABLE "video_tasks" ADD CONSTRAINT "video_tasks_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 创建更新时间触发器（PostgreSQL）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_video_tasks_updated_at BEFORE UPDATE
    ON "video_tasks" FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 授予权限（如果需要）
-- GRANT ALL PRIVILEGES ON TABLE "video_tasks" TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- 查看创建的表结构
\d "video_tasks";
