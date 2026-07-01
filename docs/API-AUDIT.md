# API 审查报告 — QM-WX 后端（14 module）

> 审查日期：2026-06-29 | 审查者：`/zcf:workflow` | 范围：`apps/server/src/modules` 全 14 module
> 方法：routes/schema 代码遍历 + 元数据提取（action / 鉴权 / 校验）+ auth middleware 行为分析

---

## 1. 总览矩阵

| module | action 数 | 公开 | feature-gate | service 层 | schema 文件 | routes 行 | 模式评价 |
|---|---|---|---|---|---|---|---|
| **admin** | 7 | 0 | — | ❌ 内联 | ❌ 内联 | 276 | 🔴 待重构 |
| auth | 路径式 | 1 | — | ❌ 内联 | — | 80 | 🟡 |
| content | 3 | 1（list/detail） | — | ✅ | ✅ | 48 | 🟢 |
| device | 5 | 0 | — | ✅ stub | ✅ | 49 | 🟡 V2 stub |
| ludong | 4 | 0 | — | ✅ stub | ✅ | 43 | 🟡 V2 stub |
| mall | 6 | 1（list/categories） | — | ✅ | ✅ | 63 | 🟢 |
| recipe | 6 | 0 | — | ✅ stub | ✅ | 61 | 🟡 V2 stub |
| sport | 8 | 0 | — | ✅ | ✅ | 82 | 🟢 |
| upload | 路径式 | 0 | — | ❌ 内联 | — | 53 | 🟡 |
| **user** | 4 | 1（login） | — | ✅ | ✅ | 61 | 🔴 **P0 鉴权 bug** |
| **wallet** | 3 | 0 | `requireFeature:wallet` | ✅ | ✅ | 45 | 🟢 **标杆** |
| weekly-report | 3 | 0 | — | ✅ | ✅ | 40 | 🟢 |
| wxpay | 路径式（notify） | 2 | — | ✅ | ✅ | 161 | 🟢 |

**action 合计** ≈ 49（admin7 + content3 + device5 + ludong4 + mall6 + recipe6 + sport8 + user4 + wallet3 + weekly3）+ auth/upload/wxpay 路径式。

---

## 2. 架构范式对比

**🟢 标杆（wallet，45 行）**：路由级 `config.requireFeature:'wallet'` 守卫 + 独立 `wallet.service.ts` + 独立 `wallet.schema.ts` + 瘦 routes（switch 调 service）。**admin 重构应仿此范式。**

**🔴 反例（admin，276 行）**：无 service、schema 内联、`isAdmin`+缓存逻辑内联，单文件 7 个 switch case 耦合鉴权+校验+业务+缓存失效。

---

## 3. 问题清单

### 🔴 P0（安全 / 功能 bug — 建议立即修）

#### ~~P0-1 · user 鉴权 bug：me / updateProfile / bindApps 永远 401~~ ✅ 已修（V0.1.18+19）

- **修复方案 A**：`user.routes.ts` 内 3 处 `if (!req.user) throw` → `const authUser = await requireLogin(req);`
- **修复位置**：`apps/server/src/modules/user/user.routes.ts:32/39/46` → 现已统一改为 `requireLogin(req)`，配套注释说明 public 路由内显式鉴权的必要性
- **回归测试**：`apps/server/tests/e2e/user-flow.e2e.test.ts`（RUN_E2E=1 启用）— 覆盖 `login → me → updateProfile → bindApps` 全链路，确保 public 路由内鉴权正确
- **修复 commit**：见 git log `V0.1.18`+ `V0.1.19`（admin 重构同段）
- **历史描述保留**：如下方折叠段

<details>
<summary>📜 历史问题描述（保留供回溯）</summary>

- **现象**：`/api/user` 整体设 `config.public:true`（为让 login 免登录），但 `me`/`updateProfile`/`bindApps` 在同一路由内用 `if (!req.user) throw Errors.unauthorized()` 守卫。
- **根因**：`auth.ts:40` —— authPlugin 的 onRequest hook 对 `public:true` 路由**直接 return，跳过 `jwtVerify`** → `req.user` 永远 `undefined` → `if (!req.user)` 永远抛 401。**即客户端带正确 access token 也调不通这三个 action。**
- **证据链**：
  - `user.routes.ts:20` `config:{public:true}`
  - `user.routes.ts:34/41/49` `if (!req.user) throw Errors.unauthorized()`（**修复前**）
  - `auth.ts:40` `if (req.routeOptions.config?.public) return;`（跳过 jwtVerify）
  - 项目已提供 `requireLogin(req)`（`auth.ts:61`，public 路由内主动 `jwtVerify`），**但 user.routes 未使用**
