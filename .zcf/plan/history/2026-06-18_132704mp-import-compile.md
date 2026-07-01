# mp-import-compile — 小程序导入微信开发者工具编译就绪

> 状态：执行中 | 日期：2026-06-18 | 方案：1（预构建 CJS → miniprogram_npm）

## 背景
小程序 `@qm-wx/shared` bare import 运行时无法解析（微信不支持 node_modules bare import + shared 是 ESM + pnpm 软链三角难题）；`project.config.json` 缺 `miniprogramRoot`。导入开发者工具后**编译必失败**。

## 方案
tsc 以 commonjs 编译 shared 源码 → 模拟微信"构建 npm"产物 `miniprogram_npm/@qm-wx/shared/`，bare import 0 改动。

## 步骤
1. `project.config.json` 加 `miniprogramRoot: "miniprogram/"`
2. 新建 `scripts/build-mp-shared.mjs`：tsc commonjs 编译 shared → miniprogram_npm + package.json(exports 双子路径) + api-contracts/index.js 兜底
3. ~~`apps/miniprogram/miniprogram/.gitignore`~~ — **取消**：根 .gitignore line 46 已忽略 `miniprogram_npm/`（无前导斜杠匹配任意层级）
4. 根 `package.json` 加 `build:mp-shared` script
5. 跑脚本 + 验证产物 + typecheck
6. 交付导入调试指引

## 验收
- miniprogram_npm/@qm-wx/shared/ 就位，`require('@qm-wx/shared')` 与 `./api-contracts` 子路径均可解析
- `pnpm --dir apps/miniprogram typecheck` 全绿
- 开发者工具可导入编译预览
