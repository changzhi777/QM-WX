# Changelog

> QM-WX 青沐生命科技微信小程序 + Node 后端
> 参考任务：**CT400**（V1.0 初始化 + V2 骨架 + 部署准备）
> 时间：2026-06-11

---

## 📋 版本规则（约定 2026-06-14）

**Semantic Versioning**：`MAJOR.MINOR.PATCH`

- **MAJOR**（1.0 → 2.0）：架构变更 / 不兼容 API / 数据模型 breaking
- **MINOR**（0.1 → 0.2）：新功能 / 兼容 / 用户可见增强
- **PATCH**（0.1.0 → 0.1.1）：bug 修 / 文档 / 重构 / 测试补漏 — **本仓约定：每次 commit 段结束自动 +1**

**Tag 规则**：
- 主仓 `qingmu/qm-wx`：`git tag v{MAJOR}.{MINOR}.{PATCH}`，tag 打在每个 commit 段最后
- 独立仓 `qingmu/qm-admin`：同步独立管理

**当前版本**：`V0.1.0`（首版）

---

## CT400 · V1.0 初始化（已落）

- ✅ monorepo 骨架：pnpm workspaces + 共享 TS / ESLint / Prettier
- ✅ 后端 9 个 module 30+ action：
  - user（登录 / 资料 / me）
  - sport（打卡 + 群 + 榜单 + 周报 + 防作弊）
  - mall（商品 / 订单 + 积分双态）
  - content（赛事 / 酒店 / 景区 / 餐饮 / 乡村振兴 五合一）
  - wallet（feature-gated 守门）
  - admin（白名单 + upsert）
  - auth（refresh token 轮换）
  - upload（multipart + 本地存储）
  - weekly-report（聚合 + canvas 战报图）
- ✅ 小程序 13 页面 + 3 组件（feature-gate / profile-popup / privacy-popup）
- ✅ Prisma + PostgreSQL（13 张表 + seed 初始化 AppConfig）
- ✅ JWT 鉴权 + 微信 code2Session
- ✅ 隐私协议首启弹窗
- ✅ docker-compose / GitHub Actions CI / smoke test
- ✅ 10 个单测
- ✅ 4 份权威文档：ARCHITECTURE-V2 / PHASE-0-PLAN / PHASE-V2-PLAN / SUBMIT-CHECKLIST

## CT400 · V2 骨架（已落 stub，等外部依赖）

- ✅ 3 个新 module stub：device（Phase 6）/ recipe（Phase 7）/ ludong（Phase 7+）
- ✅ 8 张新 Prisma 表
- ✅ V2 计划文档（~30 天工作量 + 优先级 + 风险）

## CT400 · 待办（4 个未答问题）

1. 微信 AppID `wx426885831a05f18e` 验证（生产/测试？）
2. 部署云厂商（阿里云 / 腾讯云 / 华为云）
3. CI 微调（GitHub Actions vs 别的）
4. V2 优先级（设备方向 / 饮食方向 / 律动节奏 / 哪个 P0 先干）

## CT400 · 外部依赖（等批/等对接）

- 微信商户号（JSAPI 支付）—— V1.1 钱包/支付用
- 微信订阅消息模板（"运动周报"）—— V1 周报推送用
- 食品类目资质 —— V1 商城审核用
- 域名 ICP 备案 + SSL —— 部署前置
- 华为 Health Kit 企业认证（1-3d）—— V2 设备
- 佳明 Connect Developer Program（1-2 周）—— V2 设备
- 小米开放平台（2-4d + 3-5d）—— V2 设备
- 律动后端契约对齐 —— V2 律动对接

---

## [Unreleased] — 2026-06-12 全栈整顿方案 B

由 `/zcf:workflow` 6 阶段工作流驱动。完整报告见
`.zcf/plan/history/2026-06-12_163805_audit-fix-batch-b.md` 和
`memory/audit-batch-b-complete.md`。

### ✨ Added

- **shared** (`a8abb5d`)：ENDPOINTS 补 4 缺口（`sport.myGroups` / `sport.today` /
  `user.me` / `auth.refresh`）+ 新增 `actionUrl(module, action)` 工具
- **shared**：`admin` module 补登 `listOrders` / `updateOrderStatus` / `listAdmins`
- **tests** (`453e8d1`)：测试基建
  - `tests/helpers/{mockErrors,mockPrisma}.ts`
  - `tests/fixtures/{user,product,order,group}.fixture.ts`
  - `tests/helpers/README.md`（Redis mock 分层约定）
