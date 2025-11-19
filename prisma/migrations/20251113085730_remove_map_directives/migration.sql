/*
  Warnings:

  - You are about to drop the `activity_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `licenses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_configs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `video_tasks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "licenses" DROP CONSTRAINT "licenses_userId_fkey";

-- DropForeignKey
ALTER TABLE "video_tasks" DROP CONSTRAINT "video_tasks_userId_fkey";

-- DropTable
DROP TABLE "activity_logs";

-- DropTable
DROP TABLE "licenses";

-- DropTable
DROP TABLE "system_configs";

-- DropTable
DROP TABLE "users";

-- DropTable
DROP TABLE "video_tasks";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "type" "LicenseType" NOT NULL,
    "userId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deviceId" TEXT,
    "features" JSONB NOT NULL DEFAULT '{}',
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTask" (
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

    CONSTRAINT "VideoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "License_userId_key" ON "License"("userId");

-- CreateIndex
CREATE INDEX "License_licenseKey_idx" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_userId_idx" ON "License"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "VideoTask_videoId_key" ON "VideoTask"("videoId");

-- CreateIndex
CREATE INDEX "VideoTask_videoId_idx" ON "VideoTask"("videoId");

-- CreateIndex
CREATE INDEX "VideoTask_userId_idx" ON "VideoTask"("userId");

-- CreateIndex
CREATE INDEX "VideoTask_status_idx" ON "VideoTask"("status");

-- CreateIndex
CREATE INDEX "VideoTask_createdAt_idx" ON "VideoTask"("createdAt");

-- CreateIndex
CREATE INDEX "VideoTask_userId_status_idx" ON "VideoTask"("userId", "status");

-- CreateIndex
CREATE INDEX "VideoTask_userId_createdAt_idx" ON "VideoTask"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