- **影响**：小程序「我的」页（me）、资料修改（updateProfile）、App 绑定（bindApps）全部失效。e2e（mall-flow 等）未覆盖 user.me，故 CI 未暴露。

</details>

### 🟠 P1（重要 — 本次波②处理）

#### P1-1 · admin 无 service 层（276 行内联）
应仿 wallet 抽 `admin.service.ts`：移入 `isAdmin`+缓存 + 7 action 方法；routes 瘦身为分发层（鉴权 + schema parse + 调 service），预期 ≤120 行。

#### P1-2 · admin 缺管理 action
qm-admin 前端无数据源。应补：`listUsers` / `listContents`（含 off）/ `listProducts`（含 off）/ `stats`（概览：用户数/订单数/收入/打卡数）。

### 🟡 P2（一致性 / 优化 — 后续）

- **P2-1 · schema 位置不一致**：admin schema 内联，其他 12 module 用独立 `.schema.ts`。admin 重构时一并抽 `admin.schema.ts`。
- **P2-2 · admin SetConfig 校验过宽**：`SetConfigSchema.value` 用 `z.record(z.unknown())`，feature_flags/member_levels/points_rules 结构未约束。
- **P2-3 · V2 stub（device/recipe/ludong）mock 实现**：阶段正常，待 Phase 6/7 真接外部 API。
- **P2-4 · 公开端点公开度复核**：content.enroll 在 public 路由内（list/detail 公开合理，enroll 应鉴权 —— 需确认是否用 requireLogin）。

---

## 4. 逐 module 详述（关键项）

### admin（🔴 待重构）
7 action（upsertContent/upsertProduct/setConfig/listAdmins/listOrders/updateOrderStatus/refundOrder），全内联，无 service。isAdmin 内存缓存（60s TTL + 主动失效）。refundOrder 委托 `refundService`（已解耦 ✅）。**重构详见波②。**

### user（🟢 P0 已修）
4 action。login 公开 ✅。**me/updateProfile/bindApps 鉴权已修（P0-1）** — 改用 `requireLogin(req)`。有 userService（✅），路由层 public 混合下的鉴权正确处理。

### wallet（🟢 标杆）
3 action（get/transactions/recharge），路由级 `requireFeature:wallet`（wallet 关闭时全 403）。service + schema 齐全。**admin 重构的参照模板。**

### sport（🟢，最大业务 module）
8 action（checkin/createGroup/joinGroup/quitGroup/myGroups/today/myStats/groupRanking）。service + schema 齐全，Cache.wrap 接入（V0.1.5/11）。模式良好。

### wxpay（🟢）
notify 公开回调（验签 + 幂等 + 关单保护），service 完整（refund/queryBill/downloadBill）。Phase 4.1 闭环。

### V2 stub（device/recipe/ludong，🟡）
device 5 action / recipe 6 / ludong 4，有 service（mock）+ schema。等外部 API。

---

## 5. 优化建议（优先级）

| 序 | 项 | 优先级 | 归属 |
|---|---|---|---|
| 1 | ~~user 鉴权修复（P0-1）~~ | ✅ 已修 | 见 §P0-1 修复说明 |
| 2 | admin 抽 service + 补 4 action（P1-1/2） | 🟠 本次波② | 本次 |
| 3 | admin schema 抽离 + SetConfig 收紧（P2-1/2） | 🟡 后续 | 可并入波② |
| 4 | content.enroll 公开度复核（P2-4） | 🟡 后续 | — |

---

> 🤙 审查最大收获：**P0-1 user 鉴权 bug** —— 静态分析锁定（auth.ts:40 public 跳过 jwtVerify），已用 `requireLogin(req)` 修复并加 e2e 回归。admin 重构有 wallet 标杆范式可循。
