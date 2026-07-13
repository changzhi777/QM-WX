# mall Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > [modules](../) > **mall**

## 职责

商城核心 module。商品浏览（列表/分类/详情）+ 订单生命周期（下单/我的订单/取消）+ 退款入口。`createOrder` 是**多场景扩展**的中央 hub：积分兑换、微信支付、分销佣金、团购价快照、自提核销码全部在这里汇聚成单一事务。设计原则（02 §5.4）：余额/积分/订单状态一律**服务端权威**，前端只展示与发起。

## 入口

- **路由注册**：`app.ts` 注册 `mallRoutes`，namespace `/api/mall`
- **路由前缀**：`POST /api/mall`（单一 POST 入口 + action dispatch）
- **鉴权**：整 endpoint 标 `config: { public: true }` 跳过全局 JWT；受保护 action（createOrder / myOrders / cancelOrder）内部调 `requireLogin(req)`
- **退款入口**：`refundService.refundOrder` 不通过 HTTP 暴露，由 `admin.service` 鉴权后调用

## Action 清单

| action | 方法签名 | 功能 | 备注 |
|--------|---------|------|------|
| `listCategories` | `(input: {includeCount?})` | 商品分类列表 | includeCount=true 走 groupBy + Cache 60s；false 走 distinct（不缓存） |
| `listProducts` | `(input: {category?, brand?, keyword?, page, pageSize})` | 商品列表（过滤+分页） | Cache.wrap 60s，公开端点；Decimal 序列化 |
| `productDetail` | `(id: string)` | 商品详情 | Cache.wrap 300s；不存在/下架 notFound 且**不缓存**（防穿透） |
| `createOrder` | `(userId, input: CreateOrderInput)` | 创建订单 | 多场景扩展 hub，详见范式 1-5 |
| `myOrders` | `(userId, input: {status?, page, pageSize})` | 我的订单列表 | list/count 同 where（修 N+1 不一致） |
| `cancelOrder` | `(userId, orderId)` | 取消订单（仅 pending_pay） | 状态机 `assertTransition`，已扣积分退回 |
| **内部** `refundService.refundOrder` | `(input: {orderId, amountFen?, reason?, refundedBy})` | 管理员退款 | 限 paid 状态；微信 refund + 事务内 order→refunded + walletService.consumeInTx(allowNegative) + 分销佣金 clawback |
| **导出** `generatePickupCode` | `(orderId: string) => string` | 自提核销码生成（纯函数） | V0.1.107，订单号末 6 位 + 3 位大写字母数字（避开 I/O/0/1） |
| **导出** `invalidateProductsCache` | `() => Promise<number>` | 抹掉 mall:* 全部缓存 | admin.upsertProduct 调用 |
| **导出** `invalidateProductDetail` | `(productId: string) => Promise<number>` | 精准删单个商品详情缓存 | admin.upsertProduct 调用 |

## 数据模型（Prisma）

| Model | 关键字段/索引 | 用途 |
|-------|---------------|------|
| **Product** | `category/brand/status/sort`、`price/originalPrice Decimal(10,2)`、`images[]` | 商品主表；`@@index([category, status])` |
| **Order** | `status`、`payChannel`、`prepayId`、`wxTransactionId @unique`、`paidAt`、`sourceUserId?`（分销 V0.1.24）、`groupBuyId?`（团购 V0.1.38）、`contentType/contentId?`（赛事 V0.1.119）、`pickupCode @unique`/`pickupExpiresAt`/`pickupConfirmedAt/By`（自提 V0.1.107） | 订单主表，7 态状态机 |
| **OrderItem** | `productId/name/price Decimal/qty` | 订单明细；团购价快照在此（V0.1.38） |
| **GroupBuy / GroupBuyMember** | 见 [group-buy module](../group-buy/) | createOrder 校验 reached+已参与 |
| **DistributionOrder / Team** | 见 [distribution module](../distribution/CLAUDE.md) | createOrder 落 sourceUserId + 佣金关系 |
| **Wallet / WalletTransaction** | 见 [wallet module](../wallet/CLAUDE.md) | refund.service 调 consumeInTx 写 type=refund 流水 |

