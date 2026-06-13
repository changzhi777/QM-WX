# Phase 4.2 — 切真生产准备清单

> Phase 4.1（V1.0 微信支付完整闭环 MVP）跑通后，**沙箱 → 真生产** 的切换 playbook。
> 任何一项未通过 → 不要启用 `feature_flags.payment=true` 给真实用户。

---

## 一、外部依赖（用户拍板 / 等待）

### 必须先到齐的 4 件事

| # | 依赖 | 来源 | 预计周期 | 阻塞项 |
| --- | --- | --- | --- | --- |
| 1 | 微信商户号（JSAPI） | 微信支付商户平台 | 申请中 | 无 |
| 2 | APIv3 密钥（32 字节） | 商户平台 → API 安全 | 即时 | 需 1 |
| 3 | 商户 API 证书（apiclient_key.pem） + 商户证书序列号 | 商户平台 → API 安全 | 即时 | 需 1 |
| 4 | 微信支付平台证书（wechatpay_cert.pem） | 商户平台 → API 安全 → 申请 | 即时 | 需 1 |

### 域名 / 备案（部署前置）

| # | 依赖 | 状态 | 阻塞项 |
| --- | --- | --- | --- |
| 5 | 备案域名（api.example.com） | 待批 | 阿里云/腾讯云备案 |
| 6 | HTTPS 证书（Let's Encrypt / 阿里云 SSL） | 待批 | 需 5 |
| 7 | 微信小程序服务器域名白名单（api.example.com） | 待加 | 需 5 |

### 真生产 AppID / 商户号

| # | 依赖 | 状态 | 备注 |
| --- | --- | --- | --- |
| 8 | 真实小程序 AppID（替换 wx426885831a05f18e） | 待定 | 需在微信公众平台申请 |
| 9 | 商户号与 AppID 关联授权 | 待定 | 商户平台 → 产品中心 → AppID 授权管理 |

### 退款异步通知（可选 — 同步 refund 已可工作）

| # | 依赖 | 状态 | 备注 |
| --- | --- | --- | --- |
| 10 | `WX_REFUND_NOTIFY_URL` 域名 | 待定 | MVP refund 同步成功才落账；异步通知用于对账冗余 |

---

## 二、env 模板（生产环境）

```bash
# apps/server/.env（生产）
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGINS=https://admin.example.com,https://mp.example.com

# ===== DB / Redis =====
DATABASE_URL=postgresql://USER:PASS@HOST:5432/qmwx_prod
REDIS_URL=redis://:PASS@HOST:6379/0

# ===== JWT =====
JWT_SECRET=<32-char-random>
JWT_ACCESS_TTL=2h
JWT_REFRESH_TTL=30d

# ===== 微信支付 V3 =====
WX_APPID=<真实 AppID>
WX_SECRET=<AppSecret>
WX_MCH_ID=<商户号>
WX_PAY_KEY=<APIv3 密钥 32 字节>
WX_NOTIFY_URL=https://api.example.com/api/wxpay
WX_MCH_SERIAL_NO=<商户证书序列号>
WX_MCH_PRIVATE_KEY_PATH=/etc/qmwx/apiclient_key.pem
WX_PLAT_CERT_PATH=/etc/qmwx/wechatpay_cert.pem
WX_REFUND_NOTIFY_URL=  # 留空（同步 refund）
```

### 证书部署位置

- `apiclient_key.pem`：`/etc/qmwx/apiclient_key.pem`（**绝对不能** 提交到 git）
- `wechatpay_cert.pem`：`/etc/qmwx/wechatpay_cert.pem`
- 文件权限：`chmod 600` + `chown qmwx:qmwx`

---

## 三、代码层切换

### 3.1 启用支付功能开关

DB 里 `AppConfig.feature_flags.payment`：

```sql
-- 沙箱：保持 false（默认）
-- 真生产：true
UPDATE "AppConfig"
SET value = jsonb_set(value, '{payment}', 'true'::jsonb)
WHERE id = 'feature_flags';
```

### 3.2 移除沙箱 mock

在 `apps/server/tests/modules/wxpay/wxpay.notify.test.ts` 和
`apps/server/tests/e2e/wxpay-notify.e2e.test.ts`：

```diff
- vi.mock('../../src/modules/wxpay/wxpay.service.js', async (importOriginal) => {
-   const actual = await importOriginal<typeof wxpayService>();
-   return {
-     ...actual,
-     verifyAndDecryptNotify: () => ({ resource: { ...mockResource }, verified: true }),
-   };
- });
+ // 真生产：移除整段 vi.mock，service 真验签 + 真解密
```

### 3.3 启动 close-order BullMQ worker

