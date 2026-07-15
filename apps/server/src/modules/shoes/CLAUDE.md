# shoes module — 我的跑鞋（V0.1.133 增强 + V0.1.137 对比 + 鞋评关联 + V0.2.3 Cache）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **shoes/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/) / [goal](../goal/) / [favorite](../favorite/) / [feed](../../feed/) / [sport](../../sport/)（调用 incrementShoeKm）/ [review](../review/)（V0.1.137 鞋评合成 productId=shoe:${shoeId}

> 引入版本：**V0.1.26**（2026-07-03，pic 2768 跑者向）+ **V0.1.133**（阈值个性化 + 历史里程曲线 + 详情页）+ **V0.1.136**（Shoe +feeds relation）+ **V0.1.137**（compareShoes 横向对比）+ **V0.2.3**（list + myStats 接 Cache.wrap 120s）
> 相关 pic：2768（跑鞋里程管理）

---

## 📋 变更记录 (Changelog)

- **2026-07-15** — 🎯 **V0.2.3 list + myStats 接 Cache.wrap 120s（init #12）**：2 个核心读接口接入 Cache.wrap（commit b0cecfd，V0.2.3 第 3 个 perf 优化）；cacheKey `shoes:list:${userId}` / `shoes:myStats:${userId}`；**统一范式**「抽 `computeList` / `computeMyStats` 内部纯函数 + service 层包 Cache.wrap + 测试加 redis mock 隔离 + beforeEach clear cacheStore 防缓存串扰」（V0.2.3 沉淀通用范式，与 stats/goal/training V0.2.3 同款）；**写接口不接 Cache**（add / update / retire / updateThreshold）依赖 TTL 120s 自然过期；**关键教训沉淀**：接 Cache 必加 redis mock + beforeEach clear cacheStore 防缓存串扰，否则第一用例 populate 缓存后第二用例命中返旧值断言失败（V0.2.3 范式 — 参考 memory/v0.2.3-shoes-cache.md）；1040 测 / funcs 86.34% / 生产 21s healthy
- **2026-07-13** — V0.1.138 init #7 校准：补 V0.1.136/137 段 + 关联 review module 鞋评合成 productId 说明
- **2026-07-13** — V0.1.137 跑鞋增强 2 期：+1 action compareShoes（横向对比 2 双）+ 批量 groupBy N+1 规避 + 反向胜出（healthRatio）+ stats.myCertificates 扩 3 段鞋成就（shoesMilestones/shoeDays/shoeCheckin）+ 前端 shoes-compare 新页 + pages/shoes 加成就 card + 对比按钮
- **2026-07-13** — V0.1.136 Shoe +feeds relation（Feed +shoeId 字段关联跑鞋）
- **2026-07-12** — V0.1.133 跑鞋增强（阈值个性化 + 历史里程曲线 + 详情页）：+3 action（getDetail/getMileageHistory/updateThreshold）+ 关键坑 Checkin.distance 单位混用沉淀 + 9 单测 + 前端 shoes-detail 新页 + mileage-chart 新组件
- **2026-07-03** — 创建（V0.1.26 pic 2768 跑者向）：Shoe 表 + shoes module 5 action（list/add/update/retire/myStats）+ incrementShoeKm 导出 + 7 单元测试

---

## 🎯 模块职责

**跑鞋管理**：CRUD + 健康度计算（currentKm / thresholdKm * 100）+ 退役 + 统计 + **V0.1.133 详情/历史/阈值** + **V0.1.137 横向对比** + **V0.2.3 list/myStats Cache**。

- **数据来源**：`Shoe` 表（V0.1.26，userId/brand/model/nickname?/currentKm/thresholdKm 默认 800/status/purchasedAt?/note?；**V0.1.136 +feeds relation**）
- **健康度**：`healthRatio = currentKm / thresholdKm * 100`
  - `< 70%` 绿色（健康）
  - `70% ~ 100%` 黄色（即将退役）
  - `> 100%` 红色（超期 — 提示更换防受伤）
