# 训练计划配置化（V0.1.41，方案 2 轻量配置化）

> /zcf:workflow 方案 2 — admin CRUD 训练计划 + 用户加入 + 进度跟踪

## 背景
training module V0.1.25 硬编码 4 套计划（5k/10k/half/full），admin 改不了，用户不能加入，无进度。配置化解决 3 个缺口。

## 范围
- **2 新表**：TrainingPlan + UserPlanEnrollment（1 人 1 活跃计划 @unique）
- **admin +2 action**：upsertTrainingPlan / listTrainingPlans
- **training +3 action**：joinPlan / myActivePlan / leavePlan；myPlans 改读 DB
- **前端 training 页改造**（不增页）：加入按钮 + 我的计划进度卡
- **seed** 4 套模板灌 DB
- 测试 +6~7

## 步骤
1. Prisma schema（2 表 + User relation）+ 迁移 `20260707160000_training_plan`
2. admin module +2 action（schema + service + routes）
3. training module 改造（service + schema + routes）
4. seed 灌 4 套模板
5. shared endpoints（training +3 / admin +2）
6. 前端 training 页改造（加入 + 进度卡）
7. 测试 +6~7
8. 验证（prisma generate/migrate + test + typecheck）

## 关键决策
1. TrainingPlan.key @unique（admin CRUD 幂等，seed 按 key 安全复跑）
2. UserPlanEnrollment.userId @unique（1 人 1 活跃计划，切换 = 替换，YAGNI 不建历史表）
3. calcPlanProgress 内部 helper（不复用 goal.calcGoalProgress — 周期逻辑不同 plan 从 joinedAt 动态 / goal 固定 periodStart-End，KISS 不耦合）

## 预期数字
- 表 43→45 / admin action 18→20 / training action 2→5 / 页 38 不变 / 测试 563→~570 / 迁移 17→18
