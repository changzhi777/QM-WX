-- V0.2.153 设备每日活动（VIVO 设备数据模型）
-- 通用：step / distanceM / caloriesKcal / sleepMin / activeMin
--  vendor: vivo | wechat | garmin | huawei | mi（多设备厂商统一）
--  同一 (userId, vendor, date) 只一条（防重）
--  YAGNI：先建表 + 占位接口，VIVO OAuth + 同步后续

CREATE TABLE "DeviceDailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "distanceM" INTEGER NOT NULL DEFAULT 0,
    "caloriesKcal" INTEGER NOT NULL DEFAULT 0,
    "sleepMin" INTEGER NOT NULL DEFAULT 0,
    "activeMin" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceDailyActivity_pkey" PRIMARY KEY ("id")
);

-- 同一 (userId, vendor, date) 唯一
CREATE UNIQUE INDEX "DeviceDailyActivity_userId_vendor_date_key" ON "DeviceDailyActivity"("userId", "vendor", "date");

-- 查询索引
CREATE INDEX "DeviceDailyActivity_userId_date_idx" ON "DeviceDailyActivity"("userId", "date");
CREATE INDEX "DeviceDailyActivity_userId_vendor_idx" ON "DeviceDailyActivity"("userId", "vendor");

-- 外键
ALTER TABLE "DeviceDailyActivity" ADD CONSTRAINT "DeviceDailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
