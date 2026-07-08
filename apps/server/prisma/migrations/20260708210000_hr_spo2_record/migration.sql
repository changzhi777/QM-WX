-- V0.1.43 心率 + 血氧历史入库（BLE 标准服务最大化）
-- HeartRateRecord（BLE 0x180D notify 批量落库，submitHeartRate 写 Redis + createMany）
-- SpO2Record（BLE 0x1822 / 0x2A5F spot-check 测量结果）

CREATE TABLE "HeartRateRecord" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "value"     INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source"    TEXT NOT NULL DEFAULT 'ble',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeartRateRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HeartRateRecord_userId_timestamp_idx" ON "HeartRateRecord"("userId", "timestamp");

ALTER TABLE "HeartRateRecord" ADD CONSTRAINT "HeartRateRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpO2Record" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "value"     INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpO2Record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpO2Record_userId_timestamp_idx" ON "SpO2Record"("userId", "timestamp");

ALTER TABLE "SpO2Record" ADD CONSTRAINT "SpO2Record_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
