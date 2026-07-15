# goal module — 跑步目标

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **goal/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/) / [shoes](../shoes/) / [favorite](../favorite/) / [feed](../../feed/)

> 引入版本：**V0.1.28**（pic 2768 跑者向，个人目标）+ **V0.1.34**（家庭目标 familyId）+ **V0.2.3**（list + myProgress 接 Cache.wrap 120s）
> 相关 pic：2768（跑步目标 + 我的证书）

---

## 📋 变更记录 (Changelog)

- **2026-07-15** — 🎯 **V0.2.3 list + myProgress 接 Cache.wrap 120s（init #12）**：2 个核心读接口接入 Cache.wrap（commit 41ab4c3，V0.2.3 第 2 个 perf 优化）；cacheKey `goal:list:${userId}` / `goal:myProgress:${userId}`；**统一范式**「抽 `computeList` / `computeMyProgress` 内部纯函数 + service 层包 Cache.wrap + 测试加 redis mock 隔离 + beforeEach clear cacheStore 防缓存串扰」（与 stats V0.2.3 / shoes V0.2.3 / training V0.2.3 同款）；**写接口不接 Cache**（add / remove / addFamilyGoal）依赖 TTL 120s 自然过期（写后失效复杂度 YAGNI，目标低频写）；测试加 redis mock 避免 cacheStore 串扰导致断言失败
- **2026-07-13** — V0.1.135 +4 customMilestone action（addCustomMilestone / removeCustomMilestone / listCustomMilestones / checkMilestoneAchievement）
- **2026-07-04** — V0.1.34 family 扩展：+familyId 字段（个人 vs 家庭目标分流）+ addFamilyGoal + myFamilyGoals + calcGoalProgress 改 userIds 参数
- **2026-07-03** — V0.1.28 创建（pic 2768 跑者向）：Goal 表 + goal module 4 action（list/add/remove/myProgress）+ calcGoalProgress DRY helper

---

## 🎯 模块职责

**跑步目标**：个人目标（type: monthly/yearly/custom）+ 家庭目标（V0.1.34，Goal +familyId 复用），含进度计算。

- **数据来源**：`Goal` 表（type/targetDistance/periodStart/periodStatus/familyId?/status(active|completed|archived)）
  - **V0.1.34**：`+familyId String?`（null=个人目标，有值=家庭目标，onDelete Cascade）
- **进度计算（DRY）**：`calcGoalProgress(userIds, goal)` = `Checkin.aggregate sum(distance) where userId:in + date range`
  - **V0.1.28**：个人目标传 `[userId]`
  - **V0.1.34**：家庭目标传 `familyMemberIds[]`（聚合全家跑量）
- **周期计算**：`computePeriod(type, input)` 按 type 自动算：
  - `monthly`：本月 1 号 → 下月 1 号（CN 时区）
  - `yearly`：今年 1/1 → 明年 1/1
  - `custom`：手传 `periodStart/periodEnd`（**必须**，否则 badRequest）
- **CN 时区**：`cnDateRange(start, end)` 把 Date 转 "YYYY-MM-DD" 字符串范围（Checkin.date 是字符串）
- **缓存（V0.2.3）**：list + myProgress 走 `Cache.wrap` 120s（与 stats 跑量汇总同档）；写接口不接 Cache 依赖 TTL 自然失效

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `goal.routes.ts` | POST `/api/goal`（统一 switch action） | ~40 |
| `goal.service.ts` | 6 action + computePeriod/cnDateRange/calcGoalProgress 内部 helper + **V0.2.3 computeList/computeMyProgress 内部纯函数（Cache.wrap 范式）** | 179+ |

注册：`src/app.ts` 内 `app.register(goalRoutes, { prefix: '/api/goal' })`

---

## 📡 对外接口（6 action）

> 统一 POST `/api/goal` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 缓存（V0.2.3） | 说明 |
| --- | --- | --- | --- | --- |
| `list` | — | `{ goals: [...含进度] }` | **Cache.wrap 120s** `goal:list:${userId}` → `computeList` | 我的个人目标（familyId:null 过滤；含 currentDistance/percent/completed） |
| `add` | `AddGoalInput` | `{ id }` | 不缓存（写后 TTL 自然失效） | 添加个人目标（type 自动算周期；end<=start badRequest） |
| `remove` | `{ id }` | `{ ok }` | 不缓存（写后 TTL 自然失效） | 删除目标（硬删；个人/家庭通用；先校验 id+userId） |
| `myProgress` | — | `{ goals: [...active] }` | **Cache.wrap 120s** `goal:myProgress:${userId}` → `computeMyProgress` | 当前 active 个人目标（familyId:null；首页/mine 红点用） |
| `addFamilyGoal` | `AddFamilyGoalInput`（V0.1.34） | `{ id }` | 不缓存 | 创建家庭目标（鉴权 familyMember.familyId 必须匹配 input.familyId，forbidden） |
| `myFamilyGoals` | —（V0.1.34） | `{ goals: [...含进度] }` | 不缓存（聚合复杂，YAGNI 不接 Cache） | 家庭目标列表（按家庭成员聚合） |

---

## 🔗 关键 helper：`calcGoalProgress(userIds, goal)`

> **DRY 范式**：进度计算函数，**V0.1.34 扩 userIds 参数**，个人=[userId] / 家庭=成员 userIds 列表，可扩展群组/团队目标。

