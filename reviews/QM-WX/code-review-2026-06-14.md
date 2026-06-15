# QM-WX 代码审查报告

> 审查日期：2026-06-14 · 审查范围：全栈（apps/server + apps/miniprogram + packages/shared）
> 审查侧重：安全 / 正确性 · 代码质量 / 可维护性 · 性能 · 测试覆盖
> 审查对象版本：v0.1.0（Phase 4.1 闭环后）

---

## 0. 结论速览

整体架构方向正确，"服务端权威 + Zod 契约 + 状态机 + 功能开关"骨架扎实，47 个测试文件、~88% 行覆盖。但**在真生产切换（Phase 4.2）之前，有 2 个 P0 必须修**，否则微信支付闭环跑不通或会产生账实不一致。另有若干并发/账务一致性隐患（P1），在灰度量小时不易暴露、量一上来必出事。

按严重度统计：P0 × 2，P1 × 5，P2 × 6，P3 × 6，外加测试缺口若干。

---

## 1. P0 — 阻塞生产（必修）

### P0-1 微信回调验签用重序列化 body，生产环境必然失败

`apps/server/src/modules/wxpay/wxpay.routes.ts:34`

```ts
const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
```

Fastify 默认对 `application/json` 已经 `JSON.parse`，所以这里走的是 `JSON.stringify(req.body)` 分支——把对象**重新序列化**。微信 V3 验签（`wxpay.service.ts:207`）是对**原始字节**做 RSA 验签：

```ts
const signMessage = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;
```

重序列化后的字节（键顺序、空格、Unicode 转义、数字格式）几乎不可能与微信发出的原文逐字节一致 → `verifier.verify(...)` 恒为 `false` → 所有真实回调被判验签失败并回 400，微信不断重试，**订单永远无法标记 paid、钱包永远不入账**。

文件头注释自己写着"raw body 不可 JSON parse"，但实现恰恰违反了它。当前 e2e（`tests/e2e/wxpay-notify.e2e.test.ts`）之所以通过，是因为它用 `vi.mock` 把整个 `verifyAndDecryptNotify` 替换成"恒成功"（直接返回固定 resource、完全跳过验签），所以验签路径从未被真实执行——问题被彻底掩盖。

**修复**：为回调路由注册保留原始字节的 content-type parser，并把原始字符串用于验签。例如：

```ts
// 仅对 wxpay 回调保留 rawBody（或全局加 rawBody 装饰）
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  (req as any).rawBody = body;            // 保留原始字节
  try { done(null, JSON.parse(body)); }   // 仍提供解析后的对象给其它路由
  catch (e) { done(e as Error); }
});
// 回调里：const rawBody = (req as any).rawBody;
```

并补一个回归测试：构造"对象重序列化 ≠ 原始字节"的用例，断言验签仍能通过。

---

### P0-2 退款先调微信、后写库，余额不足会回滚 → 账实不一致

`apps/server/src/modules/mall/refund.service.ts` + `wallet.service.ts:consumeInTx`

退款流程是：① 事务外调 `wxpayRefund`（**钱已经退给用户**）→ ② 事务内 `assertTransition` + `order.update(refunded)` + `consumeInTx(tx, userId, -refundYuan, 'refund')`。

问题出在第②步的钱包扣减。当前"先充值后消费"模型下，微信支付回调走的是 `type:'recharge'`、`balance += amount`（`wxpay.routes.ts`）。如果用户在退款前已经用余额消费掉了这笔钱，`consumeInTx` 里：

```ts
const newBalance = Number(wallet.balance) + amount;   // amount 为负
if (newBalance < 0) throw Errors.badRequest('余额不足');
```

会抛"余额不足" → 整个事务回滚 → **order 仍是 paid，但微信侧钱已经退了**。外部 IO（不可逆）发生在本地提交之前，且没有任何补偿 / 重试 / 失败落库记录。结果是账实长期漂移，且对账脚本也未必能自动修复。

**修复方向（择一或组合）**：
- 调微信退款**前**先在事务里把 order 置 `refunding` 并写一条 pending 退款记录（占位 + 幂等键），微信成功后再 `refunding → refunded` 并结算钱包；失败则回 `paid`。
- 钱包扣减允许在"已消费"场景下走应收/负向流水或独立退款账户，而不是硬卡 `balance >= 0` 后直接抛错回滚。
- 至少：微信退款成功后若本地写库失败，必须落一条"待人工/待补偿"记录并告警，绝不静默回滚丢失。

补一个 e2e：余额已被消费的 paid 订单退款，断言不会出现"微信已退、本地仍 paid 且无记录"的状态。

---

## 2. P1 — 高（并发 / 账务一致性）

### P1-1 超时关单不退积分，且绕过状态机
`apps/server/src/jobs/close-order.job.ts`

