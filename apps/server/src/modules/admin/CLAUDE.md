# admin module — 运营管理后台

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **admin/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[mall](../../mall/) / [wallet](../../wallet/) / [wxpay](../../wxpay/) / [content](../../content/)

> 引入版本：**V0.1.0**（admin V1），重构 **V0.1.18**（service 范式 + 黑名单 + 审计），持续扩展到 **V0.1.131**（18+ action）

---

## 🎯 模块职责

**运营管理后台 API**：白名单 openid 守卫（`isAdmin` 缓存），覆盖商品 / 订单 / 内容 / 用户 / 提现 / 训练计划 / 团购 / 审计 / 报表 / 导出 / 评价 等 25+ 业务 action。
对应独立 Web 仓 `qm-admin`（React + Umi Max + antd 5，独立 deploy 在 `qingmu/qm-admin` GitHub + CT400 Gitea，**V0.1.131 同步**）。

- **白名单机制**：User 表 `distriOpenid` / `adminOpenid` 字段 + `isAdmin(openid)` 5min 内存缓存（prisma cache）
- **审计**：所有写操作（setConfig / banUser / unbanUser / refundOrder / approveWithdrawal / rejectWithdrawal / confirmPickup / exportOrders / exportSettlement / exportUsers / upsertTrainingPlan / upsertGroupBuy / addReviewReply）记录 `AuditLog` 表（action/target/by/ip/timestamp）
- **导出**：3 个 CSV action 复用 `common/csv.ts` 工具 + UTF8_BOM Excel 中文兼容
- **结算单**（V0.1.108）：按月份汇总分销商本月订单 + 佣金 + 累计，导出 CSV

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `admin.service.ts` | 25+ 函数（含 isAdmin 缓存、AuditLog、CSV 导出） | ~600 |
| `admin.routes.ts` | 25+ route switch action（统一走 `/api/admin`） | ~150 |
| `admin.schema.ts` | Zod schemas（ListXxxInput / UpsertXxxInput / ExportXxxQuery） | ~170 |

注册：`src/app.ts` 内 `app.register(adminRoutes, { prefix: '/api/admin' })`

---

## 📡 对外接口（25+ action）

### 鉴权守门

| function | 说明 |
| --- | --- |
| `isAdmin(openid)` | 查 User.openid 是否在 distriOpenid/adminOpenid 白名单；**5min 内存缓存**避免每请求查 DB |

### 商品 / 订单

| action | 说明 |
| --- | --- |
| `listProducts` | 商品列表（含 status / 分类） |
| `listOrders` | 订单列表（按 status / 时间段 / openid 过滤） |
| `updateOrderStatus` | 改订单 status（走 `order-state.ts` assertTransition 白名单） |
| `refundOrder` | 退款（限定 paid 状态，事务内调 `wxpay.refund` + `wallet.decrement` + WalletTransaction + AuditLog） |

### 内容 / 用户 / 配置

| action | 说明 |
| --- | --- |
| `listContents` | 内容列表（含 status / category） |
| `upsertContent` | 创建/更新内容（赛事/酒店/景区等） |
| `listUsers` | 用户列表（含 onboardingDone / 绑定状态） |
| `setConfig` | 改 AppConfig 字段（feature_flags 触发缓存失效） |

### 黑名单 / 审计

| action | 说明 |
| --- | --- |
| `banUser` | 加黑名单（写 Blacklist + AuditLog） |
| `unbanUser` | 解除（删 Blacklist + AuditLog） |
| `listAuditLogs` | 审计日志查询（按 action / target / 时间段） |

### 提现（V0.1.106 GAP-6 段 2）

| action | 说明 |
| --- | --- |
| `listWithdrawals` | 提现申请列表（按 status 过滤） |
| `approveWithdrawal` | 通过（事务内二次校验余额 + 扣减 + WalletTransaction(type=withdraw) + AuditLog） |
| `rejectWithdrawal` | 拒绝（仅标状态 + AuditLog） |

### 自提核销（V0.1.107 GAP-6 段 3）

| action | 说明 |
| --- | --- |
| `confirmPickup` | 按 pickupCode 核销（校验 code 存在 / 未核销 / 未过期 / 已支付 → update pickupConfirmedAt + AuditLog） |

### 训练计划（V0.1.41）

| action | 说明 |
| --- | --- |
| `upsertTrainingPlan` | 创建/更新训练计划模板 |
| `listTrainingPlans` | 模板列表 |

### 团购（V0.1.38）

| action | 说明 |
| --- | --- |
| `upsertGroupBuy` | 创建/更新团购（校验商品 + groupPrice/targetCount/endDate） |
| `listGroupBuys` | admin 列表（含 product + 进度 currentCount/targetCount） |

### 评价（V0.1.118/V0.1.123）

| action | 说明 |
| --- | --- |
| `addReviewReply` | admin 回复评价（Review +Reply，cascade） |
| `listReviews` | 评价管理查询（按 userId / productId / 时间段） |

### 导出（CSV）

