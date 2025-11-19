-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE');

-- CreateTable
CREATE TABLE "video_tasks" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "size" TEXT,
    "duration" INTEGER,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "aspectRatio" TEXT,
    "referenceImage" TEXT,
    "apiConfigId" TEXT,
    "apiEndpoint" TEXT,
    "videoUrl" TEXT,
    "imageUrl" TEXT,
    "mediaType" "MediaType" NOT NULL DEFAULT 'VIDEO',
    "taskId" TEXT,
    "isAsync" BOOLEAN NOT NULL DEFAULT false,
    "pollCount" INTEGER NOT NULL DEFAULT 0,
    "lastPollTime" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "video_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_tasks_videoId_key" ON "video_tasks"("videoId");

-- CreateIndex
CREATE INDEX "video_tasks_videoId_idx" ON "video_tasks"("videoId");

-- CreateIndex
CREATE INDEX "video_tasks_userId_idx" ON "video_tasks"("userId");

-- CreateIndex
CREATE INDEX "video_tasks_status_idx" ON "video_tasks"("status");

-- CreateIndex
CREATE INDEX "video_tasks_createdAt_idx" ON "video_tasks"("createdAt");

-- CreateIndex
CREATE INDEX "video_tasks_userId_status_idx" ON "video_tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "video_tasks_userId_createdAt_idx" ON "video_tasks"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "video_tasks" ADD CONSTRAINT "video_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
