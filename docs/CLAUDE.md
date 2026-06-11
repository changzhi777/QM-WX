# docs/ — 设计文档

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../CLAUDE.md) → **docs/**（这里）

---

## 🎯 职责

存放**人类可读的文档**：
- 架构决策记录（ADR）
- 技术选型与设计
- 分阶段计划
- 部署 / 运维手册
- 提交前检查清单

> ❌ **不要**把以下内容塞进 `docs/`：
> - API 自动生成的参考（用工具生成，放 `dist/` 或专门站点）
> - 临时笔记（用 Notion / Obsidian 等外部工具）
> - 截图二进制堆砌（建专门的 `docs/assets/` 目录管理）

---

## 📂 文档清单

| 文档 | 一句话主题 | 状态 |
| --- | --- | --- |
| [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) | V2 架构设计（Node+TS 自建后端，取代云开发方案） | ✅ 当前有效 |
| [PHASE-0-PLAN.md](PHASE-0-PLAN.md) | Phase 0 地基计划（T0-1~6） | ✅ 已完成 |
| [PHASE-V2-PLAN.md](PHASE-V2-PLAN.md) | V2 模块计划（device/recipe/ludong） | ✅ 已完成 |
| [CI.md](CI.md) | CI/CD 流程（GitHub Actions + Docker + ACR） | ✅ 当前有效 |
| [STAGING_DEPLOY.md](STAGING_DEPLOY.md) | Staging 部署手册（ECS/ACR/Secrets/故障排查） | ✅ 当前有效 |
| [SUBMIT-CHECKLIST.md](SUBMIT-CHECKLIST.md) | 小程序提交前检查清单 | ✅ 当前有效 |

---

## 📝 写作规范

- **文件名**：`kebab-case.md`
- **语言**：中文（与服务对象保持一致）
- **代码示例**：必须**能跑**，禁止伪代码占位
- **图表**：优先 Mermaid（GitHub 原生支持），其次 SVG
- **更新日期**：每篇顶部加 `> 最后更新：YYYY-MM-DD`

---

## 🔗 引用约定

- 引用其他文档：相对路径，如 `[CI 流程](CI.md)`
- 引用代码：路径 + 行号，如 `apps/server/src/app.ts:31`
- 引用 issue / PR：完整 URL

---

🤙 文档是写给未来的自己和别人看的，省一句解释，未来多花一小时。