- **tests** (`efd2150`)：`actionUrl` + ENDPOINTS 完整性（5 tests）
- **tests** (`c530105`)：`mall-flow.e2e.test.ts` Happy Path（3 tests：登录→下单→取消→积分回退）
- **tests** (`e2858a4`)：code2Session 边界（3 个）+ mall.routes 路由层（10 个）
- **miniprogram** (`58cf415`)：`<error-state>` 通用错误状态组件
- **miniprogram** (`7234e61` + `77dcd5e`)：error-state 应用到 **11/11 页面 100% 覆盖**

### 🔧 Changed

- **server** (`5c3739f`)：
  - `content` / `mall` 公开端点（`config: { public: true }` + 受保护 action 内部 jwtVerify）
  - `admin.isAdmin` 加内存缓存 + `invalidateAdminCache()`
  - `recipe.myMeals` 补 Zod `MyMealsInputSchema`
- **server** (`726befc`)：抽 `requireLogin(req)` 到 `common/middleware/auth.ts`（去重 content/mall）
- **miniprogram** (`a164cfc`)：`api.call` / `refreshToken` 改走 `actionUrl()`（修根因 URL bug）
- **miniprogram** (`236d9c6`)：mine 去冗余 flag + product-detail 按钮 disabled
- **ci** (`20042d1`)：拆 5 个 parallel job（unit-tests + e2e-tests 并行）
- **admin** (`fa1529a` / `57f381e`)：qm-admin 独立仓
  - Login 加固（me + listAdmins 双校验）+ 删 zustand + access 真校验
  - 订单状态扭转并发锁 + nginx 改 envsubst `${BACKEND_URL}` 模板

### 🐛 Fixed

- **miniprogram** (`236d9c6`)：profile 表单无错误态 UI
- **admin** (`fa1529a`)：qm-admin Login 6 个 P0 安全隐患
- **admin** (`57f381e`)：qm-admin 订单状态扭转并发 + originalPrice null 误写

### 📊 关键指标

| 维度 | 前 | 后 | 变化 |
| --- | --- | ---: | ---: |
| 后端测试数 | 201 | **227** | +26 |
| 后端覆盖率 | 86.28% | **88.08%** | +1.80% |
| mall.routes 覆盖 | 2.38% | **100%** | +97.62% |
| E2E 数 | 5 | **8** | +3 |
| CI 反馈 | 串行 | **parallel 5 job** | ~30% 提速 |
| ENDPOINTS 缺口 | 4 | **0** + actionUrl | 修根因 |
| qm-admin Login P0 | 6 | **0** | 双校验 |
| 小程序 error UI | 0 页 | **11/11 100%** | 全闭环 |

### 📦 Dependencies

- **admin**：移除 `zustand` (1287 → 1285 packages)
- **shared**：未引入新依赖，仅新增 export

---

## [Unreleased] — 2026-06-13 Phase 4 微信支付 V3 MVP

由 `/zcf:workflow` 6 阶段工作流驱动，方案 A（5 人天 MVP 灰度）。
完整报告见 `.zcf/plan/history/2026-06-13_053749_phase4-wxpay-mvp.md` 和
`memory/phase4-wxpay-mvp-complete.md`。

### ✨ Added

- **server** (`3fef18b`)：全新 wxpay module
  - `apps/server/src/modules/wxpay/wxpay.{schema,service,routes}.ts`
  - 协议：JSAPI 统一下单 + AES-256-GCM 回调解密 + 自研签名（Node `crypto`，不引老旧 SDK）
  - 公开端点 `POST /api/wxpay`（`config.public=true`，不走 JWT）
- **miniprogram** (`4d08550`)：order-confirm 三分支
  - 积分全额兑换（status=paid）
  - 微信支付（`wx.requestPayment`）
  - 兜底（payment=OFF 意向单）
- **Prisma**：Order 表加 4 字段
  - `payChannel` / `prepayId` / `wxTransactionId @unique`（幂等 key）/ `paidAt`
- **env**：`WX_MCH_ID` / `WX_PAY_KEY` / `WX_NOTIFY_URL` / `WX_MCH_SERIAL_NO`
         / `WX_MCH_PRIVATE_KEY_PATH` / `WX_PLAT_CERT_PATH`

