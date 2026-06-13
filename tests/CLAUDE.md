# tests/ — 跨包测试

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **tests/**（这里）
> 最近更新：2026-06-14

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

- 🚧 空目录 — 跨包 E2E 待接入（小程序无 automator / Playwright 通道）
- ✅ 后端测试在 `apps/server/tests/`（**290 单元 + 18 e2e** = 308 with `RUN_E2E=1`）

### 后端 e2e 清单（`apps/server/tests/e2e/`）

| 文件 | tests | 链路 |
| --- | ---: | --- |
| `sport-flow.e2e.test.ts` | 3 | 登录 → 建群 → 加入 → 打卡 → 榜单 |
| `weekly-report.e2e.test.ts` | 2 | 周报聚合 cron 端到端 |
| `mall-flow.e2e.test.ts` | 3 | 登录 → 下单（积分兑） → 查单 → **尝试取消 paid（拒绝）** |
| `wxpay-notify.e2e.test.ts` | 2 | 微信支付 notify + 幂等 |
| **`refund-flow.e2e.test.ts`** | 3 | **Phase 4.1**：支付 → admin 退款 → 余额归零 + 流水 + 重复退款拒绝 |
| **`close-order.e2e.test.ts`** | 5 | **Phase 4.1**：状态机 5 态 + 队列契约 |

---

🤙 没有测试的代码是"祈祷式编程"。能写就写，写不动就先写 happy path。