| action | 说明 |
| --- | --- |
| `exportOrders` | 订单 CSV 导出 |
| `exportUsers` | 用户 CSV 导出 |
| `exportSettlement`（V0.1.108） | 分销商月结算单 CSV（按月份汇总） |

### 报表 / 统计

| action | 说明 |
| --- | --- |
| `stats` | 平台总览统计 |
| `statsByTimeRange` | 按时间段统计 |

---

## 🔗 关键集成函数（按依赖排列）

### `isAdmin(openid)` — 白名单守门
- 业务：营销白名单（distriOpenid / adminOpenid）+ 5min 缓存
- 缓存：`isAdminCache: Map<openid, boolean>`（globalMapKey `admin:openid:{openid}`）
- 调用：每个 admin route 第一行强制守门

### `recordAudit({action, target, by, ip?, payload?}, tx?)` — 审计日志
- 写入 `AuditLog` 表（onDelete RESTRICT 但 actor 用 openid 字符串）
- 失败时 console.error 不抛错（**不阻塞主业务**，fail-safe）
- 调用方：所有 admin 写操作

### `refundOrder` 集成闭环
1. 守门 isAdmin
2. 校验 order.status === 'paid'
3. **事务**内：
   - `wxpay.refund(input)`
   - 调 `wallet.ensureWalletInTx(tx, userId)`
   - `tx.wallet.update { balance: { decrement: amount } }`
   - `tx.walletTransaction.create({type: 'refund', amount: -amount})`
   - `tx.order.update({status: 'refunded'})`
   - `tx.auditLog.create({...})`
4. **业务不变量**：balance 允许负（钱已退必须如实记账）

### `confirmPickup` 集成闭环
- 不动 status（KISS：business 上 paid+核销=完成，不触发状态机翻转）
- 仅 update `pickupConfirmedAt` + `pickupConfirmedBy` + AuditLog

### `approveWithdrawal` 集成闭环
- 事务内二次校验余额（防并发双花）
- 余额不足自动转 rejected（含 reason="balance_insufficient_at_approval"）
- 写 WalletTransaction(type=withdraw, amount=-amount) + AuditLog

---

## 📊 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| **AuditLog** | id / action(String enum) / target / by(openid) / payload?(JSON) / ip? / createdAt | 审计日志 + 索引 [action, createdAt]+[by, createdAt] |
| **Blacklist** | id / openid(@unique) / reason? / createdAt | 黑名单（被 banUser 管理） |

**User 加 2 字段**：`distriOpenid` / `adminOpenid`（V0.1.18 init migration）

---

## 🧪 测试

`tests/modules/admin/`（V0.1.131）：
- `admin.service.test.ts` — **31 单元测试**（最大 module）
- `admin.routes.test.ts` — **22 路由单测**
- `admin.export.test.ts` — **7 CSV 导出单测**（orders / users / settlement + UTF8_BOM）

覆盖策略：
- service 单测 mock Prisma 不连 DB
- routes 单测用 Fastify inject + vi.hoisted mock service+errors+schema
- 关键点：isAdmin 缓存可清 + AuditLog 失败 fail-safe + 退款事务一致性 + 自提校验链 + 提现二次校验

---

## 🔧 关键依赖与配置

- **白名单字段**：User.distriOpenid / adminOpenid（手工 SQL 维护）
- **依赖**：`common/errors`（forbidden/badRequest/notFound）/ `common/csv`（CSV 工具）/ `domain/order-state`（assertTransition）/ `wxpay`（refund）/ `wallet`（ensureWalletInTx + decrement）/ `Distribution` module（listWithdrawals / exportSettlement 调）
- **缓存**：isAdmin 5min 内存缓存（如需扩展 Redis，YAGNI 待 V0.1.132+）
- **IP**：req.ip 透传 recordAudit（Fastify 已配 trustProxy）

---

## 📌 常见问题 (FAQ)

**Q：白名单 openid 是哪个表的字段？**
A：User 表 `distriOpenid`（分销白名单）+ `adminOpenid`（运营白名单），任一非空即视为有 admin 权限。

**Q：退款能退部分金额吗？**
A：当前 `wxpay.refund` 调用只支持全单退款（按 payAmount）。部分退款需调 wxpay.refund 多次 + 累计金额校验（V0.1.132+ 补）。

**Q：refundOrder 会自动减余额吗？**
A：会。事务内 `wallet.balance decrement` + WalletTransaction(type=refund, amount=-amount)。

**Q：CSV 导出能加筛选条件吗？**
A：V0.1.131 exportOrders/exportUsers 支持时间范围 + status 过滤；exportSettlement（V0.1.108）按 yearMonth 过滤。

**Q：AuditLog 表会无限增长吗？**
A：当前 YAGNI 不分表（百万级 OK），V0.1.150+ 量大时按月分区或归档。

**Q：BanUser 后该用户还能登录吗？**
A：能登录但所有受保护操作走 blacklist 守门；前端可调 `user.me` 返 `{banned: true}` 让前端弹提示。

**Q：评价回复在哪个 action？**
A：`addReviewReply`（V0.1.118），写 `Reply` 表（Review 1:N），cascade delete。