部分积分抵扣的订单在 `order.service.create` 创建时即扣积分（`pointsUsed > 0` → `addPoints(-pointsUsed)`），状态 `pending_pay`。手动 `cancel()` 会退积分，但 30 分钟超时的 close-order job **只置 cancelled、不退积分** → 用户积分白白损失。此外该 job 仍硬编码 `data: { status: 'cancelled' }`（注释里写着"⑤统一替换时接 assertTransition"但没接），与 CLAUDE.md 宣称的"状态机硬编码 → 0"不符。
**修复**：close-order 复用 `cancel()` 的退积分逻辑（事务内 `addPoints(+pointsUsed)`）+ 走 `assertTransition`。

### P1-2 积分 / 注册奖励可并发双花
`order.service.create` 在事务外读 `user.points` 做校验，事务内 `addPoints` 用 `points: { increment }`（increment 不防负、无 ≥0 约束）。两个并发下单可都通过"积分足够"校验，最终把积分扣成负数。`login` 的首登奖励同理：`isNew` 判定在 `upsert` 之外，并发首登可发两次 `signup_bonus`。
**修复**：积分扣减放进事务并用条件更新（`updateMany where points >= n`，受影响行数=0 即失败）或加行锁；首登奖励用 `pointsRecord` 唯一约束（userId+type=signup_bonus 唯一）兜底幂等。

### P1-3 consumeInTx 读改写余额无行锁
`wallet.service.ts:consumeInTx` 用 `Number(balance)+amount` 再 `update` 覆盖写，并发会丢失更新（lost update）。notify 路径用的是原子 `increment`（正确），但 consume/refund 走覆盖写——既不一致又有竞态。
**修复**：统一用原子 `increment/decrement`，或在事务内 `SELECT ... FOR UPDATE`（Prisma 可用 `$queryRaw` 锁行）。

### P1-4 notify 无时间戳重放窗口校验
`verifyAndDecryptNotify` 只验 RSA 签名，不校验 `Wechatpay-Timestamp` 新鲜度。攻击者若截获一条合法回调可在签名有效期内重放。当前靠 `wxTransactionId @unique` 兜住了"重复入账"，但重放仍应在入口拒绝。
**修复**：`Math.abs(now - timestamp) > 300s` 直接拒绝。

### P1-5 admin updateOrderStatus 绕过状态机
`admin.routes.ts` 的 `updateOrderStatus` 直接 `order.update({ status })`，无 `assertTransition`。管理员可把订单任意跳到 `refunded` / `paid` 而不触发钱包扣减 / 微信退款副作用 → 账实不一致。是 P0-2 之外另一个能制造漂移的入口。
**修复**：admin 改状态也走 `assertTransition`；涉及退款/支付的目标态必须走对应 service（refundService 等），不允许裸改。

---

## 3. P2 — 中

- **P2-1 验签忽略 `Wechatpay-Serial`**（`wxpay.service.ts`）：只加载单一平台证书、不按 serial 选证书。微信平台证书轮换期间验签会突然失败。建议按 serial 缓存多张平台证书并定期拉取。
- **P2-2 refresh token 无服务端吊销**（`auth.routes.ts`，注释自认"旧的靠前端不重发"）：泄露后 30 天有效，且"轮换"并未真正失效旧 token。建议引入 jti + Redis denylist 或版本号。
- **P2-3 out_refund_no 未落库**（`refund.service.ts`：`refund-${id}-${Date.now()}`）：无法幂等重试，对账难匹配。应持久化退款单号。
- **P2-4 前端 401 刷新竞态 + 无重试上限**（`miniprogram/services/api.ts`）：并发 401 时只有第一个进入 refresh 分支（`!refreshing`），其余直接 toast 报错；retry 后若再 401 会再次触发 refresh，理论上可无限循环。建议：所有 401 都 await 同一个 in-flight refresh，并加单次重试标记。
- **P2-5 addPoints 的 stats.totalPoints 读改写**（`user.repository.ts`）：`points` 用 increment（原子），但同一次更新里 `stats.totalPoints` 是基于读到的旧值重算后 set（JSON），并发丢失更新，导致 points 与 stats.totalPoints 漂移。
- **P2-6 admin 白名单内存缓存多实例不一致**（`admin.routes.ts:_adminCache`）：`invalidateAdminCache` 只清当前进程；多实例部署下改白名单不会全局生效。且 `admin_whitelist` 受 `setConfig` 的 enum 限制无法经接口修改，只能直接改库（运维口径需明确）。

---

## 4. P3 — 低 / 代码质量