- **里程累计（核心闭环）**：`sport.checkin` 事务内调用 **`incrementShoeKm(tx, shoeId, distance)`**（**本 module 导出纯函数供 sport 复用**，shoeId 为空跳过）
- **`Checkin +shoeId`**：V0.1.26 加字段（外键 ON DELETE SET NULL）
- **`retiringSoonCount`**：active 且 healthRatio ≥ 70% 的数量（mine 红点用）
- **V0.1.133 增强**：单只跑鞋详情（含 totalCheckins/latestCheckinAt/daysSincePurchase）+ 历史里程曲线（weekly/monthly 双粒度）+ 阈值个性化更新
- **V0.1.137 增强**：横向对比 2 双跑鞋（compareShoes，含 checkinCount 批量 groupBy + daysSincePurchase + healthRatio）
- **V0.2.3 增强**：list + myStats 接 Cache.wrap 120s（commit b0cecfd，perf 优化）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `shoes.routes.ts` | POST `/api/shoes`（统一 switch action，V0.1.137 +1 case compareShoes） | ~40 |
| `shoes.service.ts` | 9 action（V0.1.26 5 + V0.1.133 3 + V0.1.137 1）+ 导出 `incrementShoeKm` 供 sport 复用 + **V0.2.3 computeList/computeMyStats 内部纯函数（Cache.wrap 范式）** | ~280+ |

注册：`src/app.ts` 内 `app.register(shoesRoutes, { prefix: '/api/shoes' })`

---

## 📡 对外接口（9 action，V0.1.137 +1）

> 统一 POST `/api/shoes` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 缓存（V0.2.3） | 说明 |
| --- | --- | --- | --- | --- |
| `list` | — | `{ shoes: [...{ healthRatio }] }` | **Cache.wrap 120s** `shoes:list:${userId}` → `computeList` | 我的跑鞋（active 在前 + createdAt desc；含 healthRatio） |
| `add` | `AddShoeInput` | `{ id, brand, model }` | 不缓存（写后 TTL 自然失效） | 添加跑鞋（thresholdKm 默认 800） |
| `update` | `UpdateShoeInput` | `{ id }` | 不缓存 | 更新（先校验 id+userId 存在） |
| `retire` | `{ id }` | `{ ok }` | 不缓存 | 退役（status=active→retired；已退役 badRequest） |
| `myStats` | — | `{ total, activeCount, retiredCount, totalKm, retiringSoonCount }` | **Cache.wrap 120s** `shoes:myStats:${userId}` → `computeMyStats` | 跑鞋统计（mine 红点用 retiringSoonCount） |
| **`getDetail`**（V0.1.133） | `{ id }` | `ShoeDetail` | 不缓存（单查低频，YAGNI） | 单只跑鞋详情（含 totalCheckins/latestCheckinAt/daysSincePurchase） |
| **`getMileageHistory`**（V0.1.133） | `{ id }` | `MileageHistory` | 不缓存 | 历史里程曲线（weekly + monthly 双粒度，garmin cm→km 分流） |
| **`updateThreshold`**（V0.1.133） | `{ id, thresholdKm }` | `{ id, thresholdKm }` | 不缓存（写接口） | 单字段原子更新阈值（100-2000） |
| **`compareShoes`**（V0.1.137） | `{ ids: [string, string] }` | `{ left: ShoeCompare, right: ShoeCompare, winner: [...] }` | 不缓存 | **横向对比 2 双跑鞋**（含 checkinCount 批量 groupBy + daysSincePurchase + healthRatio + 当前里程）；返胜出项字段（前端高亮） |

---

## 🔗 关键导出：`incrementShoeKm`（sport.checkin 事务内调用）

> **DRY 范式**：跑鞋里程累加纯函数，从本 module 导出，供 sport.service 复用。

