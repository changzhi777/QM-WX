-- V0.2.124 goal 支持力量训练目标（targetVolume 容量目标）
-- kind 隐式判定：targetVolume != null → volume（StrengthSession.totalVolume 聚合）；否则 distance（Checkin.distance 聚合）
-- targetDistance 改为 default 0（volume 目标占位用；distance 目标正常传值）

ALTER TABLE "Goal" ALTER COLUMN "targetDistance" SET DEFAULT 0;
ALTER TABLE "Goal" ADD COLUMN "targetVolume" DOUBLE PRECISION;
