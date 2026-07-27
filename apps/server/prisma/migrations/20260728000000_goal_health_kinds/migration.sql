-- V0.3.7 健康目标闭环（清单 2026-07-26 #30）：Goal 加 5 字段支持 6 类 health kind
-- kind：distance | volume | weight_loss | weight_gain | sleep | mood | sugar | dampness
-- 老目标默认 kind='distance'（兼容）；volume 目标后续按 targetVolume!=null 推断 kind='volume'（数据迁移可省，service 层兜底）

ALTER TABLE "Goal" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'distance';
ALTER TABLE "Goal" ADD COLUMN "targetValue" DOUBLE PRECISION;
ALTER TABLE "Goal" ADD COLUMN "currentValue" DOUBLE PRECISION;
ALTER TABLE "Goal" ADD COLUMN "unit" TEXT;
ALTER TABLE "Goal" ADD COLUMN "judgeCriteria" TEXT;
