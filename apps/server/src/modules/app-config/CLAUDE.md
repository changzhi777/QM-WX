# app-config — 远程配置 / 功能开关 module

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/app-config/**（这里）
>
> **GAP-12 收口补建**（init #10 2026-07-15）

---

## 🎯 职责

远程配置 + 功能开关的**读端**(`configRepo`)。

**当前职责**：
- 登录接口下发的 `config` 子集(`featureFlags` + `memberLevels` + `pointsRules`)
- 功能开关中间件单独查(getFeatureFlags)

**写端**：由 admin module 负责(Phase 3 admin.setConfig)。

**注意**：app-config 是**无 routes.ts 的 module**(V0.1.149 init #9 实测 32 module 中只有 app-config 无 routes,被 `user.login` + `feature-gate` 中间件直接调 configRepo)。

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `app-config.repository.ts` | `configRepo` 对象:getLoginConfig / getFeatureFlags + DEFAULT_FEATURE_FLAGS / DEFAULT_MEMBER_LEVELS 常量 |

**测试**：N/A(repository 无 routes,测试由 user/feature-gate 间接覆盖)

---

## 🚪 数据流

### 登录下发(被 user.login 调用)
```
prisma.appConfig.findMany({ where: { id: { in: ['feature_flags', 'member_levels', 'points_rules'] } } })
  ↓
map → { featureFlags, memberLevels, pointsRules }
  ↓
返回小程序 app.ts 的 globalData.config
```

### 功能开关(被 feature-gate 中间件调用)
```
prisma.appConfig.findUnique({ where: { id: 'feature_flags' } })
  ↓
dbFlags 与 FEATURE_FLAGS(shared 常量)合并 → Record<FeatureFlag, boolean>
```

---

## 🔑 关键设计

### Fail-soft 默认值
DB 缺记录时返回默认值(`DEFAULT_FEATURE_FLAGS` / `DEFAULT_MEMBER_LEVELS` / `POINTS_RULES_DEFAULT`),避免 DB 故障导致全平台功能下线。

### 单一数据源
- `FEATURE_FLAGS` + `POINTS_RULES_DEFAULT` 来自 `@qm-wx/shared`(前后端共用)
- `DEFAULT_FEATURE_FLAGS` 在 server 端维护(补 DB 缺失项)
- `DEFAULT_MEMBER_LEVELS` 在 server 端维护(会员等级默认值,DB 可覆盖)

### 5 个功能开关
```ts
const DEFAULT_FEATURE_FLAGS = {
  wallet: false,                 // 钱包
  payment: false,                // 支付(V0.1.119 wxpay 切流前)
  membershipPurchase: false,     // 会员购买
  smartAgent: false,             // AI 私教
  bindApp: false,                // 绑定小程序(Web/小程序互登)
};
```

---

## 📦 依赖

- `@qm-wx/shared`(FEATURE_FLAGS / POINTS_RULES_DEFAULT 常量 + FeatureFlag type)
- `infra/prisma`(`appConfig` 表)

---

## ⚠️ 与 admin 模块的协作

- **写端**：admin.setConfig(action)写 `appConfig.value` 字段(Json)
- **读端**：本 module configRepo.getLoginConfig / getFeatureFlags
- **风险**：admin 写错 Json 格式 → 读端 fail-soft 兜底返默认值,但可能埋雷(上线前需测试)

---

## 📌 当前状态

- ✅ configRepo.getLoginConfig / getFeatureFlags 完整
- ✅ fail-soft 默认值兜底
- ✅ 与 shared 常量对齐(单一数据源)
- ✅ feature-gate 中间件集成

---

🤙 **GAP-12 收口补建**:app-config module CLAUDE.md。YAGNI 仅作 GAP-12 收口追踪用 — 实际开发中如改 feature flag 直接改 admin.service.ts + shared FEATURE_FLAGS 即可。