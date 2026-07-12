# wxpay module — 微信支付 V3 + 完整闭环

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **wxpay/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[mall](../../mall/) / [wallet](../../wallet/) / [content](../../content/) / [jobs/refresh-certs.job.ts](../../../jobs/refresh-certs.job.ts)

> 引入版本：**V0.1.13**（Phase 4 MVP 下单支付），**V0.1.14~16** 完整闭环
> 关联：**V0.1.117/V0.1.119** 赛事 wxpay 真集成（Order +contentType/contentId + Enrollment +orderId 回调）

---

## 🎯 模块职责

**微信支付 V3 API 集成**：服务端权威下单 / 回调 / 退款 / 对账，覆盖商品订单（mall）+ **赛事订单（content enroll，V0.1.119）**。
**完整回调链路**：notify → 订单 paid → **dispatch 分销 settleCommission（分销单）** / **直接 enrollment confirmed（赛事单，V0.1.119）** + 钱包入账（如有）。
**自动关单保护**：30 分钟超时未支付 → 取消 Order + 释放库存（close-order BullMQ job）。

- **不在前端**：前端只调 `api.call('mall', 'createOrder')` → 后端决定调不调 wxpay.createPayOrder → 返 prepay_id 给前端拉起支付
- **服务端权威**：openid / payAmount / prepayId 全部后端产生，前端不可篡改
- **真生产前置**：4 件外部依赖（商户号 + APIv3 密钥 + 商户 API 证书 + 微信平台证书）— `docs/PHASE-4-2-PREP.md` 详述

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `wxpay.service.ts` | 11 函数（unifiedOrder / refund / queryBill / downloadBill / 证书工具 + AES-GCM 解密） | ~520 |
| `wxpay.routes.ts` | POST `/api/wxpay/notify`（V3 验签 + 解密 + dispatch）+ GET `/api/wxpay/cert/list`（运营） | ~120 |
| `wxpay.schema.ts` | Zod（UnifiedOrderInput / RefundInput / Notify 解密结构） | ~80 |

注册：`src/app.ts` 内 `app.register(wxpayRoutes, { prefix: '/api/wxpay' })`

---

## 📡 对外接口（2 endpoint）

### Notify：POST `/api/wxpay/notify`（**public，微信回调**）

| 内容 | 说明 |
| --- | --- |
| 入参 | 微信回调 rawBody（XML 或 AES-GCM 加密 JSON） |
| 流程 | 验签（V3 RSA）→ AES-GCM 解密（resource.ciphertext + nonce + associated_data）→ 解析 out_trade_no → 查 Order → 调 dispatch action |
| dispatch 路由 | **paid** → 落 paid + dispatch: `mall 商品单`: `wallet.credit` + `distribution.settleCommission`（分销单）；`contentType=enroll 赛事单`（V0.1.119）: **直接 enrollment confirmed（不走钱包，fee 是商家收入，赛事方不退款）**；`refunded`: wallet.decrement + distribution.clawbackCommission |
| 幂等 | `if (order.status !== 'pending_pay') return`，重复回调安全 |
| 返回 | `{ code: 'SUCCESS', message: '成功' }`（微信要求） |

### Cert List：GET `/api/wxpay/cert/list`（admin 守护）

| 内容 | 说明 |
| --- | --- |
| 入参 | — |
| 流程 | 查 Redis 缓存的微信平台证书（refresh-certs.job.ts 每 12h 刷一次） |
| 返回 | 平台证书列表（用于上游验签调试） |

---

## 🔧 关键函数（service 层）

### `unifiedOrder(input)` — 下单支付

**入参（UnifiedOrderInput）**：
```ts
{
  orderId: string;       // 内部 Order.id
  description: string;   // 商品/赛事名
  amount: number;        // 单位：分（cents）
  openid: string;        // 用户 openid（前端 wx.login 缓存给后端反查 or userId 调 userRepo）
}
```

**流程**：
1. 调 configRepo 查 AppConfig.payment（`off` / `mock` / `on`）：
   - **`off`（生产未配置）**：抛 `notFound "wxpay not enabled"` → 前端改走余额支付
   - **`mock`（灰度测试）**：直接落 Order.paid + 返 mock prepayId（前端跳过 wx.requestPayment）
   - **`on`（真生产）**：继续往下
2. 构造 V3 请求（`POST /v3/pay/transactions/jsapi`）：
   - appid + mchid + description + out_trade_no + notify_url + amount.total + payer.openid
   - **签名**：商户私钥 RSA 签名（generateAuthorization helper）
3. 调微信 API
4. 保存 `Order.prepayId` + `Order.payChannel='wxpay'` + 30 分钟关单任务入队（enqueueCloseOrder）
5. 返 `UnifiedOrderResp { prepayId, payParams }` 前端拉起 wx.requestPayment

**关键约束**：
- `amount` 必须**整数分**（V3 不接受小数）
- `out_trade_no` 限长 32 字符（用 `toOutTradeNo(orderId)` 压缩订单号）
- `notify_url` 必须在白名单（qx.ngrok/wss 域名）

