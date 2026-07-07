-- V0.1.41 训练计划配置化（admin CRUD + 用户加入 + 进度跟踪）
-- TrainingPlan（admin 维护，替硬编码 4 套）+ UserPlanEnrollment（1 人 1 活跃计划）

CREATE TABLE "TrainingPlan" (
    "id"            TEXT NOT NULL,
    "key"           TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "weeks"         INTEGER NOT NULL,
    "level"         TEXT NOT NULL,
    "goal"          TEXT NOT NULL,
    "desc"          TEXT NOT NULL,
    "weeklyMileage" TEXT NOT NULL,
    "targetKm"      DOUBLE PRECISION NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'active',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingPlan_key_key" ON "TrainingPlan"("key");
CREATE INDEX "TrainingPlan_status_idx" ON "TrainingPlan"("status");

CREATE TABLE "UserPlanEnrollment" (
    "id"       TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "planId"   TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlanEnrollment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserPlanEnrollment_userId_key" UNIQUE ("userId")
);

CREATE INDEX "UserPlanEnrollment_planId_idx" ON "UserPlanEnrollment"("planId");

ALTER TABLE "UserPlanEnrollment" ADD CONSTRAINT "UserPlanEnrollment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPlanEnrollment" ADD CONSTRAINT "UserPlanEnrollment_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
