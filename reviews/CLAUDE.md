# reviews/ — 评审资料

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **reviews/**（这里）

---

## 🎯 职责

存放**评审/设计/任务拆解类资料**，**非源代码**。这些文档是过去 AI 工作流（`/zcf:feat` 等）产出的沉淀，供后续开发引用。

- ✅ 在此目录：**架构设计、任务拆解、外部 API 选型、支付/硬件对接方案、竞品分析**
- ❌ **不要**把以下内容塞进 `reviews/`：
  - 业务代码（→ `src/`）
  - API 自动生成的参考（→ `docs/`）
  - 临时笔记（→ 外部工具）
  - 大型二进制（→ 单独归档，本目录只放 `.md` 与构建脚本）

---

## 📂 当前子目录

### `running-group-stats/` — 青沐生命科技小程序 · 重构文档包

> 生成日期：2026-06-10 · 基于代码库 running-group-stats 全量审查（15 页面 / 13 云函数 / ~8800 行）
>
> 30 秒结论：现状是**可演示原型**，约 80% 功能为模拟实现；存在 3 个致命安全问题 + 1 个技术前提不成立问题；重构总量约 28–35 人天。

| 文档 | 一句话主题 | 状态 | 主要读者 |
| --- | --- | --- | --- |
| [01-code-review.md](running-group-stats/01-code-review.md) | 代码审查报告：P0/P1/P2 问题清单 + 各文件速查表 | ✅ 必读 | 全体开发 |
| [02-architecture.md](running-group-stats/02-architecture.md) | 重构目标架构：目录/数据库/6 个云函数/登录/群/支付流程 | ✅ 必读 | 开发（实现依据） |
| [03-product-prototype.md](running-group-stats/03-product-prototype.md) | 产品原型 + 业务闭环 + 竞品参考 + 逐页交互 | ✅ 必读 | 产品 + 开发 |
| [04-task-breakdown.md](running-group-stats/04-task-breakdown.md) | 任务拆解：5 个 Phase + 验收标准 + 里程碑 + 风险 | ✅ 必读 | 负责人 + 开发 |
| [05-payment.md](running-group-stats/05-payment.md) | 微信支付接入：申请清单/开发细则/参考代码/积分内部化规则 | ✅ 必读 | 负责人（申请）+ 开发 |
| [06-device-integration.md](running-group-stats/06-device-integration.md) | 手表/手环对接：蓝牙 BLE 实时心率 + 各厂商 OAuth 授权采集（Phase 6） | 二期 | 开发 |
| [07-food-nutrition-apis.md](running-group-stats/07-food-nutrition-apis.md) | 国内菜谱/营养 API 选型 + 缓存代理设计 | 二期 | 产品 + 开发 |
| [08-recipe-ingestion-and-ludong.md](running-group-stats/08-recipe-ingestion-and-ludong.md) | 菜谱采集 ETL（统一 Schema/去重/审核）+ 律动平台双向对接（Phase 7） | 二期 | 开发 + 律动团队 |
| [README.md](running-group-stats/README.md) | 文档包导航 + 30 秒结论 | ✅ 入口 | 任何人 |
| [build_docs.py](running-group-stats/build_docs.py) | 把上述 9 份 md 拼成 `review-package.html` / `review-package.pdf` 的构建脚本 | 🔧 工具 | 维护者 |
| `review-package.html` | 网页汇总版（可浏览器打开 / 打印） | 产物 | 任何人 |
| `review-package.pdf` | PDF 版（可打印 / 分发） | 产物 | 任何人 |

---

## 🧭 怎么用

### 开发一个新需求前

1. 先读 [`running-group-stats/02-architecture.md`](running-group-stats/02-architecture.md) §2-§7（架构 + 集合 + API 契约）
2. 再读 [`running-group-stats/04-task-breakdown.md`](running-group-stats/04-task-breakdown.md) 找到对应 Phase 和任务 ID
3. 如果涉及支付，看 [`05-payment.md`](running-group-stats/05-payment.md)；涉及硬件，看 [`06-device-integration.md`](running-group-stats/06-device-integration.md)
4. **别**脱离这 4 份文档另起一套设计 — 默认假设它们是项目的"宪法"

### 引用约定

- 引用文档：相对路径，如 `[02 §5.1](running-group-stats/02-architecture.md#51-登录替换现有假登录)`
- 引用任务：用 `Phase X / T-` 前缀，如 **T0-5、Phase 1 / T1-1**

---

## 🔧 维护说明

### 重新构建 HTML / PDF

```bash
# 需先安装依赖：pip install markdown
cd reviews/running-group-stats
python3 build_docs.py
```

构建脚本会读取 9 份 md，按 `01 → 08` + README 顺序合并，应用内嵌的青绿色 CSS 主题，输出：
- `review-package.html`（单文件，方便浏览器阅读/打印为 PDF）
- `review-package.pdf`（需 `weasyprint` 等额外依赖，按需安装）

> ⚠️ 不要手动改 HTML/PDF 产物，它们是脚本生成；改 markdown 源文件 + 重跑脚本。

---

## 📌 当前状态

- ✅ **8 篇 review 文档已就位** + 构建脚本 + 网页/PDF 产物
- 🟢 `running-group-stats/` 是一个**完整的、可重跑**的评审包

---

🤙 评审资料是项目的"过去"，把它当宪法读，别当历史考古。
