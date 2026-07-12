# Changelog

> ⚠️ **本文件归档于 V0.1.15（2026-06-11）**。
> **完整 Changelog 主入口：[根 CLAUDE.md「变更记录」段](../CLAUDE.md)** — 含 V0.1.0 → V0.1.131 全历史（约 130+ 个 commit 段）。
> 本文件仅保留版本规则文档 + V1.0 / V2 骨架历史摘要，不再追加新版本段。
>
> 最后增补：2026-07-12（V0.1.131 校准：本文件归档指引）

---

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

**当前版本**：`V0.1.15`（V0.1.0 首版 + 15 个 PATCH 段）

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

## [Unreleased] — 云端链路打通 + admin 重构 + P0-1 修复（working tree，预期 V0.1.18+）

> ⚠️ 本段为 **working tree 未提交** 改动；commit 后打 `v0.1.18+` tag。GAP-1 / GAP-2 随之关闭。

### ✨ Added
- **云端链路全打通**：真 AppID `wx8c37d7ac5b7d0a83` + 真 `WX_SECRET` + 云 PG seed（AppConfig / Product / User）+ `docker-compose.prod.yml`（生产 compose）
- **e2e**：`prod-smoke.e2e`（3 用例，CI gate 对 qingmulife.cn）+ `user-flow.e2e`（6 用例，P0-1 回归）+ `admin-audit.e2e`
- **admin 新 action**：黑名单（ban/unban）+ 审计（AuditLog 落表）+ 报表（statsByTimeRange）+ 导出（exportOrders/exportUsers CSV）
- **common/csv.ts**：CSV 导出工具
- **Prisma**：迁移 `20260629144948_auditlog_blacklist`（AuditLog + Blacklist，22→**23** 表）

### 🔧 Changed
- **admin 范式重构**：`admin.service.ts`（522 行 / 18 action）+ `admin.schema.ts`（143 行）抽离，routes 276→113 行

### 🐛 Fixed
- **P0-1 user 鉴权**（GAP-1 关闭）：`user.routes.ts:34/42/50` 三处 `if(!req.user) → await requireLogin(req)`，public 路由 me/updateProfile/bindApps 不再恒 401

### 📊 关键指标
- e2e 7→**10 files**；Prisma 22→**23 表**；覆盖率 ~88%（待 `pnpm test:coverage` 实跑校准）

---

## V0.1.13 ~ V0.1.17 — OpenAPI 契约收口 + init 刷新 + 部署加固（已 commit）

| 版本 | commit | 主题 |
| --- | --- | --- |
| V0.1.13~15 | `a5a7f07` | OpenAPI 3.1 契约补全（path 6→9 + ContentItem.type bug 修）+ e2e cleanup（sport-flow 噪音消除）+ Phase 4.2 就绪审查（wxpay 文档/代码对齐，0 gap） |
| V0.1.16 | `8307813` | `/zcf:init-project` 增量刷新（59 commit 差异校准；infra/cache + openapi-spec + refresh-certs 漏登补入；组件 3→4；测试 308→402） |
| V0.1.17 | `8029ef9` | `perf(deploy)` 部署代码审查与加固 |

**关键产出**：OpenAPI `/openapi.json`（9 paths + 16 schemas，`openapi.e2e` 19 用例 CI gate）；CT400 tag `v0.1.0`~`v0.1.17` 全推；测试 401+ 基线（365 单元 + 37 e2e）。

---

## [Unreleased] — 性能优化：Cache 基础设施接入（V0.1.5 ~ V0.1.10）

后端 `infra/cache.ts` 的 `Cache.wrap` 接入公开/鉴权热路径，命中 ~0.5ms 替代 5-10ms DB 查询。
Decimal 字段进缓存前显式 `toString()` 序列化（避免 JSON 损坏 + 缓存 hit/miss 类型一致）。

| 版本 | 端点 | 类型 | TTL | 失效策略 |
| --- | --- | --- | --- | --- |
| V0.1.5 | sport.today | 鉴权 | 60s | 精准单 key |
| V0.1.6 | mall.listProducts | 公开 | 60s | pattern 抹全分页 |
| V0.1.7 | mall.listCategories | 公开 | 60s | pattern 抹全 mall |
| V0.1.8 | user.me | 鉴权 | 30s | 精准单 key |
| V0.1.9 | mall.productDetail | 鉴权 | 5min | 精准单 key |
| **V0.1.10** | **content.list** | **公开** | **60s** | **pattern 抹全 content** |
| **V0.1.10** | **content.detail** | **公开** | **5min** | **精准单 key** |
| **V0.1.11** | **sport.myStats** | **鉴权** | **60s** | **pattern 抹用户全 period** |
| **V0.1.11** | **sport.groupRanking** | **鉴权** | **60s** | **pattern 抹群全 period（群维度共享）** |
| **V0.1.12** | **weekly-report.aggregate** | **鉴权** | **60s** | **pattern 抹群周报（群维度共享）** |

