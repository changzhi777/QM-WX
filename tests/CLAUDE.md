# tests/ — 测试

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **tests/**（这里）

---

## 🎯 职责

存放**测试代码与测试数据**：
- 单元测试
- 集成测试
- 端到端（E2E）测试
- 测试 fixture / mock 数据
- 覆盖率报告

> ❌ **不要**把以下内容塞进 `tests/`：
> - 业务代码（→ `src/`）
> - 生产环境的 mock 服务（→ 独立仓库 / `scripts/`）
> - 性能基准（用专门的 `bench/` 目录或工具）

---

## 📂 建议子结构

```
tests/
├── unit/          # 单元测试（与代码解耦，独立可跑）
├── integration/   # 集成测试（多模块协作）
├── e2e/           # 端到端测试
├── fixtures/      # 测试数据 / mock 资源
├── utils/         # 测试工具函数
└── setup.ts       # 全局测试 setup（vitest / jest）
```

> ⚠️ **YAGNI 提醒**：先有测试需求再建对应目录。空目录不要占位。

---

## 🧪 框架选型（占位）

| 维度 | 候选 | 备注 |
| --- | --- | --- |
| 单元测试 | Vitest / Jest | 推荐 Vitest（更快、ESM 原生） |
| E2E | 微信开发者工具自带 / Playwright | 小程序用工具自带 |
| Mock | vi.mock / msw / nock | 看具体场景 |
| 覆盖率 | c8 / istanbul | Vitest 内置 c8 |

技术栈确定后回来更新此表。

---

## ✍️ 命名规范

- 测试文件：`*.test.ts` / `*.spec.ts`（与被测文件同名）
- 目录镜像 `src/` 结构（如果用 co-located 模式就放 `src/` 旁边）
- fixture 文件：`*.fixture.ts` 或 `*.fixture.json`

---

## 📊 覆盖率目标

- **未设定** — 等业务方向明确后定阈值（参考行业：单元 80% / 关键路径 100%）

---

## 🏃 运行测试

```bash
# 待 package.json 配置后
pnpm test           # 单次跑
pnpm test:watch     # watch 模式
pnpm test:coverage  # 覆盖率报告
```

---

## 📌 当前状态

- 🚧 空目录，等待技术栈 & 业务方向确定后填充

---

🤙 没有测试的代码是"祈祷式编程"。能写就写，写不动就先写 happy path。
