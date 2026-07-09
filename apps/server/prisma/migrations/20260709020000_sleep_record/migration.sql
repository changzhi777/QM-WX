-- V0.1.43 睡眠历史入库（小米数据包导入，阶段 2 准备）
-- SleepRecord（一日一条，importXiaomiZip 解析小米睡眠 JSON upsert）

CREATE TABLE "SleepRecord" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "date"            TEXT NOT NULL,
    "bedtime"         TIMESTAMP(3),
    "wakeTime"        TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "deepSeconds"     INTEGER,
    "lightSeconds"    INTEGER,
    "remSeconds"      INTEGER,
    "awakeSeconds"    INTEGER,
    "score"           INTEGER,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SleepRecord_userId_date_key" UNIQUE ("userId", "date")
);

CREATE INDEX "SleepRecord_userId_date_idx" ON "SleepRecord"("userId", "date");

ALTER TABLE "SleepRecord" ADD CONSTRAINT "SleepRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
