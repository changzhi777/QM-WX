-- V0.2.7 邀请奖励时长封顶（invitedBonusDays 累计，extendMember capDays 校验）
-- 仅邀请场景（bindInviter 邀请人）累加 + 校验 ≤90 天；被邀人体验/兑换/手动赠送不占配额

ALTER TABLE "User" ADD COLUMN "invitedBonusDays" INTEGER NOT NULL DEFAULT 0;
