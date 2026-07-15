-- V0.2.7 成长等级（累计积分 totalPointsEarned 驱动，growthLevel 派生不存）
-- addPoints change>0 时同步 inc totalPointsEarned（兑换/扣减不影响累计）
-- 等级门槛：free<100 / bronze 100 / silver 500 / gold 2000 / diamond 5000（toUserOutput 派生）

ALTER TABLE "User" ADD COLUMN "totalPointsEarned" INTEGER NOT NULL DEFAULT 0;