### 🔧 Changed

- **orderService.create** (`3fef18b`)：当 `payAmount > 0` + `payment=ON` 时
  - **事务外** 调 `wxpay.unifiedOrder`（外部 IO 不在 DB 事务内）
  - 返回 `payParams` 给前端 `wx.requestPayment`

### 📚 Documentation

- (`3b9b672`) `.zcf/plan/current/phase4-wxpay-mvp.md` → `history/2026-06-13_053749_...`

### 📊 关键指标

| 维度 | 前 | 后 | 变化 |
| --- | --- | ---: | ---: |
| 后端测试数 | 227 | **234** | +7 |
| 后端覆盖率 | 88.08% | ~88% | 持平（MVP 加新代码） |
| 后端 module 数 | 13 | **14** | +1 (wxpay) |
| E2E 数 | 6 | **8** | +2 (wxpay-notify 通知+幂等) |

### 沙箱可验 ✅

APIv3 无独立沙箱但有验收用例仿真（用正式 mch_id + 验收金额触发不同响应）。
当前 E2E 通过 `vi.mock` 跳过真验签 + 真解密；**切真生产路径**：
1. 配真证书 / 密钥 / notify URL 到 env
2. 去掉 `vi.mock` 注释
3. 启用商户平台 `feature_flags.payment = true`

### 不在范围（明确延后 → Phase 4.1）

- 退款流程（路由 + 管理员后台入口）
- 超时关单 BullMQ Cron（30 分钟未支付）
- 每日对账（账单 API + 文件下载 + 差异报警）
- WalletTransaction 写入（需 ensureWallet 先建）
- 状态机校验
- 积分比例从 DB 读（仍硬编码 POINTS_TO_YUAN=0.01）
- 真实 AppID / 商户号切换（用户拍板）

---

## [Unreleased] — 2026-06-13/14 Phase 4.1 微信支付完整闭环 + 收尾

由 `/zcf:workflow` 6 阶段工作流驱动，方案 1（MVP 灰度，5-7 人天 / 7 commit）。
完整报告见 `docs/PHASE-4-2-PREP.md` 和 `memory/phase4-wxpay-mvp-complete.md`（相关）。

### ✨ Added

- **server** (`0ddd0fc`)：全新 `domain/order-state.ts` 状态机
  - `type OrderStatus` 7 态 + TRANSITIONS 白名单
  - `canTransition` / `assertTransition` / `isTerminal` 三个纯函数
  - 业务收紧：paid → cancelled 禁止（必须走 refund 流程）
- **server** (`2cc80ec`)：抽 `wallet.repo.ts` 集中 `ensureWallet` 逻辑
  - `ensureWallet(userId)` 事务外 + `ensureWalletInTx(tx, userId)` 事务内
  - wxpay notify / admin refund 复用入口
- **server** (`27e3ba4`)：wxpay refund API service
  - POST /v3/refund/domestic/refunds（自研签名 + 沙箱走 mock）
  - 新增 `RefundInputSchema` / `RefundRespSchema`
- **server** (`3ea9537`)：admin 退款入口
  - 新建 `mall/refund.service.ts` + `admin.refundOrder` action
  - 流程：事务外调 wxpay.refund → 事务内 order=refunded + wallet consumeInTx
  - 退款限定 paid 状态（已 shipping/done 不退 — V1 范围）
- **server** (`087ed4e`)：BullMQ 超时关单
  - 新建 `jobs/close-order.job.ts`（pending_pay → cancelled，幂等跳过）
  - 新 queue `closeOrderQueue`（30 分钟 delayed + jobId 幂等）
  - mall.order.service.create 时入队（仅 pending_pay）
  - wxpay.notify 加关单保护（cancelled 订单不复活）
- **server** (`e48a18c`)：对账脚本
  - `scripts/reconcile.ts`（CLI）— 拉微信账单 API + CSV 解析 + 与 Order 比对
  - 5 类 diff：match / mismatch_amount / missing_local / missing_bill / status_diff
  - 退出码 0/1/2 让 cron 报警
  - 新 `wxpay.service.queryBill` / `downloadBill`
- **server** (`f6df4cb`)：`docs/PHASE-4-2-PREP.md` 切真生产 playbook
  - 7 章节：外部依赖 / env 模板 / 代码切换 / 监控 / 回滚 / 验收 checklist / 参考