**V0.1.10 详情**：

- **server**：`content.list` / `content.detail` 接 `Cache.wrap`（公开端点，QPS 高）
- **server**：`price` / `fee`（Decimal?）进缓存前显式 `toString()` 序列化（对齐 mall，顺带修一致性）
- **server**：`admin.upsertContent` 写后失效（`invalidateContentsCache` pattern + `invalidateContentDetail` 精准单 key）
- **tests**：`content.service` 单测 8 → 16（+ Decimal 序列化断言 + 缓存 hit/miss + invalidate 行为）
- 测试 **353 unit 全绿** / 3 端 typecheck 全绿（shared / server / miniprogram）

**V0.1.11 详情**：

- **server**：`sport.myStats`（个人统计）接 `Cache.wrap`（60s，拉全周期 checkins + reduce）
- **server**：`sport.groupRanking`（群榜单）接 `Cache.wrap`（60s，sport **最重查询**：拉全群全周期 checkins + 按 userId 聚合 + sort + slice；**群维度缓存**，N 人查同榜共享）
- **server**：`groupRanking` 鉴权（isMember）留在 wrap 外 — 非成员抛 forbidden 不进缓存
- **server**：`checkin` 写后失效新增：`delByPattern('sport:myStats:{userId}:*')` + 带 groupId 时 `delByPattern('sport:groupRanking:{groupId}:*')`
- **tests**：`sport.service` 单测 17 → 25（+ 缓存 hit/miss + 群维度共享 + checkin 写后失效；scan mock 从返空增强为 pattern 匹配）
- 测试 **361 unit 全绿** / 3 端 typecheck 全绿

**V0.1.12 详情**：

- **server**：`weekly-report.aggregate` 接 `Cache.wrap`（60s，周报最重查询：拉全群本周 checkins + 聚合 + sort + top5）
- **server**：缓存 **aggregate 而非 currentWeek** — aggregate 是群维度（currentWeek/myReport/trigger 共享），A 打卡失效群 g1 单一缓存，所有查 g1 的人共享受益（解决按 userId 缓存的跨用户失效难题）
- **server**：key 含 period（本周周号）— 跨周自动不命中旧周（同 sport.today 跨日坑）
- **server**：`checkin` 带 groupId 失效新增 `delByPattern('weeklyReport:aggregate:{groupId}:*')`
- **tests**：`weekly-report.service` 单测 12 → 16（+ aggregate 缓存 hit/miss + 跨 period + 防穿透）；`sport.service` checkin 失效测试增强 weeklyReport 断言
- 测试 **365 unit 全绿** / 3 端 typecheck 全绿

**V0.1.13 详情**（OpenAPI 契约补全 — 非 Cache，归此 PATCH 系列）：

- **server**：`openapi-spec.ts` 补全 3 个 path entry — `/api/content`（list/detail 公开 + enroll 内部鉴权，security=[]）、`/api/wallet`（JWT + feature gate `wallet`）、`/api/weekly-report`（currentWeek/myReport/trigger，trigger 仅群主）；**spec path 覆盖 6 → 9 module**
- **server**：新增 `WeeklyReport` / `WeeklyReportMember` schema（aggregate 返回结构：top5 + 冠军 + 总计 + 群维度）；components.schemas 14 → 16
- **server**：🐛 修正 `ContentItem.type` enum — 旧值 `['article','marathon','event','course']` 与实际 `content.schema.ts` 的 `CONTENT_TYPES = ['marathon','hotel','scenic','food','rural']`（赛事/酒店/景区/餐饮/乡村振兴）不符，spec 文档误导
- **tests**：`openapi.e2e` gate 15 → **18**（+ 3 新 path + WeeklyReport schema 存在；+ ContentItem.type enum = 5 类防回退；+ content security=[] 公开）
- 测试 **365 unit + 36 e2e = 401 全绿**（openapi e2e 18 真环境验证通过 + 全量 e2e 36 passed）/ 3 端 typecheck 全绿（0 错误）

