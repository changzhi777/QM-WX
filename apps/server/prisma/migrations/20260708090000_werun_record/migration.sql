-- V0.1.43 微信运动步数入库（方案 3）
-- WeRunRecord（每日步数，syncWeRun 从微信运动 upsert）

CREATE TABLE "WeRunRecord" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "date"      TEXT NOT NULL,
    "step"      INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeRunRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WeRunRecord_userId_date_key" UNIQUE ("userId", "date")
);

CREATE INDEX "WeRunRecord_userId_date_idx" ON "WeRunRecord"("userId", "date");

ALTER TABLE "WeRunRecord" ADD CONSTRAINT "WeRunRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