`apps/server/src/jobs/queue.ts` 已注册。如 BullMQ 未启动：

```bash
docker compose up -d redis  # 确保 Redis AOF 开启
pnpm dev
# 应看到 "worker started" 两条（weekly-report + close-order）
```

验证：

```bash
# 入队后 30 分钟应自动 close
psql -c "SELECT id, status FROM \"Order\" WHERE status = 'pending_pay' AND \"createdAt\" < NOW() - INTERVAL '31 minutes';"
```

### 3.4 启动每日对账

`/etc/cron.d/qmwx-reconcile`（cron 每日 23:30 跑昨日）：

```cron
30 23 * * * qmwx cd /opt/qmwx/apps/server && pnpm reconcile -- "$(date -d 'yesterday' +\%Y-\%m-\%d)" >> /var/log/qmwx/reconcile.log 2>&1 || echo "[reconcile] diff detected" | mail -s "qmwx 对账差异" ops@example.com
```

告警阈值：差异 > 0 → 退出码 2，cron 邮件告警。

---

## 四、监控要点

| 指标 | 阈值 | 告警渠道 |
| --- | --- | --- |
| `wxpay.notify` 验签失败率 | > 1% / 5min | Sentry / 钉钉 |
| `wxpay.notify` 落库失败率 | > 0.5% / 5min | Sentry |
| BullMQ `close-order` 队列长度 | > 100 | 钉钉 |
| 对账差异（`reconcile` 退出 2） | 任何 | 邮件 |
| `wallet.balance` 异常负值 | 任何 | Sentry fatal |

---

## 五、回滚 Playbook

### 5.1 紧急回滚（5 分钟内）

```bash
# 1. 关 feature flag
psql -c "UPDATE \"AppConfig\" SET value = jsonb_set(value, '{payment}', 'false'::jsonb) WHERE id = 'feature_flags';"

# 2. 重启 server（清缓存）
ssh qmwx-prod "docker compose restart server"

# 3. 验证
curl https://api.example.com/api/admin -d '{"action":"listAdmins"}'
# 应 200，且 app_config.feature_flags.payment = false
```

小程序端 `<feature-gate>` 组件会立刻把"立即开通"按钮改成"敬请期待"。

### 5.2 退款回滚

若 refund API 持续失败：

```bash
# 临时关 admin 退款入口
psql -c "UPDATE \"AppConfig\" SET value = jsonb_set(value, '{admin_refund}', 'false'::jsonb) WHERE id = 'feature_flags';"
```

客服改走手工流程（微信商户平台 → 订单管理 → 退款）。

### 5.3 数据回滚

**警告**：生产数据**不可随意**回滚。如有需要：

```sql
-- 仅限"误退款"恢复（极少见）
BEGIN;
UPDATE "Order" SET status = 'paid', "refundedAt" = NULL WHERE id = 'order-xxx';
UPDATE "WalletTransaction" SET status = 'reversed' WHERE "orderId" = 'order-xxx';
UPDATE "Wallet" SET balance = balance + (SELECT ABS(amount) FROM "WalletTransaction" WHERE "orderId" = 'order-xxx') WHERE "userId" = '...';
COMMIT;
```

---

## 六、验收前 Checklist

- [ ] 4 件事（商户号 / 密钥 / 证书 ×2）全部到位
- [ ] 域名备案 + HTTPS 证书就绪
- [ ] 真生产 AppID 替换并商户平台授权
- [ ] 沙箱 e2e 全套跑通（`RUN_E2E=1 pnpm test`）
- [ ] 对账脚本在 staging 跑通：1 个真实订单 vs 微信沙箱账单 → match
- [ ] BullMQ close-order worker 启动日志确认
- [ ] `<feature-gate>` 在小程序端能正确切"敬请期待" / "立即开通"
- [ ] 监控告警接入测试（手动触发 1 次验证通知到钉钉 / 邮件）
- [ ] 5 分钟内回滚 playbook 演练 1 次

---

## 七、参考文档

- 微信支付 V3 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012071273
- 微信支付商户平台证书下载：https://pay.weixin.qq.com/index.php/core/cert/api_cert
- 微信支付退款 API：https://pay.weixin.qq.com/doc/v3/merchant/4012791865
- 微信支付账单 API：https://pay.weixin.qq.com/doc/v3/merchant/4012791831
- 内部：`docs/ARCHITECTURE-V2.md` §3（wxpay module）
- 内部：`docs/STAGING_DEPLOY.md`（部署流程）
- 内部：`apps/server/src/domain/order-state.ts`（状态机白名单）

---

🤙 *Phase 4.1 是水到渠成的工程；Phase 4.2 是水到渠成的合规。*
