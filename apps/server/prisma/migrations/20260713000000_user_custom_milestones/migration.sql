-- V0.1.135 User +customMilestones Json 字段
-- 自定义里程碑：[{km, title, icon?}, ...]（零迁移 schema 复杂度，复用 User 表）
ALTER TABLE "User" ADD COLUMN "customMilestones" JSONB NOT NULL DEFAULT '[]';