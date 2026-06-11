# tests/ — 跨包测试

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **tests/**（这里）

---

## 🎯 职责

存放**跨包端到端测试**（跨 miniprogram + server + shared 的集成验证）。

> ⚠️ **注意**：后端自身的单元测试和 E2E 测试在 [`apps/server/tests/`](../apps/server/tests/)，
> 本目录用于**跨包集成**场景（暂空，等 miniprogram-automator 或 Playwright 接入后使用）。

---

## 📂 建议子结构

```
tests/
├── e2e/           # 跨包端到端（小程序 → 后端 → DB 全链路）
├── fixtures/      # 测试数据 / mock 资源
└── utils/         # 测试工具函数
```

> ⚠️ **YAGNI**：先有测试需求再建对应目录。

---

## 🧪 测试框架

| 维度 | 选型 | 备注 |
| --- | --- | --- |
| 单元/集成 | **Vitest** | 与后端统一 |
| E2E | miniprogram-automator / Playwright | 待接入 |
| Mock | vi.mock | |

---

## 📌 当前状态

- 🚧 空目录 — 跨包 E2E 待接入
- ✅ 后端测试在 `apps/server/tests/`（30 单元 + 5 e2e）

---

🤙 没有测试的代码是"祈祷式编程"。能写就写，写不动就先写 happy path。
