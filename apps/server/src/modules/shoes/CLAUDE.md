# shoes module — 我的跑鞋

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **shoes/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/) / [goal](../goal/) / [favorite](../favorite/) / [feed](../../feed/)

> 引入版本：**V0.1.26**（2026-07-03，pic 2768 跑者向 — 跑者刚需里程管理 + 800km 更换提醒防受伤）
> 相关 pic：2768（跑鞋里程管理）

---

## 🎯 模块职责

**跑鞋管理**：CRUD + 健康度计算（currentKm / thresholdKm * 100）+ 退役 + 统计（总数/active/总里程/即将退役数）。

- **数据来源**：`Shoe` 表（V0.1.26，userId/brand/model/nickname?/currentKm(默认0)/thresholdKm(默认800)/status(active|retired)/purchasedAt?/note?）
- **健康度**：`healthRatio = currentKm / thresholdKm * 100`
  - `< 70%` 绿色（健康）
  - `70% ~ 100%` 黄色（即将退役 — 提示用户准备新鞋）
  - `> 100%` 红色（超期 — 提示更换防受伤）
- **里程累计（核心闭环）**：`sport.checkin` 事务内调用 **`incrementShoeKm(tx, shoeId, distance)`**（**本 module 导出纯函数供 sport 复用**，shoeId 为空跳过，向后兼容）
- **`Checkin +shoeId`**：V0.1.26 加字段（外键 ON DELETE SET NULL），打卡时可选关联跑鞋 → 事务内 incrementShoeKm
- **`retiringSoonCount`**：active 且 healthRatio ≥ 70% 的数量（mine 红点用）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `shoes.routes.ts` | POST `/api/shoes`（统一 switch action） | ~30 |
| `shoes.service.ts` | 5 action（list/add/update/retire/myStats）+ 导出 `incrementShoeKm` 供 sport 复用 | 129 |

注册：`src/app.ts` 内 `app.register(shoesRoutes, { prefix: '/api/shoes' })`

---

## 📡 对外接口（8 action，V0.1.133 加 3）

> 统一 POST `/api/shoes` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `list` | — | `{ shoes: [...{ healthRatio }] }` | 我的跑鞋（active 在前 + createdAt desc；含 healthRatio） |
| `add` | `AddShoeInput` | `{ id, brand, model }` | 添加跑鞋（thresholdKm 默认 800） |
| `update` | `UpdateShoeInput` | `{ id }` | 更新（先校验 id+userId 存在） |
| `retire` | `{ id }` | `{ ok }` | 退役（status=active→retired；已退役 badRequest） |
| `myStats` | — | `{ total, activeCount, retiredCount, totalKm, retiringSoonCount }` | 跑鞋统计（mine 红点用 retiringSoonCount） |
| **`getDetail`**（V0.1.133） | `{ id }` | `ShoeDetail` | 单只跑鞋详情（含 totalCheckins/latestCheckinAt/daysSincePurchase） |
| **`getMileageHistory`**（V0.1.133） | `{ id }` | `MileageHistory` | 历史里程曲线（weekly + monthly 双粒度一次性返，garmin cm→km 分流） |
| **`updateThreshold`**（V0.1.133） | `{ id, thresholdKm }` | `{ id, thresholdKm }` | 单字段原子更新阈值（100-2000） |

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

**前端 picker**（V0.1.27）：sport 打卡页加跑鞋 picker，调 `shoes.list` 取 active 列表，传 `shoeId` → 后端事务内自动累加 → **跑鞋里程闭环（GAP-10 关闭）**。

---

## 📊 V0.1.133 跑鞋增强（阈值个性化 + 历史里程曲线）

### 3 新 action

| action | 用途 | 关键设计 |
| --- | --- | --- |
| **`getDetail(userId, shoeId)`** | 单只跑鞋详情 | 聚合 Checkin count + 最新打卡时间 + 购买天数（daysSincePurchase） |
| **`getMileageHistory(userId, shoeId)`** | 历史里程曲线（周+月双粒度） | **单位分流关键坑**：garmin cm→km (`/100000`)，sport km 直通；`findMany + 内存 reduce` 避免 Prisma Float 精度 |
| **`updateThreshold(userId, {id, thresholdKm})`** | 单字段原子更新阈值 | 独立 action 语义清晰（"我只改阈值不改其他"）；Zod 校验 100-2000 |