**Order 状态机**：见 `domain/order-state.ts`，7 态（pending_pay / paid / shipped / done / cancelled / refunded / closed）+ TRANSITIONS 白名单 + `assertTransition`（Phase 4.1）。

## 集成点

- **被调用方（前端）**：`pages/mall/` 商品流、`pages/product-detail/`、`pages/order-list/`（5 tab）、`pages/group-buy-detail/` 团购下单
- **调用方（service 间）**：
  - `wxpay.notify`：支付回调 → `Order.update({status:'paid', paidAt, wxTransactionId})` + 触发 `settleCommission`（分销佣金入账）
  - `wxpay.service`（`unifiedOrder`）：createOrder 走 wxpay 下单 → 落 `prepayId` 返 `payParams`
  - `wallet.service`（`consumeInTx`）：refund.service 退款扣余额（type='refund', allowNegative=true）
  - `distribution.service`（`levelRate` + `clawbackCommission`）：createOrder 解析 inviteCode + refund 触发佣金冲红
  - `user.repository`（`addPoints`）：积分全额兑换扣减 / 取消时退回
  - `admin.service`（`assertNotBanned`）：黑名单拦截下单
  - `app-config.repository`（`getLoginConfig`）：读 `featureFlags.payment` 开关
  - `jobs/queue`（`enqueueCloseOrder`）：pending_pay 单入队 30 分钟超时关单
- **缓存**：listProducts 60s / listCategories 60s / productDetail 300s（详见范式 6）
- **BullMQ**：仅 pending_pay 入队；积分全额兑换（status=paid）不入队
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| `tests/modules/mall/mall.service.test.ts` | 21 | listCategories(4) + listProducts(6 含缓存) + productDetail(5 含缓存+失效) + invalidateProductsCache(1) + 缓存行为(5) |
| `tests/modules/mall/order.service.test.ts` | 19 | create(4 积分/团购校验) + cancel(5 状态机+积分退回) + generatePickupCode(3) + myOrders(3 N+1 修+序列化) + 团购校验(4) |
| `tests/modules/mall/refund.service.test.ts` | 8 | notFound / 非 paid / 无 wxTransactionId / amountFen 超额 / wxpay 失败 / happy path / 部分退款 / **P0-2 余额已花光退款走负不回滚** |
| `tests/modules/mall/mall.routes.test.ts` | 10 | 公开端点(5) + 受保护端点鉴权(5) + unknown action |
| `tests/e2e/mall-flow.e2e.test.ts` | 3 | 完整 Happy Path：登录→listProducts→createOrder→myOrders→cancelOrder→积分回退 |
| `tests/e2e/refund-flow.e2e.test.ts` | 3 | 真 PG/Redis 退款闭环 |

**合计**：58 单元 + 6 e2e = 64 测试。**覆盖率约 84.73%**（V0.1.112 实测；routes 全测后拉升）。

## 关键范式与坑

1. **createOrder 多场景扩展（中央 hub 范式）**
   - payment=OFF + 积分足额 → status=paid, payChannel=points（0 元兑换）
   - payment=OFF + 积分不足 → status=pending_pay, payChannel=null（意向单）
   - payment=ON + 无积分抵扣 → payChannel=wxpay, 调 `unifiedOrder` 返 payParams
   - payment=ON + 部分积分抵扣 → payChannel=wxpay, payAmount = total - pointsValue
   - 所有场景共用同一 `$transaction` 写 order/items/扣积分/分销落单/自提码

2. **事务内/事务外边界（铁律）**
   - **事务内**：写 order + OrderItem + 扣积分 + 分销 DistrOrder + Team + pickupCode
   - **事务外**：`unifiedOrder`（外部 IO 不可在 DB 事务内）+ 入队 `enqueueCloseOrder`（异步）
   - 顺序：先事务（拿 orderId）→ 再 wxpay 下单 → 落 `prepayId`

3. **团购价快照（V0.1.38）**
   - 校验链：团购存在 → status='reached' → 已参与（GroupBuyMember 存在）→ 单一团购商品（items.length===1 且 productId 匹配）
   - OrderItem.price = `groupPrice`（锁定价快照，不随活动变更）

