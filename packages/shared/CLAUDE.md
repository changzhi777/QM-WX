# packages/shared — 前后端共享层

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **packages/shared/**（这里）

---

## 🎯 职责

前后端共享的**类型定义、Zod schema、常量、API 端点契约**。
**单一数据源**：严禁在后端或小程序里重复定义与这里重复的常量/类型。

---

## 📂 目录结构

```
src/
├── index.ts                        # 统一导出入口
├── types/
│   └── index.ts                    # TS 类型（从 Zod schema 推导）
├── constants/
│   ├── feature-flags.ts            # 功能开关定义（wallet / payment / membership / ai）
│   ├── member-levels.ts            # 会员等级（free / monthly / quarterly / yearly）
│   └── points-rules.ts             # 积分规则（打卡 +N / 注册 +N / 等）
└── api-contracts/
    └── endpoints.ts                # API 端点路径常量（module/action 映射）
```

---

## 🚪 导出接口

```ts
// 包入口
export * from './constants/feature-flags.js';
export * from './constants/member-levels.js';
export * from './constants/points-rules.js';
export * from './api-contracts/endpoints.js';
export * from './types/index.js';

// 子路径导出（package.json exports）
import {} from '@qm-wx/shared/types';
import {} from '@qm-wx/shared/constants/feature-flags';
import {} from '@qm-wx/shared/api-contracts';
```

---

## 📦 依赖

- **运行时**：`zod`（schema 定义 + 类型推导）
- **开发**：`typescript` `vitest`

---

## 🧪 测试

```bash
pnpm test              # 单次跑
pnpm typecheck         # 类型检查
pnpm build             # tsc -p tsconfig.build.json → dist/
```

---

## ⚠️ Zod v3.25 注意事项

`z.infer<>` 在 v3.25+ 返回 **input 形式**（带 optional），
要用 `z.output<>` 拿 applied default 后的类型。详见 [[phase2-complete]]。

---

## 📌 当前状态

- ✅ 4 个常量模块（feature-flags / member-levels / points-rules / endpoints）
- ✅ 类型导出（从 Zod schema 推导）
- ✅ 构建产物 `dist/`（.js + .d.ts + .map）
- ✅ 前后端共用（后端通过 `workspace:*` 引用，小程序通过构建后产物引用）

---

🤙 改常量只改这里，别在两端各写一份。