### 关键坑（V0.1.133 沉淀）

1. **Checkin.distance 单位混用**（最坑）：
   - garmin-import.job.ts（V0.1.25）写入时单位是 cm（佳明返回的 distance 是 cm）
   - sport.checkin 创建时单位是 km（`Math.floor(clean.distance * perKm)` 中 `clean.distance` 是 km）
   - **解决**：`normalizeDistanceKm(distance, dataSource)` helper：dataSource==='garmin' → `/100000`，其他 → 直通
   - 写入时也确认正确：`incrementShoeKm(tx, shoeId, distanceKm)` — sport.checkin 传 km，garmin-import 转 cm 后 `/100000` 调 incrementShoeKm

2. **Prisma Float 精度**：`groupBy(by period)` 会有精度损失 → `findMany + 内存 reduce` 而非 SQL groupBy（跑鞋打卡量小，性能 OK）

3. **更新频率**：`updateThreshold` 独立 action 而非复用 `update`（update 是全字段替换，前端编辑阈值语义清晰）

---

## 🧪 测试

```bash
# tests/modules/shoes/shoes.service.test.ts — **16 单元**（V0.1.133 +9：getDetail 2 / getMileageHistory 5 / updateThreshold 2）
# tests/modules/shoes/shoes.routes.test.ts — 7 单元
pnpm test shoes
```

覆盖：list 排序 / add / update 校验存在 / retire active→retired / retire 重复退役 badRequest / myStats retiringSoonCount / **getDetail（正常 + notFound）/ getMileageHistory（garmin cm→km 单位分流 + sport km 直通 + 双粒度分桶 + 空数据 + notFound）/ updateThreshold（正常 + notFound）** / incrementShoeKm 纯函数（事务客户端调用）。

---

## 📌 范式

- **健康度后端算**：`healthRatio` 在 service 出口算好（不在前端算，避免前端误算漂移）
- **排序字典序**：list `orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]` — `'active' < 'retired'` 字典序（a 在前）
- **retiringSoon 阈值 70%**：`healthRatio >= 0.7`（与前端颜色阈值一致：绿/黄/红 = 70%/100%）
- **增量累加**：`currentKm: { increment: distance }` 用 Prisma 原子 increment，事务内调用不会并发漂移
- **导出纯函数**：`incrementShoeKm(tx, ...)` 接受事务客户端作为参数，调用方传 `$transaction` 回调内的 `tx`，避免跨事务调用
- **deleteMany 幂等**：retire 用 `update` + 校验 status（避免重复退役）；其他不动 deleteMany（retire 是状态变更不是删除）

---

## ⚠️ 已知坑

1. **健康度色码阈值**：当前 70% / 100% 写死在 service，前端颜色对应在 `pages/shoes/index.wxss`；改阈值需前后端同步
2. **退役不可逆**：retire 是状态变更为 retired，**没有 unretire**（V0.1.26 MVP；YAGNI 如需"重新启用"再补 action）
3. **thresholdKm 默认 800**：所有新跑鞋默认 800km；用户可改（update action 支持），但前端 add 表单暂时未让用户填（待前端补 UI）
4. **`Checkin.shoeId` ON DELETE SET NULL**：用户删鞋时历史打卡关联清空（保留打卡记录本身，里程保留累计值不变）

---

## 🔗 关联

- **sport.checkin**：事务内调 `incrementShoeKm`（V0.1.26 GAP-10 闭环）
- **Checkin.shoeId**：外键 SET NULL（删鞋不删打卡）
- **User.shoes**：User +shoes relation（V0.1.26）
- **前端 pages/shoes**：跑鞋卡 + 添加弹层 + 退役按钮 + FAB（V0.1.26 新页）