---

## 📁 相关文件清单

```
src/modules/admin/
├── admin.routes.ts            # 25+ action switch
├── admin.service.ts           # isAdmin 缓存 + 所有 action
├── admin.schema.ts            # Zod schemas（多个 Input）
└── CLAUDE.md                  # 本文件

tests/modules/admin/
├── admin.service.test.ts      # 31 单测
├── admin.routes.test.ts       # 22 路由单测
└── admin.export.test.ts       # 7 CSV 导出单测

# 集成点
src/modules/wxpay/wxpay.service.ts  # refund
src/modules/wallet/wallet.repo.ts   # ensureWalletInTx
src/domain/order-state.ts            # assertTransition
src/modules/distribution/distribution.service.ts  # exportSettlement
```

---

## 📝 变更记录 (Changelog)

- **2026-06-29** — V0.1.18 admin 重构（service 276→522 行 / 18+2 action / AuditLog / Blacklist / StatsByTimeRange / ExportOrders / ExportUsers CSV）— **GAP-2 关闭**
- **2026-07-08** — V0.1.38 +upsertGroupBuy / listGroupBuys（团购 admin 管理）
- **2026-07-08** — V0.1.41 +upsertTrainingPlan / listTrainingPlans（训练计划 admin 管理）
- **2026-07-10** — V0.1.106 +listWithdrawals / approveWithdrawal / rejectWithdrawal（提现 stub / **GAP-6 段 2**）
- **2026-07-10** — V0.1.107 +confirmPickup（自提核销 / **GAP-6 段 3**）
- **2026-07-10** — V0.1.108 +exportSettlement（分销商月结算单 CSV / **GAP-6 段 4 收官** — GAP-6 全清零）
- **2026-07-11** — V0.1.118 +addReviewReply（评价回复 / Review 1:N Reply）
- **2026-07-11** — V0.1.123 +listReviews（评价管理 query，qm-admin 评价管理页支撑）
- **2026-07-12** — V0.1.131 创建 module 级 CLAUDE.md（**GAP-8 关闭**主仓侧 + qm-admin V0.1.131 同步）
- **2026-07-16** — 🎯 **V0.2.8 admin RBAC 独立账号体系（替白名单 openid）**：`/zcf:workflow` 一阶段；**新表 Admin #60**（迁移 `20260716040000_admin_rbac`：id/username @unique + passwordHash + role(super-admin/admin/operator) + displayName? + disabled Boolean @default(false) + lastLoginAt? + createdAt/updatedAt，**禁用物理删除**，用 disabled 字段标停用）+ **AdminLoginLog #61**（adminId/loginAt/ip?/userAgent?/ok Boolean/failureReason?/createdAt，**全量登录审计**含失败原因）；**`checkPermission(role, action)`** 工具函数（admin.service.ts:82）— SUPER_ONLY_ACTIONS 列表（listAdmins/createAdmin/disableAdmin/setConfig/adminLoginLogs）+ ADMIN_ALLOWED_ACTIONS（listAdmins 只读 / upsertContent / listUsers / stats 等）+ OPERATOR_ALLOWED_ACTIONS（listContents/listOrders/listUsers 只读）；**`adminLogin({username, password})`**（admin.service.ts:93）— bcrypt 校验 + signTokens helper 签 JWT（`kind:'admin' / sub:adminId / role`，admin 专属 token 与小程序 access 区分）+ 写 AdminLoginLog（成功 ok=true / 失败 ok=false failureReason=invalid_credentials|admin_disabled）+ lastLoginAt 更新；**+8 新 action 集成在 admin.service.ts**（无 routes.ts 改动）：`listAdmins` / `createAdmin(username,password,role,displayName?)`（bcrypt 10 rounds）/ `updateAdmin` / `disableAdmin`（设 disabled=true 而非删）/ `setConfig`（V0.1.0 就有，V0.2.8 加 checkPermission 守门）/ `adminLoginLogs`（按 adminId + 时间段查询）/ `adminLogin` / `checkPermission` helper；**3 角色语义**：super-admin（全部权限）/ admin（运营，禁 SUPER_ONLY）/ operator（只读 + 轻操作）；**预置账号**（seed.ts）：root(super-admin) + admin(admin) 密码 bcrypt 注入 env；**新文件 `apps/miniprogram/CLAUDE.md` 顶部** V0.2.8 段；**admin.routes.ts:87** middleware 加 `await checkPermission(req.user.role, 'listAdmins')` 拦截；**admin.rbac.test.ts 8 用例**（checkPermission 三角色 × SUPER_ONLY/普通/OPERATOR 三种 action 组合）/ **admin.export.test.ts 7 用例**；**Funcs 86.39% 沿用**（admin.service 522→~1300 行新增风险点建议实跑 funcs 验证）+ **test:coverage V0.2.8 部署前必实跑（GAP-14）**；commit 待；**59→61 表 / 43→46 迁移 / 1055 测（+20：rbac 8 + export 7 + 边角 5）**