```ts
export async function incrementShoeKm(
  tx: PrismaTx,                  // prisma 事务客户端
  shoeId: string | null,         // 跑鞋 id（null 则跳过，向后兼容）
  distanceKm: number,            // 本次打卡距离
): Promise<void> {
  if (!shoeId) return;
  await tx.shoe.update({
    where: { id: shoeId },
    data: { currentKm: { increment: distanceKm } },
  });
}
```

**调用点**：`apps/server/src/modules/sport/sport.service.ts:checkin`（V0.1.26）— `$transaction` 回调内 `await incrementShoeKm(tx, input.shoeId, distance)`。

**前端 picker**（V0.1.27）：sport 打卡页加跑鞋 picker → 传 `shoeId` → 后端事务内自动累加 → **跑鞋里程闭环（GAP-10 关闭）**。

**V0.2.3 注意**：`incrementShoeKm` 直接走 tx update，**不走 Cache 失效逻辑**；list/myStats 缓存依赖 TTL 120s 自然过期（用户感知：打卡后跑鞋卡里程延迟 ≤ 120s 更新；acceptable 因跑鞋里程非实时关键）。

---

## 📊 V0.1.133 跑鞋增强（阈值个性化 + 历史里程曲线）

### 3 新 action

| action | 用途 | 关键设计 |
| --- | --- | --- |
| **`getDetail(userId, shoeId)`** | 单只跑鞋详情 | 聚合 Checkin count + 最新打卡时间 + 购买天数（daysSincePurchase） |
| **`getMileageHistory(userId, shoeId)`** | 历史里程曲线（周+月双粒度） | **单位分流关键坑**：garmin cm→km (`/100000`)，sport km 直通；`findMany + 内存 reduce` 避免 Prisma Float 精度 |
| **`updateThreshold(userId, {id, thresholdKm})`** | 单字段原子更新阈值 | 独立 action 语义清晰；Zod 校验 100-2000 |

### 关键坑（V0.1.133 沉淀）

1. **Checkin.distance 单位混用**（最坑）：
   - garmin-import.job.ts（V0.1.25）写入时单位是 cm（佳明返回的 distance 是 cm）
   - sport.checkin 创建时单位是 km
   - **解决**：`normalizeDistanceKm(distance, dataSource)` helper：dataSource==='garmin' → `/100000`，其他 → 直通

2. **Prisma Float 精度**：`groupBy(by period)` 会有精度损失 → `findMany + 内存 reduce`

3. **更新频率**：`updateThreshold` 独立 action 而非复用 `update`（update 是全字段替换）

---

## 📊 V0.1.137 跑鞋增强 2 期（横向对比）

### 1 新 action：`compareShoes(userId, ids[2])`

**用途**：用户从跑鞋列表选 2 双进行横向对比，前端展示 2 列对比表 + 胜出项高亮。

**返回结构**：
```ts
{
  left: { id, brand, model, nickname, currentKm, thresholdKm, healthRatio, totalCheckins, daysSincePurchase, status },
  right: { ...同上 },
  winner: [
    { field: 'currentKm', value: 'left' },     // 谁里程多
    { field: 'healthRatio', value: 'right' },   // 谁健康度好（低更好）
    { field: 'totalCheckins', value: 'left' },  // 谁打卡次数多
    { field: 'daysSincePurchase', value: 'tie' } // 谁更新（购买天数）
  ]
}
```

**关键设计**：
- **批量 groupBy Checkin by shoeId**：一次 prisma 查询拿 2 双鞋的 checkinCount（避免 N+1）
- **daysSincePurchase**：从 purchasedAt 算到今天
- **healthRatio 反向胜出**：健康度越低越好（更新），与其他"多者胜"字段相反
- **winner 字段**：前端按 field 高亮胜出列（绿色），平手 tie 不高亮

### 集成点

