# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)

---

## 🎯 职责

微信小程序前端，业务调用全部走 `services/api.ts`（替代旧 `wx.cloud.callFunction`）。

---

## 🏃 快速上手

```bash
# 1. 装依赖（monorepo 根）
cd ../.. && pnpm install

# 2. 用微信开发者工具打开本目录
#    路径：apps/miniprogram/
#    AppID：wx426885831a05f18e（已在 project.config.json 配）

# 3. 配置本地后端地址
#    编辑 miniprogram/config/env.ts
#    或在 app.ts onLaunch 里改 $apiBase
```

> 后端未启动时，开发者工具控制台会报网络错误是正常的（Phase 0 阶段）。

---

## 📂 目录约定

```
miniprogram/
├── app.{ts, json, wxss}            # 应用入口（**app.wxss 限 300 行内**）
├── sitemap.json                    # 搜索接入配置（必须）
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   ├── format.ts                   # 配速/距离/日期
│   └── constants.ts
├── services/
│   └── api.ts                      # **唯一**调后端的地方
├── components/
│   ├── ranking-list/
│   ├── product-card/
│   ├── cell/
│   ├── empty-state/
│   └── feature-gate/               # 功能开关守卫组件
└── pages/
    ├── index/      sport/      group-detail/
    ├── mall/       product-detail/  order-confirm/  order-list/
    ├── mine/       profile/    bind-app/  wallet/  membership/
    └── content-list/  content-detail/
```

---

## 🚪 API 调用约定

**唯一入口**：`services/api.ts` 的 `api.call(module, action, payload)`。

```ts
// ✅ 正确
import { api } from '@/services/api';
const { user } = await api.call('user', 'login', { code });

// ❌ 错误：散落 wx.request
wx.request({ url: 'https://...' });
```

**好处**：
- 自动加 token / refresh
- 统一 loading / 错误 toast
- 端点路径走 `@qm-wx/shared/api-contracts`，无硬编码

---

## 🎨 设计规范

- **品牌色**：`#0FAF8E`（青沐绿），定义在 `app.wxss` 的 `--brand` 变量
- **页面级 wxss**：必须独立文件；`app.wxss` 只放变量和通用类
- **目录命名**：`kebab-case`，沿用 02 §3 改名（`statistics→mall` / `group→sport` / `settings→mine`）
- **废弃 API**：`getUserProfile` / `getUserInfo` 全部禁止使用；改 `button open-type="chooseAvatar"` + `input type="nickname"`

---

## 📦 依赖

- **运行时**：`@qm-wx/shared`（workspace 协议）
- **类型**：`miniprogram-api-typings`（仅 dev）

---

## 🧪 测试

小程序代码 Vitest 单测能力有限（无 jsdom 模拟 wx）。**策略**：
- **业务逻辑**（utils / services）抽成纯函数，单测覆盖
- **页面渲染**走微信开发者工具的真机调试
- **端到端**：未来可接 miniprogram-automator / Playwright

---

## 📌 当前状态

- ✅ 4 个 tabBar 页面骨架（index / sport / mall / mine）
- ✅ `app.ts` 静默登录逻辑
- ✅ `services/api.ts` 统一封装（含 refresh 一次重试）
- ✅ `utils/auth.ts` / `format.ts`
- ✅ `components/feature-gate` 组件
- ✅ `sitemap.json`（T0-1 已完成）
- ✅ `project.config.json` + `project.private.config.json`
- 🚧 `pages/sport` / `pages/mall` / `pages/mine` / 等页面待 Phase 1+ 实施
- 🚧 `images/tabbar/*.png` 8 个图标待设计（先放空，开发者工具会 warn 但不阻塞）

---

🤙 别在 tabBar 上反复纠结，先把 `services/api.ts` 跑通。
