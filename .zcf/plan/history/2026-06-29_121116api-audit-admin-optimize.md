# api-audit-admin-optimize — API 审查报告 + 后端 admin 优化

> 状态：执行中 | 日期：2026-06-29 | 方案：1（审查驱动·两波）

## 背景
聚焦「全 API 审查 + 后端 admin 优化」。qm-admin 前端（跨 repo）+ 部署就绪 + 真生产/联调列为后续（外部依赖）。

## 波① 审查报告 docs/API-AUDIT.md
1. 遍历 14 module routes+schema，提取 action/鉴权/校验/公开度（看代码非注释）
2. 六维评审：覆盖/鉴权/校验/错误/一致性/缺口
3. 输出 P0/P1/P2 问题 + 优化建议

## 波② 后端 admin 优化
4. 抽 admin.service.ts（isAdmin+缓存 + 7 action 方法）
5. admin.routes.ts 瘦身为分发层（276→~110 行）
6. 补 action：listUsers / listContents / listProducts / stats
7. 补测试：admin.service.test.ts + 扩 admin.routes.test.ts
8. 验证：pnpm test 全绿 + typecheck + 更新 CLAUDE.md

## 约束
- admin 非公开，不进 OpenAPI spec
- qm-admin 前端本次不动（跨 repo）
- 现有 admin.routes.test.ts 不可回归

## 验收
- API-AUDIT.md（14 module 全覆盖 + P0/P1/P2）
- admin.service.ts 抽出，routes ≤120 行
- 4 新 action + 单测，全绿
