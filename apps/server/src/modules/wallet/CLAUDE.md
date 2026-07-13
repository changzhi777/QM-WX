# wallet Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > [modules](../) > **wallet**

## 职责

钱包/流水/充值/扣款。是项目里**被复用最重**的 module：`walletRepo.ensureWalletInTx` 是事务内写 WalletTransaction 的统一前置入口，被 wxpay 支付入账 / refund 退款扣减 / 分销佣金结算+回滚 / 赛事报名余额支付 / admin 提现审批 5 个跨 module 业务共享。设计铁律（02 §6）：`balance` 字段**绝不**接受前端写入，只在「支付回调验签成功」或「订单扣减」时由 service 修改。

## 入口

- **路由注册**：`app.ts` 注册 `walletRoutes`，namespace `/api/wallet`
- **路由前缀**：`POST /api/wallet`（单一 POST 入口 + action dispatch）
- **鉴权**：全部 endpoint 受 `config: { requireFeature: 'wallet' }` 守卫（当前 `wallet=false` → 全部 403）；handler 内 `req.user.id` 取 userId
- **service 间入口（不通过 HTTP）**：
  - `walletService.consumeInTx` — 其他 service 事务内调用扣款/退款
  - `walletRepo.ensureWallet` / `ensureWalletInTx` — 自动建空钱包（事务外/内双入口）

## Action 清单

| action | 方法签名 | 功能 | 备注 |
|--------|---------|------|------|
| `get` | `(userId)` | 钱包余额（自动建空钱包） | balance Decimal → string 序列化 |
| `transactions` | `(userId, {page, pageSize})` | 流水分页 | amount Decimal → string；createdAt ISO |
| `recharge` | `(userId, {amount, payChannel?})` | 充值 | **V1.0 强制 `featureDisabled('payment')`**；Phase 4.2 接 wxpay.unifiedOrder |
| **内部** `consumeInTx` | `(tx, userId, amount, type, orderId?, wxTransactionId?, opts?)` | service 间扣款/退款 | 原子 increment；`allowNegative` 退款专用；type ∈ `recharge\|consume\|refund` |
| **导出** `walletRepo.ensureWallet` | `(userId)` | 事务外自动建空钱包 | get / transactions 入口；findUnique → 不存在 create |
| **导出** `walletRepo.ensureWalletInTx` | `(tx, userId)` | **关键复用入口** — 事务内建空钱包 | 被 wxpay.notify / refund / settle/clawback / content.enroll / admin.approveWithdrawal 共享 |

## 数据模型（Prisma）

| Model | 关键字段/索引 | 用途 |
|-------|---------------|------|
| **Wallet** | `userId @unique`、`balance Decimal(10,2) @default(0)`、`status`（active\|frozen） | 一人一钱包；userId unique 保证 ensureWallet 幂等 |
| **WalletTransaction** | `userId/walletId/type/amount Decimal`、`orderId?`、`wxTransactionId?`、`outRefundNo? @unique`、`status`（success\|pending\|failed） | 流水主表；`@@index([userId, createdAt])`；outRefundNo @unique 防重复退款落库 |
| **PointsRecord** | `userId/change Int/type/refId?/balance Int` | 积分流水（由 `userRepo.addPoints` 写入，与 wallet 配合） |

**WalletTransaction.type 运行时扩展**（schema 是 `String` 无 enum 约束）：
- V1：`recharge` / `consume` / `refund`
- V0.1.24：`commission`（佣金结算入账）/ `commission_clawback`（佣金冲红）— distribution
- V0.1.106：`withdraw`（提现扣减）— admin.approveWithdrawal
- V0.1.117：`content_enroll`（赛事余额支付）— content.enroll

## 集成点

- **被调用方（前端）**：`pages/wallet/`（余额+流水）、`pages/my-enrollments/`（赛事余额支付入口）
- **调用方（service 间，复用 ensureWalletInTx + consumeInTx）**：
  - `wxpay.notify`：支付回调 → consumeInTx(amount=+正, type='recharge') 入账
  - `mall/refund.service`：退款 → consumeInTx(amount=-负, type='refund', **allowNegative=true**) 扣减
  - `distribution.service`（`settleCommission`/`clawbackCommission`）：佣金结算 +正 type='commission' / 冲红 -负 type='commission_clawback'
  - `content.service`（`enroll`）：赛事余额支付 → ensureWalletInTx + consumeInTx(type='content_enroll')
  - `admin.service`（`approveWithdrawal`）：提现审批通过 → 事务内 ensureWalletInTx + 条件扣减 type='withdraw'
- **被 admin 写后失效缓存**：无（wallet 数据强实时，不接 Cache）
- **BullMQ**：无（wallet 本身不入队；超时关单/退款由 mall/wxpay 触发）
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| `tests/modules/wallet/wallet.service.test.ts` | 8 | get(2 已存在+建空) + transactions(1 分页) + recharge(1 featureDisabled) + consumeInTx(4：钱包不存在/冻结/余额不足/正常扣减) |
| `tests/modules/wallet/wallet.repo.test.ts` | 4 | ensureWallet 事务外(2) + ensureWalletInTx 事务内(2，**断言不走顶层 prisma**) |
| `tests/modules/wallet/wallet.routes.test.ts` | 6 | feature gate wallet=false→403 / wallet=true→走 service + 3 action 各 1 + unknown action |