### `verifyAndDecryptNotify(input)` — 回调验签 + 解密

**入参（VerifyNotifyInput）**：`{ headers: { Wechatpay-Signature, Wechatpay-Timestamp, Wechatpay-Nonce }, body: string }`

**流程**：
1. 读 Redis 缓存的微信平台证书（公钥）
2. 构造验签串 `timestamp\nnonce\nbody\n`，用平台证书公钥 RSA 验签 Wechatpay-Signature
3. 解密 `resource.ciphertext`（AES-256-GCM，nonce + associated_data 来自 resource）
4. 返 `VerifyNotifyResult { outTradeNo, transactionId, amount, success }`

### `refund(input)` — 退款

**入参（RefundInput）**：`{ orderId, refundAmount, reason }`

**流程**：
1. 调 `POST /v3/refund/domestic/refunds`，传 `out_trade_no` + `amount.refund` + `reason`
2. 返 `RefundResp { refundId, status, recvAccount }`
3. **不在此函数改 Order.status / Wallet / AuditLog** — 由 `admin.refundOrder` 事务内调本函数，事务保持

### `queryBill(input)` + `downloadBill(url)` — 对账

- `queryBill({ date: 'YYYY-MM-DD', type: 'ALL' | 'SUCCESS' | 'REFUND' })` 调 `/v3/bill/tradebill`
- `downloadBill(downloadUrl)` 用商户私钥换 hash + GET 下载 GZIP 流式
- 对账脚本：`pnpm reconcile -- YYYY-MM-DD`（`scripts/reconcile.ts`）调这两函数比对内部 Order/Wallet
- 5 类 diff 报告 + cron 退出码 2 报警

### 工具函数

| function | 用途 |
| --- | --- |
| `registerPlatformCert(pem)` | 解析微信平台证书 PEM → 返 cert serial |
| `fetchPlatformCerts()` | 主动拉平台证书 V3 API（refresh-certs.job.ts 每 12h 调） |
| `generateAuthorization(method, url, body, mchId, serialNo, privateKey)` | 构造 V3 Authorization 头 |
| `aesGcmDecrypt({ciphertext, nonce, associatedData, key})` | AES-256-GCM PKCS#7 解密 resource |
| `isPaySuccess(resource)` | 校验 resource.result_code === 'SUCCESS' |
| `toOutTradeNo(orderId)` | 订单号转 V3 out_trade_no（截断 + 校验） |

---

## 📊 数据模型（订单字段扩展）

```prisma
model Order {
  // ... 基础字段
  payChannel       String?   // 'wxpay' | 'balance' | 'mock'
  prepayId         String?
  wxTransactionId  String?
  paidAt           DateTime?
  // V0.1.24 分销
  sourceUserId     String?
  // V0.1.38 团购
  groupBuyId       String?
  // V0.1.117 赛事
  contentType      String?   // null | 'enroll'
  contentId        String?
}
```

---

## 🧪 测试

`tests/modules/wxpay/`：
- `wxpay.service.test.ts` — **9 单元测试**（unifiedOrder 3 含 mock 分支 / refund 1 / verifyAndDecryptNotify 2 / queryBill 1 / registerPlatformCert 1 / generateAuthorization 1）
- `wxpay.notify.test.ts` — **10 单元测试**（V0.1.112 +6 分支：unknown/header missing/not found/cancelled/非 pending/settle；V0.1.117 +2 enroll 派发 + V0.1.119 +2 赛事真集成）
- `wxpay.cert.test.ts` — **1 单元测试**（refresh-certs）
- `e2e/wxpay-notify.e2e.test.ts` — **2 e2e**（RUN_E2E=1 才跑）
- e2e `refund-flow.e2e.test.ts` 3 + `close-order.e2e.test.ts` 5

---

## 🔗 关键集成点

### `mall.createOrder` 集成（创建期）
- V0.1.22 起：订单类型 = `mall` 商品
- 事务内落 `Order.payChannel='wxpay'` + `Order.prepayId=null` + `enqueueCloseOrder(orderId, 30min)`

### `content.enroll` 集成（创建期）
- V0.1.117/V0.1.119：订单类型 = `content` 赛事（`Order.contentType='enroll'` + `Order.contentId=enrollmentContentId`）
- 创建后落 `Enrollment` 时即写 `Enrollment.orderId` 回调查

### `wxpay.notify` 回调分发（关键路径）
- dispatch 表：
  | Order 类型 | contentType | action |
  | --- | --- | --- |
  | mall 商品 | null | `walletRepo.credit` + `distribution.settleCommission`（如 sourceUserId）+ `Order.status=paid` |
  | content 赛事 | 'enroll' | **直接 `Enrollment.status=confirmed`** + `Order.status=paid`（**不走钱包**，fee 是商家收入） |
  | 退款回调 | — | 事务内 `walletRepo.decrement` + `distribution.clawbackCommission` + `Order.status=refunded` |