**V0.1.14 详情**（e2e cleanup 死代码修复 — 消除 Prisma 噪音 + 兜底隔离）：

- **server/tests**：`sport-flow.e2e` 删死代码 `GROUP_ID = 'e2e-flow-group-1'`（建群走 service cuid，该固定 ID 从不存在 → beforeAll/afterAll 的 `group.delete` 必抛 "Record to delete does not exist"，靠 `.catch` 吞但打印 Prisma 噪音日志）
- **server/tests**：抽 `cleanupFlowData()` — `deleteMany` 按 openid prefix 关联清理（`checkin→user` / `groupMember→user` / `group→owner` / `user`），beforeAll（登录前）+ afterAll 调用。`deleteMany` 删 0 行不报错 = **零噪音** + 幂等可重跑 + 兜底 it 中途失败残留
- **关键**：cleanup 移到 owner/member **登录前**（原在登录后，按 openid prefix 清会删刚登录的 user）
- 跨文件 isolation：各 e2e 文件早已用唯一 openid 前缀（`e2e-mall-`/`e2e-wxpay-`/`e2e-refund-`/`e2e-close-`/`e2e-flow-`），V0.1.3 命名空间隔离已解决跨文件数据冲突；本次只补 sport-flow 死代码噪音
- 测试 **36 e2e 全绿**（grep `does not exist` 零匹配 — 噪音消除）/ typecheck 0 错误

**V0.1.15 详情**（Phase 4.2 就绪审查 — wxpay 文档准确性修复）：

- **审查**：grep wxpay/jobs/scripts 的 TODO/沙箱/硬编码 → **0 真 gap**（无 TODO/FIXME、无 test_openid、无硬编码 AppID，沙箱说明全在注释里）— 切换路径代码侧就绪
- **🐛 wxpay.routes 注释**：删不存在的 `POST /api/wxpay/refund` 路由描述（refund 实走 `/api/admin` 的 refundOrder action）+ "MVP 占位"过时（Phase 4.1 已完整实现 refund）
- **🐛 OpenAPI wxpay path**：action enum `['notify','refund','queryBill']` → `['notify']`（`/api/wxpay` 只处理 notify；refund 走 admin.refundOrder，queryBill/downloadBill 走 scripts/reconcile.ts CLI 无 HTTP 路由）
- **e2e gate +1**：openapi 18 → 19（守 wxpay action 只 notify，防回退到错的 3 action）
- **known limitation（非阻塞）**：`fetchPlatformCerts` 首次拉证书不验签（V3 协议 bootstrap "先有鸡还是先有蛋"），业界 TOFU 标准做法，注释已记录
- 测试 **openapi e2e 19 passed**（新 gate 验证 wxpay enum 修正）/ typecheck 0 错误

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

---

## [Unreleased] — 2026-06-29 部署代码审查与加固（V0.1.17）

> 触发：腾讯云生产部署（qingmulife.cn）9 坑全解后的代码审查；用户拍板方案 A + C 子集（安全 + 一致性 + 可观测性），无行为变更。

### 🔒 安全

- `deploy/nginx-qmwx-api.conf`：`location = /health` 精确反代（健康检查绕过 `/api/` 前缀 + `access_log off`）+ `client_max_body_size 20m`（防上传 413）
- `env.example`：`JWT_SECRET` 占位改为仅 dev 用 + 顶部加 `⚠️ 生产 openssl rand -hex 32` 警告
- `docker-compose.yml`：server 段 `WX_APPID` / `WX_SECRET` 默认值移除，强制显式（`${WX_APPID:?}`）

### 🧹 一致性

- `env.example`：补 `WX_REFUND_NOTIFY_URL`（Phase 4.1 退款回调）
- `.github/workflows/deploy-staging.yml`：移除 `git pull --ff-only 2>/dev/null || true`（legacy 段），**镜像 tag 为唯一可信源**，避免镜像与代码版本错配

### ⚡ 性能 / 可观测性

- `deploy/nginx-qmwx-api.conf`：`/uploads/` 由 nginx 直接 `alias` serve + `expires 30d` + `Cache-Control: public, immutable`（省一次 server 反代）
- `deploy/nginx-qmwx-api.conf`：注释补充 gzip 建议段（应用时由运维粘贴）
- `apps/server/Dockerfile`：runner 阶段加 `HEALTHCHECK`（`wget /health` × 30s × 3 → docker compose 自愈重启）

