-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "active_requests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "avg_latency_ms" INTEGER,
ADD COLUMN     "budget_reset_at" TIMESTAMP(3),
ADD COLUMN     "cooldown_until" TIMESTAMP(3),
ADD COLUMN     "failure_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_healthy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_failed_at" TIMESTAMP(3),
ADD COLUMN     "max_budget" DOUBLE PRECISION,
ADD COLUMN     "max_parallel_reqs" INTEGER,
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "model_spend" JSONB DEFAULT '{}',
ADD COLUMN     "soft_budget" DOUBLE PRECISION,
ADD COLUMN     "spend_month" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "spend_today" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "tpm_limit" BIGINT;

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_group" TEXT,
    "call_type" TEXT NOT NULL DEFAULT 'completion',
    "custom_provider" TEXT,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "response_time_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "http_status" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestLog_request_id_key" ON "RequestLog"("request_id");

-- CreateIndex
CREATE INDEX "RequestLog_channel_id_idx" ON "RequestLog"("channel_id");

-- CreateIndex
CREATE INDEX "RequestLog_user_id_idx" ON "RequestLog"("user_id");

-- CreateIndex
CREATE INDEX "RequestLog_model_idx" ON "RequestLog"("model");

-- CreateIndex
CREATE INDEX "RequestLog_start_time_idx" ON "RequestLog"("start_time");

-- CreateIndex
CREATE INDEX "RequestLog_status_idx" ON "RequestLog"("status");

-- CreateIndex
CREATE INDEX "Channel_is_healthy_idx" ON "Channel"("is_healthy");

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
