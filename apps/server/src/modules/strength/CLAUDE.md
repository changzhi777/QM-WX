# strength module — 力量训练记录（训记式）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **strength/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/)（有氧训练计划）/ [ai-coach](../ai-coach/)（context-builder 聚合 strength 数据 V0.2.46）

> 引入版本：**V0.2.42**（2026-07-20，第 36 个 module — 训记式力量训练日志）

---

## 🎯 模块职责

**力量训练日志**（参考「训记」APP）：记录每次力量训练的动作 / 组 / 次 / 重量，实时累加训练容量（volume = Σ reps × weight），支持历史查询与容量趋势。

与 `training`（有氧训练计划）互补：
- `training`：跑步计划（TrainingPlan + Enrollment，目标 km 进度）
- `strength`：力量训练日志（StrengthSession + StrengthSet，volume 趋势）

**数据流**：
```
startSession（创建空 session，前端自动计时）
  → addSet × N（动作/次数/重量/组序；实时 increment session.totalVolume）
  → finishSession（设 durationSec + notes）
查询：listSessions（历史）/ sessionDetail（单次所有组）/ myVolume（容量趋势）
动作库：listExercises（预设 Exercise 表 + 自定义动作名）
```

---

## 🚪 入口与启动

| 文件 | 职责 |
| --- | --- |
| `strength.service.ts` | 7 action（export async function，非 const service 对象）+ cnDate CN 时区 helper |
| `strength.routes.ts` | POST `/api/strength`（switch action，JWT） |
| `strength.schema.ts` | Zod（AddSet/FinishSession/SessionDetail/ListSessions/MyVolume/ListExercises） |

注册：`src/app.ts` `app.register(strengthRoutes, { prefix: '/api/strength' })`

---

## 📡 对外接口（7 action）

> 统一 POST `/api/strength` body `{ action, payload }`，需 JWT

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `startSession` | — | `{ session }` | 创建空 StrengthSession（dateStr = CN 今日） |
| `addSet` | `{ sessionId, exerciseName, exerciseId?, reps, weight, setIndex, restSec? }` | `{ set, session }` | 记一组；鉴权 session.userId；实时 increment session.totalVolume += reps×weight |
| `finishSession` | `{ sessionId, durationSec, notes? }` | `{ session }` | 设时长 + 备注 |
| `listSessions` | `{ page?, pageSize? }` | `{ items, total }` | 历史训练列表（时间倒序） |
| `sessionDetail` | `{ sessionId }` | `{ session, sets }` | 单次训练所有组（含 exerciseName/reps/weight） |
| `myVolume` | `{ days? }` | `{ totalVolume, totalSessions, byDay[] }` | 容量趋势（默认近 30 天，按日聚合） |
| `listExercises` | `{ category? }` | `{ items }` | 动作库（预设 Exercise 表 + 用户自定义动作名 distinct） |

---

## 🗃️ 数据模型（3 表，V0.2.42 迁移 `20260720000000_strength`）

| Model | 字段要点 |
| --- | --- |
| **StrengthSession** | id/userId/date(DateTime)/dateStr(YYYY-MM-DD 按日聚合)/durationSec @default(0)/totalVolume Float @default(0) kg·次/notes?/createdAt；index[userId,createdAt]+[dateStr]；onDelete Cascade |
| **StrengthSet** | id/sessionId/order(动作序号)/exerciseName/exerciseId? FK Exercise/reps/weight kg/setIndex(同动作多组)/restSec?/createdAt；index[sessionId]+[exerciseId]；onDelete Cascade |
| **Exercise** | id/name @unique/category(胸/背/腿/肩/手臂/核心)；迁移 seed ~15 预设动作 |

**volume 计算**：`totalVolume = Σ (reps × weight)`，`addSet` 时实时 `prisma.strengthSession.update({ data: { totalVolume: { increment: reps * weight } } })`。

---

## 🔗 集成点

- **被 ai-coach 聚合**（V0.2.46 c）：`context-builder.ts` 查近 7 天 StrengthSession（totalVolume + durationSec 累加）注入 system prompt，让 AI 私教感知力量训练负荷
- **dateStr CN 时区**：`cnDate()` helper（UTC+8），与 food Meal.date 同范式（按日聚合需 CN 时区对齐）

---

## 🧪 测试

⚠️ **0 单测（V0.2.42 deferred）** — strength module 创建时聚焦后端 service/routes 落地，测试待补。

**待补测试**（建议覆盖）：
- startSession 创建 + dateStr CN 今日
- addSet 鉴权（非本人 session → forbidden）+ totalVolume 实时累加
- finishSession 设时长
- listSessions 分页
- sessionDetail 含 sets
- myVolume 按日聚合
- listExercises 预设 + 自定义

**funcs 影响**：strength module 0 测会拉低全局 funcs（待补测后稳定）。当前全局 funcs 86.63% > 86 阈值（缓冲 0.63pp，strength 未测代码量小暂可接受）。

---

## 📌 关键范式与坑

1. **export async function 非 const service**：与其他 module（const xxxService = { ... }）不同，strength 用独立 export async function，routes 直接 import 调用。两种风格都存在于 codebase（非强制统一）。
2. **volume 实时累加**：addSet 不在 finishSession 批量算，而是每组 increment（前端实时显示累计容量）。Prisma `{ increment }` 原子操作防并发。
3. **dateStr CN 时区**：date 是 DateTime（UTC），dateStr 是 CN 时区 YYYY-MM-DD（按日聚合/统计用，避免 UTC 跨日）。`cnDate()` = `new Date(d.getTime() + 8*3600*1000).toISOString().slice(0,10)`。
4. **exerciseId 可选**：预设动作（Exercise 表）有 exerciseId；自定义动作（用户临时输入）exerciseId 空，仅存 exerciseName。

---

🤙 改 strength 看 `strength.service.ts`（7 action + cnDate）；前端 pages/strength 待建（训练日志页 + 组间计时）。
