/*
  Warnings:

  - You are about to drop the column `taskId` on the `VideoTask` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "VideoTask_createdAt_idx";

-- DropIndex
DROP INDEX "VideoTask_status_idx";

-- DropIndex
DROP INDEX "VideoTask_userId_createdAt_idx";

-- DropIndex
DROP INDEX "VideoTask_userId_idx";

-- AlterTable
ALTER TABLE "VideoTask" DROP COLUMN "taskId",
ADD COLUMN     "externalTaskId" TEXT,
ADD COLUMN     "promptHash" TEXT,
ADD COLUMN     "promptPreview" VARCHAR(200),
ALTER COLUMN "prompt" DROP NOT NULL,
ALTER COLUMN "metadata" DROP NOT NULL,
ALTER COLUMN "metadata" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "VideoTask_externalTaskId_idx" ON "VideoTask"("externalTaskId");

-- CreateIndex
CREATE INDEX "VideoTask_status_createdAt_idx" ON "VideoTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VideoTask_promptHash_idx" ON "VideoTask"("promptHash");