```ts
async function calcGoalProgress(userIds: string[], g: Goal): Promise<GoalWithProgress> {
  const range = cnDateRange(g.periodStart, g.periodEnd);
  const agg = await prisma.checkin.aggregate({
    _sum: { distance: true },
    where: { userId: { in: userIds }, date: range },
  });
  const current = agg._sum.distance ?? 0;
  return {
    ...g, // type/targetDistance/periodStart/periodEnd/familyId/status/title
    currentDistance: Math.round(current * 10) / 10,
    percent: g.targetDistance > 0 ? Math.min(100, Math.round((current / g.targetDistance) * 100)) : 0,
    completed: current >= g.targetDistance,
  };
}
```

**复用点**：
- `list`（个人）：`calcGoalProgress([userId], goal)`
- `myProgress`（个人 active）：同上
- `myFamilyGoals`（家庭）：`calcGoalProgress(memberIds, goal)`（V0.1.34 扩展）

**不耦合 training.calcPlanProgress**：goal 固定周期 periodStart-End；plan 从 joinedAt 动态起算（KISS 不耦合）。

---

## 🧪 测试

```bash
# tests/modules/goal/goal.service.test.ts — 20 单元（V0.1.28 +7 + V0.1.34 +5 + V0.1.135 +4 + V0.2.3 cache 隔离调整）
# tests/modules/goal/goal.routes.test.ts — 8 单元
pnpm test goal
```

覆盖：list 含进度 / add 自动算周期 / add custom 必传 periodStart/End / remove / myProgress 仅 active + familyId:null / addFamilyGoal 鉴权 forbidden / myFamilyGoals 聚合 userIds in / cnDateRange 字符串范围 / **V0.2.3 接 Cache 后加 redis mock + beforeEach clear cacheStore 防缓存串扰**（V0.2.3 范式，参考 memory/v0.2.3-goal-cache.md）。

---

## 📌 范式

- **`calcGoalProgress` 扩 userIds**：V0.1.28 单参数 `userId`，V0.1.34 改 `userIds[]`（个人传单元素数组，家庭传成员列表）— **避免新增 parallel 函数**（calcFamilyGoalProgress，DRY）
- **CN 时区字符串范围**：`Checkin.date` 是 "YYYY-MM-DD" 字符串（V0.1.28 起，daily 类型按天聚合），进度按字符串范围过滤（`date: { gte: range.gte, lt: range.lt }`）
- **familyId 过滤**：`list` / `myProgress` 加 `where familyId: null`（仅个人目标）；`myFamilyGoals` 加 `where familyId: member.familyId`
- **周期自动算**：type=monthly/yearly 服务端算周期（前端无需传 periodStart/End）；type=custom 必传（缺则 badRequest）
- **Goal 双 relation**：V0.1.34 Goal +familyId（外键 onDelete Cascade），Family.goals 关联；用户删 Family → 家庭目标级联删（onDelete Cascade）
- **DRY 与训练计划区分**：plan 进度从 joinedAt 起算（不固定周期）— 不复用 calcGoalProgress；goal 周期固定（periodStart-End）— 用 calcGoalProgress
- **V0.2.3 Cache 范式**（commit 41ab4c3）：抽 `computeList(userId)` / `computeMyProgress(userId)` 内部纯函数（service 层方法）；原 `list` / `myProgress` 改为 `Cache.wrap(cacheKey, 120, () => this.computeList(userId))`；测试必加 `vi.mock('../../infra/redis.js', ...)` redis mock + `beforeEach(() => cacheStore.clear())` 防 cacheStore 跨用例串扰（V0.2.3 沉淀通用范式，shoes/stats/training 同款）；**写接口不接 Cache**（add/remove/addFamilyGoal 依赖 TTL 120s 自然过期）

---

## ⚠️ 已知坑

1. **Checkin.date 时区**：当前 date 字段按 UTC 存的 YYYY-MM-DD（V0.1.28 起），前端跨时区签到可能差一天；`cnDateRange` 内部按 UTC+8 偏移算范围，V0.1.34 后已对齐
2. **目标达成不自动改 status**：`completed: current >= targetDistance` 是计算字段，**Goal.status 不会自动改**（前端按 completed 字段灰显）；如需"达成后归档"需另加定时任务或前端主动调 status update（V0.1.28 MVP YAGNI）
3. **家庭目标鉴权**：addFamilyGoal 校验 `familyMember.familyId === input.familyId`（防越权创建他人家庭目标）；非家庭成员 forbidden
4. **`familyId:null` 过滤**：list/myProgress 显式 `familyId: null`（不返家庭目标）；前端 goal 页只展示个人目标
5. **V0.2.3 Cache 串扰坑**：接 Cache.wrap 后测试若不隔离 redis mock，第一个用例 populate 缓存后第二个用例命中缓存返旧值导致断言失败 → 必加 `vi.mock('../../infra/redis.js')` + `beforeEach(() => cacheStore.clear())`（V0.2.3 沉淀范式）

---

## 🔗 关联

- **family.addFamilyGoal / myFamilyGoals**：V0.1.34 家庭目标复用本 service（calcGoalProgress 扩 userIds DRY）
- **Checkin aggregate**：进度数据源（date 字符串范围）
- **前端 pages/goal**：个人目标进度条 + 添加弹层 + 删除（V0.1.28 新页）
- **前端 pages/family**：家庭目标展示（V0.1.34 集成）
- **infra/cache.ts**：V0.2.3 接入 Cache.wrap（list + myProgress 2 个热路径，commit 41ab4c3）