- **server** (`1aeb752`)：wxpay.notify 写钱包账本
  - 事务内 `wallet.update(balance +=)` + `walletTransaction.create(type=recharge)`
  - 通知业务模型：微信收款入账到钱包（先充值后消费）
- **server** (`c00230e`)：Phase 4.1 e2e 补漏
  - `refund-flow.e2e.test.ts`（3 tests：notify + 退款 + 重复退款拒绝）
  - `close-order.e2e.test.ts`（5 tests：状态机 5 态 + 队列契约）
  - `mall-flow.e2e.test.ts` 适配 V1 业务收紧

### 🔧 Changed

- **server** (`076ed09`)：shared vitest 1.6 → 3.2.6 升级
  - 修了 3 个隐藏坑：alias 锚定相对路径避免误伤 vitest 内部 chunk
  - 显式加 `@vitest/spy` 解决 pnpm 不自动 hoist
  - 删 tsc -b 漏写进 src/ 的 .js/.d.ts 脏产物
  - `endpoints.test.ts` 跨仓迁回 packages/shared/tests/
- **server** (`92f98f8`)：状态机统一替换（5 处硬编码）
  - `mall.order.service.ts` cancel()：assertTransition 替代老 `status === pending_pay|paid` 校验
  - `mall.refund.service.ts`：assertTransition('paid', 'refunded')
  - `wxpay.routes.ts` notify：assertTransition('pending_pay', 'paid')
  - domain/order-state.ts：paid 白名单加 'refunded'（MVP 简化直跳）
  - shipping → shipped 统一（与 Prisma schema 注释 + admin routes 对齐）
- **server** (`3794446`)：refund.service 注释清理（与代码实际行为对齐）

### 📚 Documentation

- (`f6df4cb`) `docs/PHASE-4-2-PREP.md` — 切真生产完整 playbook
- (`f6df4cb`) `apps/server/.env.example` — 新增 4 项 WX_MCH_SERIAL_NO / WX_MCH_PRIVATE_KEY_PATH / WX_PLAT_CERT_PATH / WX_REFUND_NOTIFY_URL

### 📊 关键指标

| 维度 | 前 | 后 | 变化 |
| --- | --- | ---: | ---: |
| 后端测试数 | 234 | **290** | +56 |
| 后端测试（RUN_E2E=1） | 234 | **308** | +74 e2e 全跑 |
| 后端 module 数 | 14 | **14** | 持平（+ domain/order-state.ts） |
| 业务 module 测试覆盖 | 70-80% | **88%+** | 持平 |
| Order 状态转换硬编码 | 5 处 | **0 处** | 全部走 assertTransition |
| 退款流程 | 0 | **完整 admin + 状态机 + 钱包账本** | 1 commit |
| 超时关单 | 无 | **30min BullMQ delayed + 幂等** | 1 commit |
| 每日对账 | 无 | **CLI + 5 类 diff** | 1 commit |
| 切真生产路径 | 无 | **9 项 checklist + 7 章 playbook** | 1 commit |

### 🎯 Phase 4.1 范围 vs 实际

**完成**：
- ✅ 退款流程（admin 入口 + wxpay V3 API + WalletTransaction 扣减 + 状态机）
- ✅ 超时关单（BullMQ delayed 30min + 队列契约）
- ✅ 每日对账（脚本 + 5 类 diff + 退出码）
- ✅ WalletTransaction 完整接入（notify 路径 + admin 退款路径）
- ✅ 状态机校验（domain/order-state + 全替换）
- ✅ 真实切换路径（PHASE-4-2-PREP 文档就绪）

**明确延后（外部依赖阻塞）→ Phase 4.2**：
- ⏳ 真实 AppID / 商户号切换（等 4 件外部依赖：商户号 / APIv3 密钥 / 商户 API 证书 + 序列号 / 微信平台证书）
- ⏳ 真实部署（域名备案 + HTTPS + 商户号与 AppID 授权）

### 🐛 副作用修正

- **miniprogram**：order-confirm 三分支（积分兑 / 微信支付 / 兜底意向单）已在 Phase 4 MVP 段（`4d08550`），本段无变更
- **admin (qm-admin 独立仓)**：
  - `8e43143` / `c80f1e4`：Orders.tsx 加退款按钮 + Modal + 状态机收紧
  - `5c90663` / `204e5a7`：vitest 3.2.6 + happy-dom + 27 单元测试（access / services / login-flow）