- **P3-1** `wxpay.routes.ts` 末尾 `void (null as unknown as FastifyRequest)` 是为抑制未用 import 的 hack —— 直接删掉该 import 即可。
- **P3-2** `verifyAndDecryptNotify` 内用 `require('node:crypto')` 动态取 `createVerify`，与文件顶部 ESM `import` 风格混用；顶部直接 import 即可。
- **P3-3** `downloadBill` 不解压 GZIP（注释自认 MVP），真生产对账需流式解压，目前会拿到压缩字节当 CSV 解析。
- **P3-4** `env.ts` 的 `JWT_SECRET` 仅校验 ≥16 字符，无生产环境弱值/默认值检查；建议生产启动时拒绝明显弱密钥。
- **P3-5** `api.ts` 的 `getBaseUrl` 默认 `http://localhost:3000`；生产必须保证注入 HTTPS 的 `$apiBase`（微信正式环境强制 HTTPS）。建议无注入时 fail-fast 而非静默回退。
- **P3-6** `user.service.bindApps` 是空 TODO 实现却已暴露端点（返回未变更的 user），易被误用；未实现前应回 `featureDisabled` 或 501。

---

## 5. 测试覆盖缺口

现有 47 个测试文件覆盖面好，但**行覆盖 ~88% 不等于并发与账实安全路径被覆盖**。建议补：

1. **回调原始字节回归**（对应 P0-1）：构造"对象重序列化 ≠ 原始字节"的 body，断言验签仍通过——当前 e2e 用一致字符串掩盖了真问题。
2. **退款账实不一致路径**（P0-2）：余额已消费的 paid 订单退款，断言不出现"微信已退、本地仍 paid 且无补偿记录"。
3. **超时关单退积分**（P1-1）：部分积分抵扣单超时后断言积分已退还。
4. **积分 / 余额并发双花**（P1-2/P1-3）：并发下单 / 并发消费的竞态测试。
5. **回调重放拒绝**（P1-4）：旧 timestamp 的合法签名应被拒。
6. **admin 非法状态跳转应被拒**（P1-5）。

---

## 6. 做得好的地方（保持）

- 服务端权威贯彻到位：金额、积分、订单状态均服务端产生，前端只发起；商品价格按 DB 重算而非信任前端。
- Zod 全链路校验 + `packages/shared` 契约先行；`env.ts` 启动 fail-fast。
- 状态机 `domain/order-state.ts` 白名单清晰，大部分写入已统一走 `assertTransition`。
- 幂等设计：`Order.wxTransactionId @unique` 兜住回调重复入账；notify 里多层状态防护（已取消不复活、非 pending_pay 忽略）。
- notify 钱包入账用原子 `increment`（正确范式，建议推广到 consume/refund）。
- 资料更新走字段白名单；模块边界清晰、职责分层（route / service / repo）合理。

---

## 7. 建议修复顺序

1. **切真生产前必修**：P0-1（验签 raw body）、P0-2（退款账实）、P1-5（admin 绕状态机）。
2. **灰度放量前修**：P1-1 ~ P1-4（积分/余额并发、超时退积分、回调重放）。
3. **随后排期**：P2 全部（证书轮换、token 吊销、退款单落库、前端刷新竞态）。
4. **顺手清理**：P3 + 补齐第 5 节测试缺口。

> 与 `docs/PHASE-4-2-PREP.md` 的 9 项 checklist 并轨：建议把 P0-1 / P0-2 / P1-5 直接加入该 checklist 作为"代码侧前置条件"。

---

## 8. 修复记录（2026-06-14 同日）

本轮已落地以下修复（typecheck 通过，相关单元测试全绿）：

- ✅ **P0-1** 回调验签改用原始字节：`app.ts` 注册 `parseAs:'string'` 的 JSON content-type parser，把原文挂到 `req.rawBody`；`wxpay.routes.ts` 验签优先用 `req.rawBody`。补防重放测试。
- ✅ **P0-2** 退款账实一致性（口径：允许余额走负 + 记账）：`wallet.service.consumeInTx` 增加 `allowNegative` 入口，退款时无条件原子自减、不卡"余额不足"、不回滚；`refund.service` 传 `allowNegative:true`。新增"余额已消费完仍成功退款、余额走负"回归测试。余额为负即代表用户欠款，账实不漂移。（残留风险：微信退款成功后若本地事务因 DB 故障等其它原因失败，仍需对账兜底 —— 见 P2-3 退款单落库建议。）
- ✅ **P1-1** 超时关单：`close-order.job.ts` 改为事务内 `assertTransition` + 退还已扣积分（与 `cancel()` 对齐）。
- ✅ **P1-2** 积分双花：`user.repository.addPoints` 扣减走条件 `updateMany(where points>=n)`，命中 0 行抛"积分不足"，消除 TOCTOU。
- ✅ **P1-3** 余额竞态：`wallet.service.consumeInTx` 改原子 `increment` + 条件 `updateMany`，消除 lost update。
- ✅ **P1-4** 回调重放：`verifyAndDecryptNotify` 增加时间戳 ±300s 窗口校验。
- ✅ **P1-5** admin 越权改状态：`admin.routes.updateOrderStatus` 接入 `assertTransition`。
- ✅ **P3-1/P3-2** 清理：删除 `wxpay.routes.ts` 抑制 import 的 hack；`verifyAndDecryptNotify` 改用顶部 `import { createVerify }`。

