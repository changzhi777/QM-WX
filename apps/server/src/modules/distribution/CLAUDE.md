# distribution module — 分销中心

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **distribution/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[cart](../cart/) / [points](../points/) / [address](../address/) / [coupon](../coupon/) / [wallet](../../wallet/) / [mall](../../mall/)

> 引入版本：**V0.1.24**（2026-07-03，`/zcf:workflow` B 剩余 / 方案 1 全持久化闭环）
> 相关 pic：2762（分销中心红卡 + 6 宫格 + 3 tab 列表 + 邀请码复制）

---

## 🎯 模块职责

**分销中心**：用户邀请好友下单，按等级获得佣金；订单支付完成时实时入账至钱包余额，退款时冲红。

- **数据来源**：`DistributionOrder`（推广订单 + 佣金快照）+ `Team`（邀请关系，inviteeId 一人一上线，level 1=直推/2=间推）+ `CommissionLog`（佣金流水，type: settle/clawback，balanceAfter 快照）
- **等级规则**（service 常量 `LEVEL_RULES`，从高到低取满足的最高级）：
  - V3 ≥ 2000 元累计佣金 **或** 50 人团队 → 直推 **20%**
  - V2 ≥ 500 元 **或** 10 人 → 直推 **15%**
  - V1 ≥ 100 元 **或** 3 人 → 直推 **10%**
  - V0 普通用户 → 0%（无佣金）
- **佣金范围**：MVP **仅直推**（按上线等级 rate）；间推关系已记录（Team.level=2），但佣金发放暂未启用（GAP-6 二次上线）
- **`computeLevel(totalCommission, teamCount)`**：纯函数，按累计算应得等级
- **幂等保证**：`settleCommission` / `clawbackCommission` 都先检查 DistrOrder.status，非 pending/已 cancelled 直接返回

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `distribution.routes.ts` | POST `/api/distribution`（统一 switch action） | 44 |
| `distribution.service.ts` | 6 查询 action + settle/clawback 集成函数 + LEVEL_RULES 常量 | 408 |
| `distribution.schema.ts` | Zod（PageInputSchema / TeamInputSchema / DistributionActionBodySchema） | 16 |

注册：`src/app.ts` 内 `app.register(distributionRoutes, { prefix: '/api/distribution' })`

---

## 📡 对外接口（6 action）

> 统一 POST `/api/distribution` body：`{ action, payload }`，需 JWT 鉴权（req.user.id 取 userId）

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `mySummary` | — | `{ inviteCode, level, monthCommission, monthSales, orderCount }` | 顶部红卡汇总（本月佣金/销售/订单数 + 等级 + 邀请码）；首次调用触发 `ensureInviteCode` 落库 |
| `myOrders` | `{ page?, pageSize? }` | `{ list, total, page, pageSize }` | 推广订单列表（含订单状态 + 商品名） |
| `myTeam` | `{ page?, pageSize?, level? }` | `{ list, directCount, indirectCount, total, ... }` | 我的团队（直推/间推分组 + 计数；level 1=直推 2=间推） |
| `myCommissionLogs` | `{ page?, pageSize? }` | `{ list, total, ... }` | 佣金流水（含 amount/type/balanceAfter/note） |
| `myLevel` | — | `{ current, title, rate, totalCommission, teamCount, next: {level,title,needCommission,needTeam} }` | 当前等级 + 升级进度（距下一级差多少佣金/人数） |
| `inviteInfo` | — | `{ inviteCode, invitePath, shareTitle, rules[] }` | 邀请码 + 邀请路径 + 静态分销说明（5 条规则文案） |

---

## 🔗 关键集成函数（供 mall / wxpay / refund 复用）

> 这两个函数是分销**全闭环**的核心，必须放在事务内调用。

### `settleCommission(tx, orderId)` — 订单支付完成结算佣金

**调用点**：`modules/wxpay/wxpay.routes.ts:160`（notify paid 事务内，`if (order.sourceUserId)` 守卫）

**逻辑**：
1. 查 DistrOrder，**非 pending 直接返回**（幂等：重复回调安全）
2. 0 佣金（payAmount=0 / 积分单）→ 直接标 `settled`，返回
3. 有佣金 → 钱包入账（`wallet.balance increment` 原子）+ `WalletTransaction(type=commission)` + `CommissionLog(type=settle, balanceAfter 快照)` + DistrOrder → `settled`
4. **等级重算**：基于累计 balanceAfter + 直推 teamCount，调 `computeLevel` 写 `User.distributorLevel`

### `clawbackCommission(tx, orderId)` — 订单退款冲红佣金

**调用点**：`modules/mall/refund.service.ts:110`（refund 事务内，`if (order.sourceUserId)` 守卫）

**逻辑**：
1. 查 DistrOrder，**已 cancelled 直接返回**（幂等）
2. pending（未结算）→ 直接标 `cancelled`，返回
3. settled（已入账）→ 钱包扣减（`wallet.balance decrement`，**允许负**，钱已退必须如实记账）+ `WalletTransaction(type=commission_clawback, amount=-佣金)` + `CommissionLog(type=clawback)` + DistrOrder → `cancelled`

### mall.createOrder 集成（创建期）

**调用点**：`modules/mall/order.service.ts:89-160`

