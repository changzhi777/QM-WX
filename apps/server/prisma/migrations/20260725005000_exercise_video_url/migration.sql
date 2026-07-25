-- V0.2.141 动作视频示范（Exercise.videoUrl 字段）
-- 现有 15 个 seed 动作 videoUrl=null（无示范视频；UX 显示「示范视频即将上线」）
-- 用户自定义动作也可加 videoUrl（可选；addUserExercise 接 videoUrl? 入参）

ALTER TABLE "Exercise" ADD COLUMN "videoUrl" TEXT;