4. **分销集成（V0.1.24）**
   - 解析 inviteCode → 防自邀（inviter !== self）→ `levelRate(inviter.distributorLevel)` 算佣金率
   - 事务内落：`DistrOrder(pending)` + `Team(level=1 直推)` + 可选 `Team(level=2 间推)`
   - 间推关系记录但佣金 MVP 仅直推（V0.1.105 间推佣金已上线）

5. **自提核销码 generatePickupCode（V0.1.107 纯函数）**
   - 订单号末 6 位 + 3 位 28 字符表（`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`，避开 I/O/0/1 OCR 易混淆）
   - `@unique` 兜底碰撞（订单量 < 1000 时碰撞概率 < 0.1%）
   - 默认 30 天过期；admin.confirmPickup 核销（在 admin module）

6. **Decimal 序列化进缓存（V0.1.10 范式，跨 module）**
   - Prisma Decimal 经 `JSON.stringify` 会损坏（变对象/精度丢失）
   - **进缓存前**显式 `price?.toString() ?? null`，保证缓存 hit/miss 返回类型一致
   - 同范式：`totalAmount.toString()` / `payAmount.toString()` 在 myOrders / 详情接口

7. **缓存命中/miss/失效三件套（V0.1.6~9）**
   - listProducts：key 含 category/brand/keyword/page/pageSize 五元组；写后 `delByPattern('mall:*')` 抹全分页
   - listCategories：固定 key（includeCount=true 才缓存；distinct 极轻量不缓存）
   - productDetail：单 id key；写后 `invalidateProductDetail(id)` 精准删（不等 300s TTL）
   - **异常不缓存**：商品不存在/下架 → Cache.wrap propagate loader 抛错，不写缓存（防穿透）
   - **cache fail-open**：Redis 挂掉静默降级直查 DB

8. **退款 P0-2 范式：余额已花光仍须成功（V0.1.x）**
   - 微信退款已不可逆发生 → 本地必须如实记账
   - `consumeInTx(amount=-refundYuan, allowNegative: true)` → 钱包原子自减（结果负数=欠款）
   - **绝不能**因"余额不足"抛错回滚 → 否则会出现"钱已退、本地仍 paid"的账实漂移

9. **myOrders N+1 修复（V0.1.112）**
   - 旧代码 count 缺 status 过滤（total 永远 = 全表，与 list 不一致 → UI 分页错乱）
   - 修复：list 与 count 用**同一 where**（含 status）

10. **addPoints 正负分支（V0.1.112 跨 module 范式）**
    - 取消时退积分（change > 0）：`tx.user.update({data: {points: {increment}}})` 无条件
    - 下单扣积分（change < 0）：走 `userRepo.addPoints` 内部 `updateMany` 条件 `points >= -change`（防并发双花）

## 版本演进

- **V0.1.6~9** — listProducts/listCategories/productDetail 接入 Cache.wrap（60s/60s/300s TTL）+ 写后失效工具
- **V0.1.10** — Decimal 序列化进缓存范式确立（同 content module）
- **V0.1.21** — seed 商品 3→8（T恤/水杯/帽子/腿套/毛巾 4 分类）
- **V0.1.24** — **分销集成**：createOrder 解析 inviteCode 落 DistrOrder + Team（直推+间推关系）；Order +sourceUserId 字段
- **V0.1.37** — **团购校验**：createOrder 校验 reached + 已参与 + 单一团购商品
- **V0.1.38** — **团购价快照**：OrderItem.price = groupPrice；Order +groupBuyId（onDelete SetNull）
- **V0.1.107** — **GAP-6 自提核销码**：generatePickupCode 纯函数 + Order +pickupCode/pickupExpiresAt/pickupConfirmedAt/By；deliveryType enum
- **V0.1.112** — **GAP-3.5 routes 全测 + service 补漏**：mall.routes.test 10 测 + order.service +8 测（myOrders 3 含 N+1 修 + 团购校验 4 + cancel 退积分）；mall 覆盖率 75.57→**84.73%**
- **V0.1.119** — Order +contentType/contentId 区分赛事订单（与 content module 共用 Order 表）
- **Phase 4.1** — refund.service 限 paid + wxpay.refund + walletService.consumeInTx(allowNegative) + clawbackCommission；Order 状态机白名单 assertTransition