### ✅ 验证

- `scripts/smoke.sh`：`[6]` 段模块覆盖从 5 扩到 7（user / sport / mall / content / weekly-report / admin / wallet / wxpay），app-config 未注册到 `/api/` 故不入清单

### 🚫 不在范围（明确延后 → V0.1.18+）

- `deploy/staging.sh` 重写：走 `docker-compose.prod.yml` 而非单容器 `docker run`，统一 staging ≈ prod
- `apps/server/Dockerfile` 镜像精简：改用 `pnpm deploy --filter @qm-wx/server` 替换全量 `COPY /repo`
- `prod-deploy.sh` 一键 SSH 部署脚本
- `monitor.sh` 监控脚本（PM2-like 日志 + 内存监控）

### 📦 变更文件清单（7 个）

| 文件 | 改动类型 |
| --- | --- |
| `deploy/nginx-qmwx-api.conf` | 加固 |
| `env.example` | 补字段 |
| `docker-compose.yml` | 强约束 |
| `apps/server/Dockerfile` | 加 HEALTHCHECK |
| `scripts/smoke.sh` | 扩模块覆盖 |
| `.github/workflows/deploy-staging.yml` | 去 git pull |
| `CHANGELOG.md` | 本段 |

---

## [Unreleased] — 2026-06-29 admin 审计 + 黑名单（V0.1.18）

> 触发：V0.1.17 部署到生产后,缺关键操作留痕 + 违规用户封禁机制。本段补齐生产运营闭环。

### ✨ Added

- **AuditLog 表**（`prisma/schema.prisma`）— BigInt 自增主键 + actorOpenid/action/target/payload(ip) + 3 索引（actor+time / action+time / time）
- **3 个 admin action**：
  - `banUser { openid, reason }` — 封禁用户（幂等：已 banned 不重写）
  - `unbanUser { openid }` — 解封（幂等：未 banned 不重写）
  - `listAuditLogs { page, pageSize, action?, actorOpenid?, startDate?, endDate? }` — 时间倒序分页 + 多维筛选
- **自动审计留痕**（4 个关键 admin 操作）：refundOrder / setConfig / banUser / unbanUser → 写 `admin.{action}` audit log
- **黑名单拦截**（`assertNotBanned`）：order.service.create + sport.service.checkin 在关键路径前查 user.isBanned

### 🔧 Changed

- `admin.service.ts` setConfig / refundOrder 签名加 `(actorOpenid, ip?)` 入参 → routes 透传 `req.user.openid` 和 `req.ip`
- `admin.schema.ts` 新增 6 个 schema（v0.1.18 + 3 黑名单/审计,v0.1.19 + 3 报表/导出）
- `admin.routes.ts` switch 加 6 个 case（v0.1.18 + 3,v0.1.19 + 3）;**Action 总数：11 → 17**

### 📚 Documentation

- `apps/server/CLAUDE.md` admin 行更新（11 → 17 action,新增审计/黑名单/报表/导出说明）

### 📊 测试指标

- 单元测试:`+12`（admin.service.test.ts 新增）= 365 + 12 = **377 passed**
- e2e 测试:`+3`（admin-audit.e2e.test.ts 新增）= 37 + 3 = **40 e2e**
- 迁移:`+1`（`20260629144948_auditlog_blacklist/migration.sql`）

### 📦 变更文件清单（11 个）

| 文件 | 改动 |
| --- | --- |
| `prisma/schema.prisma` | + AuditLog model + User 3 字段 |
| `prisma/migrations/20260629144948_auditlog_blacklist/` | 新迁移 |
| `apps/server/src/modules/admin/admin.schema.ts` | + 6 schema（v0.1.18 + v0.1.19）|
| `apps/server/src/modules/admin/admin.service.ts` | + ban/unban/listAudit/recordAudit + 2 处留痕改签名 |
| `apps/server/src/modules/admin/admin.routes.ts` | + 6 action |
| `apps/server/src/modules/mall/order.service.ts` | + assertNotBanned |
| `apps/server/src/modules/sport/sport.service.ts` | + user 取 + assertNotBanned |
| `tests/modules/admin/admin.service.test.ts` | 新增 12 测试 |
| `tests/e2e/admin-audit.e2e.test.ts` | 新增 3 e2e |
| `apps/server/CLAUDE.md` | admin 行更新 |
| `CHANGELOG.md` | 本段 |



