# QM-WX 审查修复 — Commit 计划

> 配套审查报告：[code-review-2026-06-14.md](./code-review-2026-06-14.md)
> 约定：conventional commits（feat/fix/docs/refactor/test/chore）。
> 共 10 个 commit，覆盖 P0/P1/P2/P3 全部 13 项 + 证书定时任务。

## 顺序与依赖

1. commit 3（证书定时刷新）依赖 commit 2（`fetchPlatformCerts`）。
2. commit 4 引入 Prisma 迁移；**部署前**需 `prisma migrate deploy` + `prisma generate`。
3. `wallet.service.ts`、`user.service.ts` 各被拆到多个主题 commit。若想严格"一文件一 commit"，
   可合并相关 commit（4+5、7+8），或用 `git add -p` 分块暂存。

## 部署收尾（合并后一次性）

```bash
pnpm --filter @qm-wx/server prisma migrate deploy
pnpm --filter @qm-wx/server prisma generate
# 有依赖的环境再跑：RUN_E2E=1 pnpm --filter @qm-wx/server test
```

---

## 1. fix(server): 微信支付回调验签改用原始字节 (P0-1)

Fastify 默认 JSON.parse 后再 stringify 的字节与微信签名原文不一致，生产环境回调验签必失败。
改为注册 `parseAs:'string'` 的 content-type parser，原文挂到 `req.rawBody` 供验签；
顺手删除路由里抑制 unused import 的 hack (P3-1)。

- `apps/server/src/app.ts`
- `apps/server/src/modules/wxpay/wxpay.routes.ts`

## 2. fix(server): wxpay.service 加固 — 防重放/账单解压/证书轮换 (P1-4,P2-1,P3-2,P3-3)

- 回调验签前校验时间戳 ±300s 窗口，拒绝重放 (P1-4)
- 平台证书按 `Wechatpay-Serial` 选证书，多证书并存支持轮换；`registerPlatformCert` 用
  `X509Certificate` 解析序列号；未知序列号显式报错；新增 `fetchPlatformCerts()` 拉取
  `/v3/certificates` + APIv3 解密 (P2-1)
- `downloadBill` 按 gzip 魔数自动解压账单 (P3-3)
- `createVerify` 改用顶部 import，去掉内联 require (P3-2)

- `apps/server/src/modules/wxpay/wxpay.service.ts`
- `apps/server/tests/modules/wxpay/wxpay.cert.test.ts`
- `apps/server/tests/modules/wxpay/wxpay.service.test.ts`

## 3. feat(server): 平台证书 12h 定时刷新 (P2-1)

接入 BullMQ：`refresh-certs` 队列 + worker；`startJobs` 注册 12h repeatable job
（仅当微信支付配置齐全且非 test 环境）+ 启动预热；`enqueueRefreshCerts()` 支持手动触发。

- `apps/server/src/jobs/refresh-certs.job.ts`
- `apps/server/src/jobs/queue.ts`
- `apps/server/tests/jobs/queue.test.ts`

## 4. fix(server): 退款账实一致性 + 退款单落库 (P0-2,P1-3,P2-3)

- `consumeInTx` 改原子 increment + 条件 updateMany，消除并发 lost update (P1-3)
- 退款走 `allowNegative`：微信退款不可逆，本地如实记账、余额可为负(欠款)，不因余额不足
  回滚导致账实漂移 (P0-2)
- `WalletTransaction` 加 `outRefundNo @unique`，微信请求与流水共用同一单号，便于幂等 + 对账
  (P2-3，含迁移)

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/20260614090000_wallet_tx_out_refund_no/migration.sql`
- `apps/server/src/modules/wallet/wallet.service.ts`
- `apps/server/src/modules/mall/refund.service.ts`
- `apps/server/tests/modules/wallet/wallet.service.test.ts`
- `apps/server/tests/modules/mall/refund.service.test.ts`

## 5. fix(server): 积分并发双花防护 + 超时关单退积分 + stats 派生 (P1-1,P1-2,P2-5)

- `addPoints` 扣减走条件 updateMany(`points>=n`)，命中 0 行报"积分不足"，消除 TOCTOU 双花；
  不再 read-modify-write stats JSON (P1-2,P2-5)
- `toUserOutput` 的 `totalPoints` 由权威 `points` 派生 (P2-5)
- close-order 超时关单走 `assertTransition` + 退还已扣积分 (P1-1)

- `apps/server/src/modules/user/user.repository.ts`
- `apps/server/src/modules/user/user.service.ts`（`toUserOutput` 派生部分）
- `apps/server/src/jobs/close-order.job.ts`
- `apps/server/tests/jobs/close-order.job.test.ts`
- `apps/server/tests/modules/mall/order.service.test.ts`

## 6. fix(server): 状态机收紧 + admin 缓存 TTL (P1-5,P2-6)

- admin `updateOrderStatus` 接入 `assertTransition`，禁止裸跳状态 (P1-5)
- admin 白名单缓存加 60s TTL，多实例部署变更最迟 60s 生效 (P2-6)

- `apps/server/src/modules/admin/admin.routes.ts`

## 7. feat(server): refresh token 一次性轮换 + 复用检测 (P2-2)

login/refresh 签发的 refresh 带 `jti`；refresh 用 Redis 黑名单
（`auth:refresh:used:{jti}`，TTL=剩余有效期）一次性消费，重复使用报 401。

- `apps/server/src/modules/auth/auth.routes.ts`
- `apps/server/src/modules/user/user.service.ts`（login 签 jti 部分）
- `apps/server/src/common/middleware/auth.ts`（jti payload 类型）
- `apps/server/tests/modules/auth/auth.routes.test.ts`

## 8. chore(server): 生产环境配置加固 + bindApps 显式 501 (P3-4,P3-6)

- `env.ts` 生产环境校验 JWT_SECRET 弱值/占位词，fail-fast (P3-4)
- `user.service.bindApps` 改 `notImplemented(501)`，不再静默成功 (P3-6)

- `apps/server/src/config/env.ts`
- `apps/server/src/modules/user/user.service.ts`（bindApps 部分）

## 9. fix(miniprogram): 401 刷新竞态 + baseUrl fail-fast (P2-4,P3-5)

- 并发 401 共享同一 refresh promise + `retried` 标记限一次重试，防无限循环 (P2-4)
- `getBaseUrl` 体验/正式版未配置 `$apiBase` 直接抛错（强制 HTTPS 后端）(P3-5)

- `apps/miniprogram/miniprogram/services/api.ts`

## 10. docs(reviews): 全栈代码审查报告 + 修复台账 + commit 计划

- `reviews/QM-WX/code-review-2026-06-14.md`
- `reviews/QM-WX/COMMIT_PLAN.md`
