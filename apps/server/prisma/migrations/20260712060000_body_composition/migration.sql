-- V0.1.124 体脂秤数据（BodyCompositionRecord，BLE 小米体脂秤 0x181B/0x181D）
-- 体重（必有）+ 体成分（体脂率/BMI/肌肉/骨骼/水分/内脏脂肪/阻抗）
CREATE TABLE "BodyCompositionRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "bodyFat" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "muscle" DOUBLE PRECISION,
    "bone" DOUBLE PRECISION,
    "water" DOUBLE PRECISION,
    "visceralFat" DOUBLE PRECISION,
    "impedance" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'ble',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyCompositionRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BodyCompositionRecord_userId_timestamp_idx" ON "BodyCompositionRecord"("userId", "timestamp");

ALTER TABLE "BodyCompositionRecord" ADD CONSTRAINT "BodyCompositionRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
