# src/ — 源代码

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **src/**（这里）

---

## 🎯 职责

存放所有**业务代码**。任何能"运行起来产生用户价值"的东西都在这里。

> ❌ **不要**把以下内容塞进 `src/`：
> - 文档（→ `docs/`）
> - 测试（→ `tests/`）
> - 构建脚本（→ 根目录的 `package.json` scripts）
> - 临时调试文件（→ 删掉 / 放到 `.gitignore`）

---

## 📂 建议子结构（待定）

```
src/
├── pages/         # 微信小程序页面（或路由组件）
├── components/    # 通用 UI 组件
├── api/           # 网络请求 / 接口封装
├── store/         # 全局状态（如果用 Redux / Pinia / MobX 等）
├── utils/         # 工具函数（纯函数优先）
├── hooks/         # 组合式函数（如果是 React/Vue 生态）
├── constants/     # 枚举 / 常量
├── types/         # 全局类型定义
└── app.ts         # 小程序入口 / 应用根组件
```

> ⚠️ **YAGNI 提醒**：上面这些目录是"可能需要"，**不要一次性全建**。等真正用到哪个再 `mkdir` 哪个。

---

## 🚪 入口约定

- 微信小程序原生：`src/app.ts`（或 `src/app.js`）+ `src/app.json`
- 跨端框架：遵循框架默认入口（`main.ts` / `main.tsx`）
- 暂未确定，等技术栈定下来后补充

---

## 📦 依赖约定

- **运行时依赖**：放进 `dependencies`
- **开发依赖**：放进 `devDependencies`
- **避免巨型依赖**：单包 > 500KB 需评估替代方案
- **锁定版本**：用 `pnpm-lock.yaml` / `package-lock.json`

---

## 🧪 测试

测试代码**不放在 `src/` 下**，统一在 `tests/`（见 [tests/CLAUDE.md](../tests/CLAUDE.md)）。

例外：单元测试与代码紧耦合时（如 vitest 的 `*.test.ts` co-located 模式），允许放在 `src/` 旁边。需要在根 CLAUDE.md 登记约定。

---

## 📌 当前状态

- 🚧 空目录，等待技术栈 & 业务方向确定后填充

---

🤙 模块要小，职责要清。别做"大泥球"。