**合计**：**18 单元测试**（无独立 e2e；wallet 在 mall-flow / refund-flow / wxpay-notify e2e 内被间接覆盖）。

**覆盖率**：约 100% lines / 90%+ branches（V0.1.112 实测；含 consumeInTx 全分支 + ensureWallet 双入口 + feature gate 双路径）。

## 关键范式与坑

1. **ensureWallet / ensureWalletInTx 双入口（关键复用范式）**
   - 事务外（service 入口如 get/transactions）：`walletRepo.ensureWallet(userId)` 走顶层 prisma
   - 事务内（wxpay notify / refund / settle / enroll / approveWithdrawal）：`walletRepo.ensureWalletInTx(tx, userId)` **必须传 tx**，否则会破坏事务隔离
   - 故意不用 `upsert`：并发下两个 findUnique 都返 null → 两个 create 由 `Wallet.userId @unique` 兜底 fail-fast（比 upsert 静默吞 race 更安全）
   - 测试范式：`expect(mocks.prisma.wallet.findUnique).not.toHaveBeenCalled()` 断言 tx 入口不走顶层 prisma

2. **consumeInTx 原子 increment 范式（防并发 lost update）**
   - 普通扣减（amount<0，无 allowNegative）：**条件 updateMany** `where: {userId, balance: {gte: -amount}}` — 命中 0 行即余额不足（原子，无 TOCTOU）
   - 充值/退款（amount>0 或 allowNegative=true）：**无条件 update** `{balance: {increment: amount}}`
   - **绝不能**「读出 balance → 算新值 → 覆盖写」 — 并发下会丢失更新

3. **退款 allowNegative 范式（V0.1.x P0-2）**
   - 微信退款已不可逆发生 → 本地必须如实记账
   - 余额为负代表用户欠款（已消费 + 又获退款），**绝不能**因余额不足抛错回滚
   - 否则会出现"钱已退、本地仍 paid"的账实漂移
   - 调用方：`refund.service`（type='refund'）；其他扣款场景禁止传 allowNegative

4. **feature gate 双层守门**
   - 全局层：`config: { requireFeature: 'wallet' }` 中间件拦截 wallet=false → 403
   - service 层：`recharge` 内部强制 `throw Errors.featureDisabled('payment')`（防 feature flag 误开）
   - 当前 wallet=false → 整个 endpoint 403；Phase 4.2 切真生产时开 wallet=true + 接 wxpay

5. **Decimal 序列化（跨 module 范式）**
   - balance / amount 进 API 响应前显式 `.toString()`
   - Prisma Decimal 经 JSON.stringify 会损坏（精度丢失/变对象）
   - 同范式：mall/listProducts / content/detail

6. **outRefundNo @unique 防重复退款落库**
   - refund.service 调微信退款时生成的 `out_refund_no`（格式 `refund-${orderId}-${ts}`）传给微信 + 落 WalletTransaction
   - 同一 outRefundNo 不能重复落库 → 微信回调重试时由 @unique 兜底（已存在则跳过）

7. **WalletTransaction.type 运行时多态**
   - schema 字段是 `String` 而非 enum — 允许后续 module 扩展（commission/withdraw/content_enroll）
   - **代价**：type 字段值靠约定，不在 DB 层强约束（需文档化，本表即文档）
   - 新增 type 必须在本 CLAUDE.md「数据模型」段登记

8. **测试 mock 范式（`createPrismaMock` 工厂 + `$transaction.mockImplementation`）**
   - `tests/helpers/mockPrisma.ts` 的 `createPrismaMock({models, txModels})` 共享 mock 工厂
   - `$transaction.mockImplementation((fn) => fn(mocks.tx))` 让事务回调拿到 tx mock
   - `beforeEach` 必须重新 bind（`clearAllMocks` 会清掉 `mockImplementation`）

## 版本演进

- **V1.0** — wallet module MVP：get/transactions/recharge + ensureWallet；recharge 强制 featureDisabled
- **Phase 4.1**（2026-06-14）— 抽出 `wallet.repo.ts`（ensureWallet/ensureWalletInTx 双入口）；consumeInTx 原子 increment；refund.service 复用 consumeInTx(allowNegative)
- **V0.1.24**（2026-07-03）— **分销集成**：WalletTransaction.type 扩 `commission`/`commission_clawback`；settle/clawback 复用 ensureWalletInTx
- **V0.1.106**（2026-07-10）— **GAP-6 提现 stub**：admin.approveWithdrawal 事务内 ensureWalletInTx + 条件扣减 type='withdraw'（>=10 元 + 余额足 + 无 pending）
- **V0.1.112**（2026-07-10）— **GAP-3.5 routes 全测**：wallet.routes.test 6 测（feature gate 双路径）+ wallet.service.test consumeInTx 全分支；覆盖率 ~100%
- **V0.1.117**（2026-07-11）— **赛事余额支付**：content.enroll 复用 ensureWalletInTx + consumeInTx(type='content_enroll') + enrollment status='confirmed'
- **Phase 4.2 待办** — recharge 接 wxpay.unifiedOrder（移除 featureDisabled 抛错）+ 前端 wx.requestPayment + 回调验签 → consumeInTx(type='recharge', amount=+正) 入账