下单时解析 `input.inviteCode`：
1. `prisma.user.findFirst({ where: { inviteCode } })` 找上线
2. **防自邀**：`inviter.id !== userId` 才建分销关系
3. `commissionRate = levelRate(inviter.distributorLevel)` 按上线等级
4. 查上线的直推上线（建 `Team.level=2` 间推关系，但 MVP 不发间推佣金）
5. 事务内：`Order.sourceUserId = inviter.id` + 落 `DistrOrder(pending, commissionAmount=round(payAmount*rate*100)/100)` + 落 `Team`（直推 + 间推，唯一约束防重）

---

## 📊 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| **DistributionOrder** | `userId`（上线）+ `orderId`（@unique）+ `orderAmount` + `commissionAmount` + `commissionRate` + `status`（pending/settled/cancelled）+ `settledAt?` | 一单一记，佣金快照（rate 落库防等级变更后追溯） |
| **Team** | `inviterId` + `inviteeId`（@unique，一人一上线）+ `level`（1=直推/2=间推）+ `joinedAt` | 邀请关系，唯一约束防重 |
| **CommissionLog** | `userId` + `orderId?` + `amount`（settle 正/clawback 负）+ `type` + `balanceAfter` + `note` | 佣金流水，balanceAfter 累计快照（用于等级计算） |

**User 加字段**（V0.1.24）：`inviteCode String? @unique`（6 位大写字母数字，首次访问懒生成）+ `distributorLevel String @default("V0")`（V0/V1/V2/V3）

**Order 加字段**（V0.1.24）：`sourceUserId String?`（推广来源，null=非分销单）

---

## 🧪 测试

`tests/modules/distribution/distribution.service.test.ts` — **17 单元测试**：

| describe | 用例数 | 覆盖点 |
| --- | ---: | --- |
| `computeLevel / levelRate`（纯函数） | 6 | 0 佣金 0 人 → V0 / 100 元边界 → V1 / 3 人 → V1 / 500 元 → V2 / 2000 元 → V3 / V3 优先于 V1（取最高） |
| `ensureInviteCode` | 2 | 有 current 直返 / 无则 updateMany 生成（5 次重试 + 兜底） |
| `mySummary / myLevel` | 2 | 聚合查询返回结构正确 |
| `settleCommission` | 4 | 非 pending 跳过（幂等）/ 0 佣金直标 settled / 有佣金入账（钱包+WalletTransaction+CommissionLog+等级重算）/ settle 后 update DistrOrder |
| `clawbackCommission` | 3 | cancelled 跳过（幂等）/ pending → cancelled / settled 冲红（钱包扣减 + 负 CommissionLog） |

**mock 策略**：`vi.mock('src/infra/prisma.js')` + `vi.mock('src/modules/wallet/wallet.repo.js')`，不连 DB

---

## 🔧 关键依赖与配置

- **Prisma 表**：3 张（DistributionOrder / Team / CommissionLog）+ User 加 2 字段 + Order 加 1 字段
- **复用 walletRepo**：`ensureWalletInTx`（事务内钱包创建/获取）
- **常量**：`LEVEL_RULES`（service 内常量，从高到低排序）
- **时区**：`monthRangeCN()` 东八区本月范围（用于「本月佣金/销售」统计）
- **inviteCode 生成**：`Math.random().toString(36).slice(2,8).toUpperCase()`（6 位），5 次重试，兜底 `U` + cuid 末 5 位

---

## 📌 常见问题 (FAQ)

**Q：间推佣金什么时候发？**
A：MVP 暂不发。关系已记录在 `Team.level=2`，GAP-6 二次上线时基于现成关系补算即可，无需补数据。

**Q：等级什么时候重算？**
A：只在 `settleCommission` 内同步重算（单用户数据量小，O(1) 查询）。`clawbackCommission` 不降级（保守策略，避免抖动）。

**Q：钱包余额能扣成负数吗？**
A：能。已 settle 的订单退款时，`wallet.balance decrement` 允许负（钱已退必须如实记账）。用户下次佣金入账会自动补回。

**Q：自邀怎么防？**
A：`mall.createOrder` 内 `if (inviter && inviter.id !== userId)` 守卫。自己的 inviteCode 下单不会建分销关系。

**Q：等级变更后历史订单佣金会追溯调整吗？**
A：不会。`commissionRate` 在下单时落 `DistrOrder` 快照，之后不变。等级只影响**新订单**的 rate。

---

## 📁 相关文件清单

```
src/modules/distribution/
├── distribution.routes.ts          # POST /api/distribution（6 action switch）
├── distribution.service.ts         # 6 查询 + settle/clawback 集成 + LEVEL_RULES
├── distribution.schema.ts          # Zod schemas（PageInput/TeamInput/ActionBody）
└── CLAUDE.md                       # 本文件

tests/modules/distribution/
└── distribution.service.test.ts    # 17 单元测试

# 集成点（外部 module）
src/modules/mall/order.service.ts   # createOrder 解析 inviteCode 落 DistrOrder + Team（行 89-160）
src/modules/wxpay/wxpay.routes.ts   # notify paid → settleCommission（行 158-161）
src/modules/mall/refund.service.ts  # refund → clawbackCommission（行 108-111）

# Prisma
prisma/schema.prisma                # DistributionOrder / Team / CommissionLog 模型
prisma/migrations/20260703120000_distribution/migration.sql  # 建表 SQL
```

---

## 📝 变更记录 (Changelog)

- **2026-07-03** — 创建（V0.1.24，B 剩余 workflow 方案 1 全持久化闭环）：3 表 + 6 action + settle/clawback 全闭环集成 + LEVEL_RULES + 17 单测；首个 module 级 CLAUDE.md
