-- V0.2.129 力量计划目标场次（targetSessions）
-- StrengthSession 累加统计场次，与 V0.2.128 的 targetKm=0 共存
-- Running 计划 targetSessions=null（沿用 distance 进度）；strength 计划按 weeks × 3/4 估

ALTER TABLE "TrainingPlan" ADD COLUMN "targetSessions" INTEGER;
