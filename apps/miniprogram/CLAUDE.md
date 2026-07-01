# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)
> 最近更新：2026-07-01（init-project 增量校验 — 「我的」页接入佳明活动数据展示）

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
#    AppID：wx8c37d7ac5b7d0a83（已在 project.config.json 配）

# 3. 配置本地后端地址
#    编辑 miniprogram/config/env.ts
#    或在 app.ts onLaunch 里改 $apiBase
```

> 后端未启动时，开发者工具控制台会报网络错误是正常的。

---

## 📂 目录结构

```
miniprogram/
├── app.ts                          # 应用入口（静默登录 + 全局 $apiBase/$token）
├── app.json                        # 页面路由 + tabBar + 全局窗口配置
├── app.wxss                        # 全局样式（--brand: #0FAF8E，限 300 行内）
├── sitemap.json                    # 搜索接入配置
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   └── format.ts                   # 配速/距离/日期格式化
├── services/
│   └── api.ts                      # **唯一**调后端的地方（含 refresh 一次重试）
├── components/
│   ├── feature-gate/               # 功能开关守卫组件（读取远程 feature_flags）
│   ├── error-state/                # 通用错误态组件（方案 B 引入）
│   ├── privacy-popup/              # 隐私协议弹窗
│   └── profile-popup/              # 用户资料弹窗
├── pages/
│   ├── index/                      # 首页（tabBar）
│   ├── sport/                      # 运动打卡（tabBar）
│   ├── mall/                       # 商城（tabBar）
│   ├── mine/                       # 我的（tabBar）
│   ├── profile/                    # 个人资料
│   ├── group-detail/               # 跑群详情
│   ├── weekly-report/              # 周报战报
│   ├── content-list/               # 内容列表（赛事/酒店/景区等）
│   ├── content-detail/             # 内容详情
│   ├── product-detail/             # 商品详情
│   ├── order-confirm/              # 订单确认
│   ├── order-list/                 # 订单列表
│   └── agreement/                  # 用户协议
└── images/
    └── tabbar/                     # 8 个 tabBar 图标（4 普通 + 4 选中）
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
- **目录命名**：`kebab-case`
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

- ✅ 13 个页面全部就位（4 tabBar + 9 子页面）
- ✅ 4 个组件（feature-gate / error-state / privacy-popup / profile-popup）
- ✅ `app.ts` 静默登录逻辑
- ✅ `services/api.ts` 统一封装（含 refresh 一次重试）
- ✅ `utils/auth.ts` / `format.ts` / `config/env.ts`
- ✅ `sitemap.json` + `project.config.json`
- ✅ 品牌色 #0FAF8E 全局应用
- ✅ **「我的」页接入佳明活动数据**（2026-07-01）— `api.call('device', 'myActivities', { page:1, pageSize:3 })` 展示最近活动（距离/时长/类型），`garminLoading` / `garminActivities` 状态驱动 wxml 条件渲染
- 🚧 tabBar 图标待设计替换（当前占位图）
- 🚧 各页面 UI 待按 Phase 推进完善

---

🤙 别在 tabBar 上反复纠结，先把 `services/api.ts` 跑通。
