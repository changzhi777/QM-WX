-- V0.1.134 RaceResult 表：赛事成绩 1:1（一人报名一成绩，可改 upsert）
-- 冗余 userId/contentId 字段：避免排行榜查询时 join Enrollment
CREATE TABLE "RaceResult" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "finishTimeSec" INTEGER,
    "paceSecPerKm" INTEGER,
    "rank" INTEGER,
    "bibNumber" TEXT,
    "finisherPhotoUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'user_report',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- 一对一（一人一成绩）
CREATE UNIQUE INDEX "RaceResult_enrollmentId_key" ON "RaceResult"("enrollmentId");

-- 排行榜：按 contentId 范围 + rank 升序
CREATE INDEX "RaceResult_contentId_rank_idx" ON "RaceResult"("contentId", "rank");

-- 排行榜：按 contentId 范围 + finishTimeSec 升序
CREATE INDEX "RaceResult_contentId_finishTimeSec_idx" ON "RaceResult"("contentId", "finishTimeSec");

-- 用户维度查询（我的成绩）
CREATE INDEX "RaceResult_userId_idx" ON "RaceResult"("userId");

-- 外键：Enrollment 删除 → RaceResult 级联（避免孤儿）
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;