### `close-order.job.ts` 集成（超时）
- BullMQ delayed 30 分钟
- 若 Order 仍 pending_pay → status=cancelled + 释放库存
- 重复回调（jobId 幂等）已支付 → skip 不 update

### `refresh-certs.job.ts` 集成（证书）
- BullMQ repeatable 每 12h
- 调 `wxpay.fetchPlatformCerts()` → Redis `wxpay:platform:certs` 缓存
- notify 验签时读缓存避免每次查 API

---

## 🔧 关键依赖与配置

- **环境变量**（6 字段）：
  ```
  WX_MCH_ID          商户号
  WX_MCH_API_V3_KEY  APIv3 密钥（32 字节）
  WX_MCH_PRIVATE_KEY 商户 API 证书私钥（PEM）
  WX_MCH_CERT_SERIAL 商户证书序列号
  WX_APPID           公众号/小程序 AppID
  WX_SECRET          code2Session 用
  WX_NOTIFY_URL      回调 URL（生产需 HTTPS + 白名单）
  WX_REFUND_NOTIFY_URL 退款回调（可选，部分场景用）
  ```
- **依赖包**：`crypto`（node 内置）/ `axios`（HTTP 调微信 API）/ `ioredis`（缓存）
- **AppConfig.payment**：3 态（off / mock / on）— 当前生产默认 **off**（待商户号到位切 on）

---

## 📌 常见问题 (FAQ)

**Q：生产是 off 还是 on？**
A：当前 **off**。商户号 / APIv3 / 证书到位后改 on，灰度先开 mock + 单用户真测，再放量。

**Q：notify 重复回调怎么处理？**
A：第 1 步幂等 `if (order.status !== 'pending_pay') return` 直接返 SUCCESS，状态机保证不重复入账。

**Q：赛事单和商品单 notify 怎么区分？**
A：`Order.contentType` 字段：`null` = 商品 + `enroll` = 赛事。V0.1.117 加字段，V0.1.119 派发逻辑按字段路由。

**Q：赛事单退款怎么走？**
A：赛事单不走钱包退款（fee 是商家收入）。admin 走 `Order.status=refunded` + `Enrollment.status=cancelled` + AuditLog，**不调 wxpay.refund**（避免双重退款；如赛事方要求真退，则需 wxpay.refund 并入账商家钱包，由 admin 手动打款给用户 — 留 V0.1.150+ 补）。

**Q：close-order 误杀怎么办？**
A：30min delayed 内用户实际已支付 → Order.status='paid' → close-order job 看 status 非 pending 跳过，不影响。如用户超时后补支付：close-order 先 cancel 了 → 用户支付回调 → `if (order.status !== 'pending_pay')` 直接幂等返回，不入账 — **坑：用户体验差，需 V0.1.132+ 改成 refund-style（cancel 后保留 callback 不入账）还是接受 trade-off，待 PM 拍板**。

**Q：对账脚本多久跑？**
A：cron daily 03:00 跑前一天对账：`pnpm reconcile -- 2026-07-12`（V0.1.14）。退出码 0=一致 / 1=错误 / 2=diff 超阈值报警。

---

## 📁 相关文件清单

```
src/modules/wxpay/
├── wxpay.service.ts          # 11 函数（unifiedOrder/refund/queryBill/证书/签名/AES-GCM）
├── wxpay.routes.ts           # notify + cert/list
├── wxpay.schema.ts           # Zod schemas
└── CLAUDE.md                 # 本文件

src/jobs/refresh-certs.job.ts  # 微信平台证书每 12h 刷新

# 集成点
src/modules/mall/order.service.ts   # createOrder 落 prepayId/enqueueCloseOrder
src/modules/content/                # enroll + Order +contentType/contentId
src/modules/distribution/distribution.service.ts  # settleCommission / clawbackCommission
src/modules/wallet/wallet.repo.ts   # ensureWalletInTx + credit/decrement
scripts/reconcile.ts                # 对账脚本
```

---

## 📝 变更记录 (Changelog)

- **2026-06-14** — Phase 4.1 完整闭环（status CYCLE 7 态 + 退款 + 超时关单 + 对账 + 5 e2e）
- **2026-07-08** — V0.1.13 Phase 4 MVP 下单支付灰度（10 个测试）
- **2026-07-10** — V0.1.112 GAP-3.5 +6 分支补 routes 单测（未 known/header missing/not found/cancelled/非 pending/settle，funcs 36%→100%）
- **2026-07-11** — V0.1.117 enroll 走余额支付 + Order +contentType/contentId 字段
- **2026-07-11** — V0.1.119 wxpay 赛事真集成（enroll 走 unifiedOrder + 回调分发直 enrollment confirmed）
- **2026-07-12** — V0.1.131 创建 module 级 CLAUDE.md（**GAP-8 关闭** wxpay 侧）
