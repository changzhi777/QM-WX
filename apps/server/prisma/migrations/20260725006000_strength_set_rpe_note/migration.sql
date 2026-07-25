-- V0.2.143 力量训练记录 V0.3 增量（StrengthSet +rpe +note）
-- rpe: 完结度 1-10（nullable 兼容存量）
-- note: 本组备注 max 200 字符

ALTER TABLE "StrengthSet" ADD COLUMN "rpe" INTEGER;
ALTER TABLE "StrengthSet" ADD COLUMN "note" TEXT;
