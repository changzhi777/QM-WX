#!/usr/bin/env bash
#
# QM-WX 审查修复 — 分组提交脚本
# 用法：在仓库根目录执行  bash reviews/QM-WX/commit.sh
# 说明：只做本地 commit，不 push（CT400 内网未通时按需稍后推）。
#
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 0) 清理 vitest 临时产物（已加入 .gitignore，保险起见再删一次）
rm -f apps/server/vitest.config.ts.timestamp-*.mjs || true

# 1) 回调验签原始字节 (P0-1, P3-1)
git add apps/server/src/app.ts apps/server/src/modules/wxpay/wxpay.routes.ts
git commit -m "fix(server): 微信支付回调验签改用原始字节 (P0-1)

Fastify 默认 JSON.parse 后再 stringify 与微信签名原文不一致，生产回调验签必失败。
改用 parseAs:'string' 的 content-type parser，原文挂 req.rawBody 供验签；
删除路由抑制 unused import 的 hack (P3-1)。"

# 2) wxpay.service 加固：防重放 / 证书轮换 / 账单解压 (P1-4,P2-1,P3-2,P3-3)
git add apps/server/src/modules/wxpay/wxpay.service.ts \
        apps/server/tests/modules/wxpay/wxpay.cert.test.ts \
        apps/server/tests/modules/wxpay/wxpay.service.test.ts
git commit -m "fix(server): wxpay.service 加固 — 防重放/证书轮换/账单解压 (P1-4,P2-1,P3-3)

- 回调验签前校验时间戳 ±300s 窗口，拒绝重放 (P1-4)
- 平台证书按 Wechatpay-Serial 选证书、多证书并存支持轮换；新增 fetchPlatformCerts() (P2-1)
- downloadBill 按 gzip 魔数自动解压账单 (P3-3)
- createVerify 改顶部 import (P3-2)"

# 3) 平台证书 12h 定时刷新 (P2-1)
git add apps/server/src/jobs/refresh-certs.job.ts \
        apps/server/src/jobs/queue.ts \
        apps/server/tests/jobs/queue.test.ts
git commit -m "feat(server): 平台证书 12h 定时刷新 (P2-1)

BullMQ refresh-certs 队列 + worker；startJobs 注册 12h repeatable job
（仅微信支付配置齐全且非 test 环境）+ 启动预热；enqueueRefreshCerts() 手动触发。"

# 4) 退款账实一致 + 退款单落库 + 余额原子 (P0-2,P1-3,P2-3)  —— 含 Prisma 迁移
git add apps/server/prisma/schema.prisma \
        apps/server/prisma/migrations/20260614090000_wallet_tx_out_refund_no \
        apps/server/src/modules/wallet/wallet.service.ts \
        apps/server/src/modules/mall/refund.service.ts \
        apps/server/tests/modules/wallet/wallet.service.test.ts \
        apps/server/tests/modules/mall/refund.service.test.ts
git commit -m "fix(server): 退款账实一致性 + 退款单落库 + 余额原子化 (P0-2,P1-3,P2-3)

- consumeInTx 改原子 increment + 条件 updateMany，消除 lost update (P1-3)
- 退款走 allowNegative：微信退款不可逆，本地如实记账、余额可为负(欠款)，不回滚 (P0-2)
- WalletTransaction 加 outRefundNo @unique，微信请求与流水共用单号，便于幂等+对账 (P2-3)

注意：部署前需 prisma migrate deploy + prisma generate。"

# 5) 积分双花防护 + 超时关单退积分 (P1-1,P1-2,P2-5 部分)
git add apps/server/src/modules/user/user.repository.ts \
        apps/server/src/jobs/close-order.job.ts \
        apps/server/tests/jobs/close-order.job.test.ts \
        apps/server/tests/modules/mall/order.service.test.ts
git commit -m "fix(server): 积分并发双花防护 + 超时关单退积分 (P1-1,P1-2,P2-5)

- addPoints 扣减走条件 updateMany(points>=n)，消除 TOCTOU 双花；不再写 stats JSON (P1-2,P2-5)
- close-order 超时关单走 assertTransition + 退还已扣积分 (P1-1)"

# 6) 状态机收紧 + admin 缓存 TTL (P1-5,P2-6)
git add apps/server/src/modules/admin/admin.routes.ts
git commit -m "fix(server): admin 改单走状态机 + 白名单缓存 TTL (P1-5,P2-6)

- updateOrderStatus 接入 assertTransition，禁止裸跳状态 (P1-5)
- 白名单缓存加 60s TTL，多实例变更最迟 60s 生效 (P2-6)"

# 7) refresh 轮换 + stats 派生 + bindApps 501 + 生产配置 (P2-2,P2-5,P3-4,P3-6)
git add apps/server/src/modules/auth/auth.routes.ts \
        apps/server/src/common/middleware/auth.ts \
        apps/server/src/modules/user/user.service.ts \
        apps/server/src/config/env.ts \
        apps/server/tests/modules/auth/auth.routes.test.ts
git commit -m "feat(server): refresh token 一次性轮换 + 用户/配置加固 (P2-2,P2-5,P3-4,P3-6)

- refresh 带 jti + Redis 黑名单一次性消费，复用报 401 (P2-2)
- toUserOutput 的 totalPoints 由权威 points 派生 (P2-5)
- 生产环境校验 JWT_SECRET 弱值 fail-fast (P3-4)
- bindApps 改 notImplemented(501)，不再静默成功 (P3-6)"

# 8) 小程序 401 竞态 + baseUrl (P2-4,P3-5)
git add apps/miniprogram/miniprogram/services/api.ts
git commit -m "fix(miniprogram): 401 刷新竞态 + baseUrl fail-fast (P2-4,P3-5)

- 并发 401 共享同一 refresh promise + retried 限一次重试，防无限循环 (P2-4)
- getBaseUrl 体验/正式版未配置 \$apiBase 直接抛错（强制 HTTPS 后端）(P3-5)"

# 9) 审查文档 + commit 计划 + gitignore
git add .gitignore reviews/QM-WX
git commit -m "docs(reviews): 全栈代码审查报告 + 修复台账 + commit 计划"

echo
echo "✅ 已生成 9 个本地 commit。检查：git log --oneline -9"
echo "⚠️  部署前别忘：pnpm --filter @qm-wx/server prisma migrate deploy && prisma generate"
