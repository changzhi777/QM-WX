-- V0.2.128 力量训练计划（training.kind=running|strength）
-- 现有 TrainingPlan 默认 running（不破坏存量），新增 kind 字段
-- V0.2.128 起 seed 2-3 力量训练计划（key 唯一，复跑安全）

ALTER TABLE "TrainingPlan" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'running';