### 第二批（P2 / P3）

- ✅ **P2-2** refresh token 一次性轮换 + 复用检测：login / refresh 签发的 refresh 带 `jti`；`auth.routes` 用 Redis 黑名单（`auth:refresh:used:{jti}`，TTL=剩余有效期）拉黑已用 token，重复使用 → 401。新增复用拒绝测试。
- ✅ **P2-4** 前端 401 刷新竞态：并发 401 共享同一 `refreshing` promise；新增 `retried` 标记，最多重试一次，杜绝 token 持续失效时的无限递归。
- ✅ **P2-6** admin 白名单缓存加 60s TTL 兜底：多实例部署时白名单变更最迟 60s 内全实例生效（不再仅靠本进程 invalidate）。
- ✅ **P3-3** `downloadBill` 按 gzip 魔数自动解压微信账单（GZIP → CSV）。
- ✅ **P3-4** `env.ts` 生产环境强校验 JWT_SECRET：<32 字符或含占位词（changeme/secret/default 等）直接 fail-fast。
- ✅ **P3-5** 前端 `getBaseUrl`：未注入 `$apiBase` 时仅开发版回退 localhost，体验版/正式版直接抛错（fail-fast，强制配置 HTTPS 后端）。
- ✅ **P3-6** `user.service.bindApps` 改为显式 501（`notImplemented`），不再静默成功误导调用方。
- ✅ **P2-3** 退款单 `out_refund_no` 落库：`WalletTransaction` 加 `outRefundNo String? @unique`（含迁移 `20260614090000_wallet_tx_out_refund_no`）；`consumeInTx` 经 `opts.outRefundNo` 写库；`refund.service` 让微信请求与本地流水共用同一 `out_refund_no`，便于幂等与对账匹配。新增"两处单号一致 + 落库"断言。⚠️ **需在有 DB 的环境执行 `pnpm prisma migrate deploy`（或 `migrate dev`）+ `prisma generate`** 后生效。

测试同步更新：order/wallet/close-order/wxpay/auth 用例适配原子更新、队列隔离与 Redis mock（单元测试不依赖真实 Redis）。**两仓 typecheck 全绿，受影响单元测试 125 项全通过。**

- ✅ **P2-1** 微信平台证书轮换：`wxpay.service` 改为按 `Wechatpay-Serial` 选证书的证书存储（`registerPlatformCert` 用 `X509Certificate` 解析序列号，`WX_PLAT_CERT_PATH` 支持逗号分隔多证书并存）；验签按回调头 serial 精确匹配，未知序列号显式抛错；新增 `fetchPlatformCerts()` 调 `/v3/certificates` 拉取 + APIv3 解密 + 注册（建议定时任务每 12h 刷新）。新增序列号解析测试。
- ✅ **P2-5** `addPoints` 不再 read-modify-write `stats` JSON（消除并发 lost update）：`points` 走原子 increment / 条件 updateMany，`stats.totalPoints` 在 `toUserOutput` 由权威 `points` 派生（二者本就恒等）。

**全部已修复**。本审查发现的 P0/P1/P2/P3 问题均已落地，两仓 typecheck 全绿、受影响单元测试全部通过。

> 📦 **部署提醒**：
> 1. **P2-3** 引入了一条 Prisma 迁移。上线前需在目标库执行 `pnpm --filter @qm-wx/server prisma migrate deploy` 并 `prisma generate`（本审查沙箱无法连库 / 下载引擎，故迁移已写好但未应用；schema、迁移 SQL、业务代码、单元测试均已就绪，并通过临时本地类型校验）。
> 2. **P2-1** 证书自动拉取：✅ 已接入 BullMQ —— `jobs/refresh-certs.job.ts` + `queue.ts` 注册 12h repeatable job（`startJobs` 时，仅当微信支付配置齐全 `WX_MCH_ID/WX_PAY_KEY/WX_MCH_SERIAL_NO/WX_MCH_PRIVATE_KEY_PATH` 且非 test 环境），并在启动时预热拉取一次；`enqueueRefreshCerts()` 可手动触发。仍建议在拿到首张可信证书后对后续 `/v3/certificates` 响应做验签（当前 MVP 跳过响应验签）。
> 3. 这些改动里 `wxpay-notify / refund-flow / close-order` 等 e2e 需 PG+Redis，建议在有依赖的环境跑一遍 `RUN_E2E=1`。
