-- 清理旧任务（videoUrl 还是旧的 /content 端点）
-- 执行此SQL后，重新创建任务即可获取真实视频URL

-- 方案 1: 删除所有任务（推荐）
TRUNCATE TABLE "video_tasks" CASCADE;

-- 方案 2: 只删除已完成的旧任务
-- DELETE FROM "video_tasks" WHERE status = 'COMPLETED' AND "videoUrl" LIKE '%/content%';

-- 方案 3: 更新已完成任务的 videoUrl 为 NULL（让系统重新获取）
-- UPDATE "video_tasks" SET "videoUrl" = NULL WHERE status = 'COMPLETED';

-- 查看当前任务
SELECT id, "videoId", status, progress, "videoUrl" FROM "video_tasks" ORDER BY "createdAt" DESC LIMIT 10;

