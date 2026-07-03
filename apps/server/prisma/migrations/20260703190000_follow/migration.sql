-- V0.1.32 关注关系（社交向深化 — 关注/粉丝）
-- followerId 关注 followeeId；unique 防重；onDelete Cascade（任一用户删除→关系级联）

CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Follow_followerId_followeeId_key" ON "Follow"("followerId", "followeeId");
CREATE INDEX "Follow_followeeId_idx" ON "Follow"("followeeId");
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey"
    FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followeeId_fkey"
    FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
