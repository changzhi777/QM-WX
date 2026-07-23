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

✅ **21 测（V0.2.51 +12 + V0.2.73 +9 routes 全覆盖）**：

| 文件 | 测数 | 覆盖 |
| --- | ---: | --- |
| `strength.service.test.ts` | 12 | startSession dateStr CN 今日 + addSet 鉴权非本人 + totalVolume 实时累加 + finishSession 设时长 + listSessions 分页 + sessionDetail 含 sets + myVolume 按日聚合 + listExercises 预设/自定义 |
| `strength.routes.test.ts`（V0.2.73 新建） | 9 | 7 action 全覆盖：startSession / addSet / finishSession / listSessions / sessionDetail / myVolume / listExercises（routes 测从 0 → 9，**最大缺口清零**） |

**funcs 影响**：strength module 0→100%（V0.2.51 补测后），全局 funcs 86.63%→89%→90.01%→**90.64%**（V0.2.79 commit 7ed5b95 实跑，threshold 86 缓冲 4.64pp）。

---

## 📌 关键范式与坑

1. **export async function 非 const service**：与其他 module（const xxxService = { ... }）不同，strength 用独立 export async function，routes 直接 import 调用。两种风格都存在于 codebase（非强制统一）。
2. **volume 实时累加**：addSet 不在 finishSession 批量算，而是每组 increment（前端实时显示累计容量）。Prisma `{ increment }` 原子操作防并发。
3. **dateStr CN 时区**：date 是 DateTime（UTC），dateStr 是 CN 时区 YYYY-MM-DD（按日聚合/统计用，避免 UTC 跨日）。`cnDate()` = `new Date(d.getTime() + 8*3600*1000).toISOString().slice(0,10)`。
4. **exerciseId 可选**：预设动作（Exercise 表）有 exerciseId；自定义动作（用户临时输入）exerciseId 空，仅存 exerciseName。

---

🤙 改 strength 看 `strength.service.ts`（7 action + cnDate）；前端 pages/strength 待建（训练日志页 + 组间计时）。

---

## 📝 变更记录 (Changelog)

- **2026-07-20** — 🎯 **V0.2.42 strength module 创建（第 36 个 — 训记式力量训练日志）**：`feat(v0.2.42)` commit；3 文件 service/routes/schema + 3 新表 StrengthSession/StrengthSet/Exercise #63-65 + 迁移 `20260720000000_strength` + Exercise seed ~15 预设；7 action：startSession/addSet/finishSession/listSessions/sessionDetail/myVolume/listExercises；volume=Σreps×weight 实时 increment；cnDate CN 时区；**0 测 deferred**（GAP-12 沿用 +strength/CLAUDE.md V0.2.48 补建 36/36）
- **2026-07-21** — 🎯 **V0.2.51 strength 补测 12（funcs 0→100%）**：`test(v0.2.51)` commit；`tests/modules/strength/strength.service.test.ts` 12 测补全：startSession + addSet 鉴权 + totalVolume 累加 + finishSession + listSessions 分页 + sessionDetail + myVolume 按日聚合 + listExercises 预设/自定义；全局 funcs 87.64→**89%**（strength 0→100% 是关键）
- **2026-07-23** — 🎯 **V0.2.73 strength.routes.test.ts 新建（0→9，7 action 全覆盖，最大缺口清零）**：`test(v0.2.73)` commit；`tests/modules/strength/strength.routes.test.ts` 9 测覆盖 7 action：startSession/addSet/finishSession/listSessions/sessionDetail/myVolume/listExercises routes 派发 + JWT 鉴权 + Zod 校验；属 V0.2.73 GAP-3.5 routes 全分流 +61 测的 7 module 之一；累计 strength 21 测（service 12 + routes 9）
- **2026-07-23** — 🎯 **`/zcf:init-project` 增量校准 #19（V0.2.79 收官）**：本文件 changelog 顶部补 V0.2.51 + V0.2.73 共 2 段；测试段从「⚠️ 0 单测 deferred」改为「✅ 21 测（V0.2.51 +12 service + V0.2.73 +9 routes）」；**0 代码改动纯文档增量**