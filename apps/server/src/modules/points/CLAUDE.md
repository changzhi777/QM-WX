# points module — 积分中心

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **points/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[cart](../cart/) / [address](../address/) / [coupon](../coupon/) / [distribution](../../distribution/) / [mall](../../mall/)

> 引入版本：**V0.1.22**（2026-07-02，`/zcf:workflow` B-核心 / 方案 1）
> 相关 pic：2763（积分详情）

---

## 🎯 模块职责

**积分中心**：余额查询 + 每日签到（+10/天，连续 7 天额外 +50）+ 任务列表（引导用户活跃）。

- **数据来源**：
  - `User.points`（**字段直接余额**，非独立表 — 简化）
  - `PointsRecord`（流水，type: signin/purchase/order/evaluate 等，含 `balance` 快照）
  - `SigninRecord`（每日签到，**`@@unique([userId, date])`** 防同日重复签到）
- **签到规则**（service 常量）：
  - 基础 `BASE_SIGNIN_POINTS = 10` / 天
  - 连续 7 天 `CONTINUOUS_7D_BONUS = 50` 额外奖励（促活：`bonus = continuousDays % 7 === 0 ? 50 : 0`）
- **CN 时区**：今日 / 昨日 YYYY-MM-DD 全部按 UTC+8 算（避免时区漂移签到）
- **事务保证**：签到 = `user.points += pointsAwarded` + `signinRecord.create` + `pointsRecord.create` 三步全事务（部分失败回滚，余额不漂）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `points.routes.ts` | POST `/api/points`（统一 switch action） | ~30 |
| `points.service.ts` | 3 action（myBalance/signin/myTasks）+ 签到规则常量 + CN 日期工具 | 129 |
| `points.schema.ts` | Zod | — |

注册：`src/app.ts` 内 `app.register(pointsRoutes, { prefix: '/api/points' })`

---

## 📡 对外接口（3 action）

> 统一 POST `/api/points` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `myBalance` | — | `{ balance, todaySigned, continuousDays, records: [...] }` | 余额 + 今日签到状态 + 连续天数 + 最近 20 条流水 |
| `signin` | — | `{ ok, pointsAwarded, continuousDays, newBalance, bonus }` | 签到（`@@unique` 防重；同日再签 → badRequest）；连续 7 天 bonus=true |
| `myTasks` | — | `{ tasks: [...] }` | 任务列表（静态 4 任务 + 动态 done 状态：签到/购买/订单/评价） |

---

## 🔗 集成点

- **被 mall 集成**：订单完成时（`status` 从 `paid` → `done` 或 `shipped` → `done`）调 `tx.user.update points += 30` 走 wallet/points 流水（V0.1.22 集成在 mall service）
- **被 content 集成**：报名赛事后送积分（待 V0.1.22 之后）
- **被 auth.login 集成**：首登自动 +100 注册积分（user.login service 调 user.update points）

---

## 🧪 测试

```bash
# tests/modules/points/points.service.test.ts — 5 单元
pnpm test points
```

覆盖：myBalance 取余额 + 流水 / signin 加积分 + 流水 + 连续天数 / 连续 7 天 bonus=true / 同日重签 badRequest / myTasks 4 任务动态状态。

---

## 📌 范式

- **`@@unique` 防重**：签到用 `userId_date` 复合 unique，重复签到直接抛 P2002 → 转 badRequest（无需先查）
- **CN 时区**：所有日期字符串按 UTC+8 算（`new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10)`）；前端展示也按本地时区，避免跨时区签到漂移
- **流水快照**：`PointsRecord.balance` 是写入时的余额快照（便于前端展示"积分变动"瀑布流，无需再 join user.points 实时算）
- **任务动态化**：`TASKS` 静态定义 + service 实时查 `todaySignin / monthOrders` 给 `done` 字段，前端按 `done` 灰显按钮
- **事务三件套**：签到事务内 `user.update` + `signinRecord.create` + `pointsRecord.create`，任一失败全部回滚

---

## ⚠️ 已知坑

1. **CN 时区工具**：当前 `todayCN()` / `yesterdayCN()` 用 `Date.now() + 8*3600*1000` 偏移，不是真正的本地时区（前端不同地区 TZ 会有偏差）；V0.1.22 MVP 简化，V0.1.43+ 可改用 `Intl.DateTimeFormat` 真本地时区
2. **任务定义写死**：`TASKS` 数组在 service 文件里硬编码（4 任务），改文案需改代码；V0.1.22 MVP 简化，未建任务模板表
3. **purchase/order 任务联动**：当前 `myTasks` 只查 `monthOrders > 0`，未真正发积分（order 完成时由 mall service 调 pointsRecord.create + user.update 累加，task 状态只是展示）

---

## 🔗 关联

- **mall**：订单完成触发积分流水（V0.1.22 集成在 mall service）
- **auth**：首登送 100 积分（V0.1.22 user.login 集成）
- **cart**：未联动（cart.add 不送积分）
- **content**：报名赛事送积分（待 V0.1.22 之后）
