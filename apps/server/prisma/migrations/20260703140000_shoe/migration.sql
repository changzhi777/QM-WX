-- 跑鞋表（V0.1.26，跑者向 — 里程管理 + 更换提醒）
CREATE TABLE "Shoe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "nickname" TEXT,
    "currentKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thresholdKm" DOUBLE PRECISION NOT NULL DEFAULT 800,
    "status" TEXT NOT NULL DEFAULT 'active',
    "purchasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shoe_pkey" PRIMARY KEY ("id")
);

-- 索引：按用户 + 状态查（active 跑鞋列表）
CREATE INDEX "Shoe_userId_status_idx" ON "Shoe"("userId", "status");

-- Checkin 加 shoeId（可选，打卡时选跑鞋）
ALTER TABLE "Checkin" ADD COLUMN "shoeId" TEXT;

-- Checkin → Shoe 外键（跑鞋删除时 SET NULL，保留打卡记录）
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_shoeId_fkey"
    FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
