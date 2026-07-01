-- 佳明数据处理 + 统一榜：RawActivity 审核状态 + Checkin 来源标记
-- See: .zcf/plan/current/garmin-runner-hub.md (方案 2 / 物理设计 2b)

-- RawActivity: 审核状态（pending=待处理 / imported=已导入榜单 / ignored=已忽略）
ALTER TABLE "RawActivity" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "RawActivity" ADD COLUMN "importedAt" TIMESTAMP(3);
ALTER TABLE "RawActivity" ADD COLUMN "importCheckinId" TEXT;
CREATE INDEX "RawActivity_userId_status_idx" ON "RawActivity"("userId", "status");

-- Checkin: 来源标记 + 运动类型（统一榜：手动打卡 + 佳明导入同表）
ALTER TABLE "Checkin" ADD COLUMN "dataSource" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Checkin" ADD COLUMN "garminActivityId" TEXT;
ALTER TABLE "Checkin" ADD COLUMN "sportType" TEXT;
-- nullable unique：Postgres 允许多个 NULL（手动打卡不冲突），佳明导入按 RawActivity.id 唯一
CREATE UNIQUE INDEX "Checkin_garminActivityId_key" ON "Checkin"("garminActivityId");
CREATE INDEX "Checkin_userId_sportType_date_idx" ON "Checkin"("userId", "sportType", "date");
