-- V0.2.148 组间心率（StrengthSet.postHr bpm）
-- 用于完成度评分（V0.2.148 多维度：RPE + postHr + note + 动作多样性）
-- 兼容存量（nullable）

ALTER TABLE "StrengthSet" ADD COLUMN "postHr" INTEGER;
