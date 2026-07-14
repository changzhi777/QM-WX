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
| [**PHASE-4-2-PREP.md**](PHASE-4-2-PREP.md) | **Phase 4.1 → 4.2 切真生产 playbook**（商户号/证书/env 模板/监控/回滚/9 项 checklist） | ✅ **新增** |
| [**API-AUDIT.md**](API-AUDIT.md) | **API 审查报告**：P0/P1 清单（P0-1 user 鉴权 / P1 admin schema 内联，**均已在 working tree 修复**） | ✅ **新增** |
| [**VERIFY-CHECKLIST.md**](VERIFY-CHECKLIST.md) | **V0.1.121 真机验证 + wxpay 商户配置清单**（功能矩阵 + 商户号批后步骤 + payment flag SQL + 回滚） | ✅ **新增** |
| [**qweather-api.md**](qweather-api.md) | **和风天气 API 对接说明**（`stats.weather` action + 凭据管理 + 长沙默认值 + V0.1.148 API KEY 明文暴露修复记录） | ✅ **V0.1.148 新增** |
| [**C-DEPLOY-CHECKLIST.md**](C-DEPLOY-CHECKLIST.md) | **C 部署清单 — Terra API key + 微信体验版上传**（挂账主人手动操作项，含 Terra 申请流程 + 微信开发者工具/公众平台步骤 + 真机验证项） | ✅ **V0.1.148 新增** |
| [**COS-STORAGE.md**](COS-STORAGE.md) | **腾讯云 COS 对象存储 — 部署与对接文档**（V0.1.149 引入；混合模式 server putObject + 本地 fallback；CAM 最小权限 + CDN + 控制台 7 步清单） | ✅ **V0.1.149 新增** |

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
