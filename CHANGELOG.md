# Changelog

> QM-WX 青沐生命科技微信小程序 + Node 后端
> 参考任务：**CT400**（V1.0 初始化 + V2 骨架 + 部署准备）
> 时间：2026-06-11

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


