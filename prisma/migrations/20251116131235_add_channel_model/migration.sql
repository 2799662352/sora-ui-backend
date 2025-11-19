-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "models" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "group_name" TEXT,
    "rate_limit" INTEGER,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Channel_user_id_idx" ON "Channel"("user_id");

-- CreateIndex
CREATE INDEX "Channel_status_idx" ON "Channel"("status");

-- CreateIndex
CREATE INDEX "Channel_type_idx" ON "Channel"("type");

-- CreateIndex
CREATE INDEX "Channel_group_name_idx" ON "Channel"("group_name");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
