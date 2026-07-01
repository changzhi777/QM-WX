-- V0.1.18: 审计日志 + 黑名单字段
-- 1) 新增 AuditLog 表（关键 admin 操作留痕）
-- 2) User 表加 isBanned / bannedAt / bannedReason 三字段

-- ===== AuditLog =====
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorOpenid" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "payload" JSONB NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorOpenid_createdAt_idx" ON "AuditLog"("actorOpenid", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ===== User 黑名单字段 =====
ALTER TABLE "User" ADD COLUMN "isBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bannedReason" TEXT;

CREATE INDEX "User_isBanned_idx" ON "User"("isBanned");