- **前端 pages/shoes-compare/**（V0.1.137 新页）：2 列横向对比表 + 胜出项高亮绿
- **pages/shoes/index 改造**（V0.1.137）：成就 card（来自 stats.myCertificates V0.1.137 +3 鞋成就段）+ 「对比 2 双」按钮（多选 → 跳 shoes-compare?ids=xx,yy）

### 关联改动（V0.1.137 stats.myCertificates 扩 3 段鞋成就）

- **shoesMilestones**：总跑鞋累计里程里程碑 100/500/1000/3000 km 🏃👟🏆👑
- **shoeDays**：单只跑鞋拥有天数 30/100/365 天 📅🗓️🎖️
- **shoeCheckin**：单只跑鞋打卡次数 50/100/500 次 🎯💯🏅

**关键坑（V0.1.137）**：现有 4 个 stats.myCertificates 测试需补 `shoe.aggregate` mock（V0.1.137 新依赖）。

---

## 📊 V0.2.3 list + myStats 接 Cache.wrap 120s

### 接入范式（V0.2.3 沉淀通用范式，shoes 是首站）

```ts
// shoes.service.ts (V0.2.3 commit b0cecfd)
async list(userId: string) {
  const cacheKey = `shoes:list:${userId}`;
  return Cache.wrap(cacheKey, 120, async () => this.computeList(userId));
},
async computeList(userId: string) {
  const shoes = await prisma.shoe.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return { shoes: shoes.map(s => ({ ..., healthRatio: ... })) };
},
```

**关键设计**：
- **抽 compute* 内部函数**：原 `list` 拆为 `list`（包 Cache）+ `computeList`（纯聚合）；myStats 同款
- **TTL 120s**：跑鞋列表低频变化（每次打卡 incrementShoeKm 才变 currentKm），与 stats/goal/training V0.2.3 同档
- **写接口不接 Cache**：add/update/retire/updateThreshold 依赖 TTL 120s 自然过期（写后 Cache 失效复杂度 YAGNI）
- **incrementShoeKm 不触发失效**：sport.checkin 调 incrementShoeKm 后，list/myStats 缓存仍返旧 currentKm（≤ 120s 延迟，acceptable 因跑鞋里程非实时关键）

### 测试隔离范式（V0.2.3 关键教训）

```ts
// tests/modules/shoes/shoes.service.test.ts (V0.2.3)
vi.mock('../../infra/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() },
}));
import { cacheStore } from '../../infra/cache';
beforeEach(() => { cacheStore.clear(); }); // 防 cacheStore 跨用例串扰
```

**坑**：接 Cache.wrap 后第一个用例 populate 缓存，第二个用例若 mock 返不同值 → 命中缓存返旧值 → 断言失败。**必加 beforeEach clear cacheStore**（V0.2.3 沉淀，shoes 是首发站，stats/goal/training V0.2.3 同款）。

---

## 🧪 测试

```bash
# tests/modules/shoes/shoes.service.test.ts — 21 单元（V0.1.133 +9 + V0.1.137 +N + V0.2.3 cache 隔离调整）
# tests/modules/shoes/shoes.routes.test.ts — 7 单元 + V0.1.137 +1 case
pnpm test shoes
```

覆盖：list 排序 / add / update 校验存在 / retire active→retired / retire 重复退役 badRequest / myStats retiringSoonCount / **getDetail（正常 + notFound）/ getMileageHistory（garmin cm→km 单位分流 + sport km 直通 + 双粒度分桶 + 空数据 + notFound）/ updateThreshold（正常 + notFound）/ incrementShoeKm 纯函数（事务客户端调用）/ V0.1.137 compareShoes（双鞋正常 + notFound + 同一双 badRequest）** / **V0.2.3 接 Cache 后加 redis mock + beforeEach clear cacheStore 防缓存串扰**（V0.2.3 范式）。

---

## 📌 范式

- **健康度后端算**：`healthRatio` 在 service 出口算好（不在前端算）
- **排序字典序**：list `orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]` — `'active' < 'retired'`
- **retiringSoon 阈值 70%**：与前端颜色阈值一致
- **增量累加**：`currentKm: { increment: distance }` 用 Prisma 原子 increment
- **导出纯函数**：`incrementShoeKm(tx, ...)` 接受事务客户端作为参数
- **批量 groupBy**：V0.1.137 compareShoes 一次 groupBy by shoeId（whereIn ids）拿 2 双鞋 checkinCount（N+1 规避范式）
- **反向胜出**：healthRatio 越低越好（与里程/打卡次数相反），winner 算法需 field-specific 反向逻辑
- **V0.2.3 Cache 范式**（commit b0cecfd）：抽 `computeList(userId)` / `computeMyStats(userId)` 内部纯函数（service 层方法）；原 `list` / `myStats` 改为 `Cache.wrap(cacheKey, 120, () => this.computeList(userId))`；测试必加 redis mock + `beforeEach(() => cacheStore.clear())` 防跨用例串扰（V0.2.3 沉淀通用范式）；**写接口不接 Cache**（add/update/retire/updateThreshold 依赖 TTL 120s 自然过期）

---

## ⚠️ 已知坑

1. **健康度色码阈值**：当前 70% / 100% 写死在 service，前端颜色对应在 `pages/shoes/index.wxss`；改阈值需前后端同步
2. **退役不可逆**：retire 是状态变更，**没有 unretire**（YAGNI）
3. **thresholdKm 默认 800**：所有新跑鞋默认 800km；V0.1.133 updateThreshold 允许用户改 100-2000
4. **`Checkin.shoeId` ON DELETE SET NULL**：用户删鞋时历史打卡关联清空（保留打卡记录本身）
5. **Checkin.distance 单位混用**（V0.1.133 最坑）：garmin-import 写 cm，sport.checkin 写 km，读取历史时必须按 dataSource 分流
6. **V0.1.137 compareShoes 限 2 双**：当前 ids[2]，扩展到 3+ 双需改 schema + UI（YAGNI 暂不做）
7. **V0.2.3 Cache 串扰坑**：接 Cache.wrap 后测试若不隔离 redis mock，第一用例 populate 缓存后第二用例命中返旧值导致断言失败 → 必加 `vi.mock('../../infra/redis.js')` + `beforeEach(() => cacheStore.clear())`（V0.2.3 沉淀范式，shoes 是首发站）

---

## 🔗 关联

- **sport.checkin**：事务内调 `incrementShoeKm`（V0.1.26 GAP-10 闭环）
- **Checkin.shoeId**：外键 SET NULL（删鞋不删打卡）
- **User.shoes**：User +shoes relation（V0.1.26）
- **Feed.shoeId**（V0.1.136）：动态可关联跑鞋，Shoe +feeds relation
- **Review 表 productId 合成**（V0.1.137）：鞋评走 `productId=shoe:${shoeId}` 复用 Review 表（绕过三元组约束）
- **stats.myCertificates**（V0.1.137）：扩 3 段鞋成就（shoesMilestones/shoeDays/shoeCheckin）
- **前端 pages/shoes**：跑鞋卡 + 添加弹层 + 退役 + FAB（V0.1.26）
- **前端 pages/shoes-detail**（V0.1.133 新页）：详情 + 阈值 slider + 累计统计 + Canvas 2d 折线图（mileage-chart 组件）
- **前端 pages/shoes-compare**（V0.1.137 新页）：2 列横向对比表 + 胜出项高亮
- **前端 components/mileage-chart**（V0.1.133 新组件）：Canvas 2d 折线图（坐标轴 + 最高点高亮 + dpr 适配）
- **infra/cache.ts**：V0.2.3 接入 Cache.wrap（list + myStats 2 个热路径，commit b0cecfd）
