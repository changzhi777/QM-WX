# training module — 训练计划

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **training/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[shoes](../shoes/) / [goal](../goal/) / [favorite](../favorite/) / [feed](../../feed/)

> 引入版本：**V0.1.25**（pic 2775 锻炼训练，4 套硬编码模板）+ **V0.1.41**（**模板迁 DB + 用户加入/进度/离开**）
> 相关 pic：2775（GO + 4 套计划 + 赛事助手 + 跑步记录）

---

## 🎯 模块职责

**训练中心**：4 套训练计划模板（5K / 10K / 半马 / 全马）+ 用户加入 + 进度计算 + 我的跑步记录（手动打卡 + 佳明导入聚合）。

- **数据来源**：
  - **`TrainingPlan`** 表（V0.1.41，admin 通过 `upsertTrainingPlan` 维护，4 套 seed）
  - **`UserPlanEnrollment`** 表（V0.1.41，`userId @unique` 一人 1 活跃计划）
- **进度计算**：`calcPlanProgress(userId, joinedAt, plan.targetKm)` = `Checkin(sportType=run).aggregate sum(distance) where createdAt >= joinedAt` → percent
- **跑步记录聚合**：手动打卡（`Checkin sportType=run`）+ 佳明导入（`RawActivity vendor=garmin type=running status=imported`） → **去重**（同一运动只保留 RawActivity，按 `importCheckinId` 关联）
- **缓存**：`mySportRecords` 走 `Cache.wrap` 60s（与 sport.myStats 同档）
- **赛事助手**：复用 `content.list(type=marathon)`，前端直调，**不在本 module**（DRY）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `training.routes.ts` | POST `/api/training`（统一 switch action） | ~50 |
| `training.service.ts` | 5 action + calcPlanProgress 内部 helper（V0.1.41 取代 V0.1.25 硬编码）+ Cache | 216 |
| `training.schema.ts` | Zod（MySportRecordsQuery / JoinPlanInput） | — |

注册：`src/app.ts` 内 `app.register(trainingRoutes, { prefix: '/api/training' })`

---

## 📡 对外接口（5 action）

> 统一 POST `/api/training` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `myPlans` | — | `{ plans: [...] }` | 我的训练计划（V0.1.41 改读 DB active 计划，取代 V0.1.25 硬编码常量；archived 不返） |
| `joinPlan` | `{ planId }` | `{ id, planId, planName, joinedAt }` | 加入计划（upsert Enrollment，1人1活跃；切换时 joinedAt 重置） |
| `myActivePlan` | — | `{ plan, joinedAt, daysJoined, currentDistance, targetKm, percent, completed }` | 当前计划 + 进度（无加入记录返 `{ plan: null }`） |
| `leavePlan` | — | `{ ok }` | 离开计划（deleteMany 幂等） |
| `mySportRecords` | `{ limit }` | `{ records: [...], summary: { totalRuns, totalDistanceKm, avgDistanceKm } }` | 我的跑步记录（聚合 Checkin + RawActivity 去重；Cache 60s） |

---

## 🔗 集成点

- **被 admin 集成**：`admin.upsertTrainingPlan` / `admin.listTrainingPlans`（V0.1.41 新增 2 action）
- **被 frontend 调用**：「锻炼」tab 训练计划卡 + 加入按钮 + 进度卡
- **复用在 sport 之外**：calcPlanProgress 内部 helper（**不复用** `goal.calcGoalProgress`：goal 固定周期 periodStart-End；plan 从 joinedAt 动态起算，KISS 不耦合）

---

## 🧪 测试

```bash
# tests/modules/training/training.service.test.ts — 5 单元
pnpm test training
```

覆盖：myPlans DB 读取 / joinPlan upsert / myActivePlan 进度计算 / leavePlan / mySportRecords 聚合 + 去重。

---

## 📌 范式

- **`calcPlanProgress` 内部 helper**：独立函数（不 export，不复用 `goal.calcGoalProgress`），符合 KISS（plan 从 joinedAt 动态算，goal 是固定周期）
- **`@@unique([userId])` 1 人 1 活跃**：UserPlanEnrollment.userId `@unique`，加入新计划时 upsert（自动替换旧计划 + 重置 joinedAt）
- **跑步记录去重**：佳明导入后生成 `Checkin`（`importCheckinId` 关联），同一运动只保留 `RawActivity`；用 Set + filter 一次性过滤（多取 2x 补齐去重损耗）
- **Cache 60s**：mySportRecords 用 `Cache.wrap('training:records:{userId}:{limit}', 60)`，避免高频聚合跑表
- **levelKey 英文 class**：`TrainingPlan.level` 存英文 enum（beginner/intermediate/challenge/extreme）— wxss 不能用中文 selector（V0.1.32 范式）

---

## ⚠️ 已知坑

1. **wxss 中文 selector 坑**：V0.1.32 修复过 `.plan-card.入门/进阶` 编译失败，**分离 levelKey（英文 class）+ level（中文显示）**；前端 LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描确认无中文 selector 残留
2. **Cache 失效**：mySportRecords 缓存 60s，新打卡后可能要等 1 分钟才显示；与 sport.myStats 同档（用户可接受）
3. **CalcPace 复用**：从 `device.schema.ts` 导入 `calcPace(durationSec, distanceKm)`，避免重复实现（DRY）
4. **多取 2x 补齐去重**：mySportRecords `take: limit * 2` 多取后过滤，避免去重后不足 limit；上限 2x 够用

---

## 🔗 关联

- **admin.upsertTrainingPlan**：维护模板（V0.1.41 新增）
- **sport**：打卡后 incrementShoeKm + Checkin.sportType=run（本 module 聚合读）
- **device.myActivities**：佳明原始活动 RawActivity 数据源（V0.1.41 集成）
- **content.list(type=marathon)**：赛事助手复用，**不在本 module**（DRY）
