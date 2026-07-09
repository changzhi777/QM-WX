-- V0.1.43 新用户激活向导完成标记
-- User + onboardingDone Boolean @default(false)

ALTER TABLE "User" ADD COLUMN "onboardingDone" BOOLEAN NOT NULL DEFAULT false;
-- 现有用户标 true（已完成激活，避免老用户被打扰；新注册用户 false 触发向导）
UPDATE "User" SET "onboardingDone" = true;
