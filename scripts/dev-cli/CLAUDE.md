[根目录](../../CLAUDE.md) > [scripts](../) > **dev-cli**

# scripts/dev-cli — 微信开发者工具 CLI 包装层

## 模块职责

为微信开发者工具原生 `cli` 提供跨平台 TypeScript 包装，统一支持本地 npm scripts、`bin/wx` 裸命令和 CI 健康检查。该模块只负责 IDE/CLI 调度，不替代 `miniprogram-automator` 的页面截图与交互自动化。

## 入口与启动

- 命令入口：`index.ts`
- 裸命令入口：`../../bin/wx`，通过 `pnpm exec tsx` 运行 `index.ts`
- 默认端口：`9421`
- 默认项目：`apps/miniprogram`（project.config.json 所在；V0.2.24 修正，V0.2.10 误用 apps/miniprogram/miniprogram）

常用命令：

```bash
pnpm wx:status
pnpm wx:auto-preview
pnpm wx:build-npm
./bin/wx upload --version V0.2.11 --desc "版本说明"
```

## 对外接口

`CliHelper` 提供以下公开方法：

- `open`
- `login`
- `islogin`
- `auto`
- `preview`
- `autoPreview`
- `upload`
- `buildNpm`
- `close`
- `quit`
- `cache`
- `engine`

错误类型：

- `BinNotFoundError`：当前平台找不到微信开发者工具 CLI。
- `CliError`：CLI 已启动，但子进程返回非零退出码。

## 关键依赖与配置

- `commander`：命令和参数解析。
- `tsx`：跨 Node 版本执行 TypeScript/ESM。
- `vitest`：平台探针和 spawn 参数单测。
- `platform.ts`：macOS、Windows、Linux CLI 路径候选与探测。
- `paths.ts`：默认端口、项目路径和帮助文本的单一数据源。
- `.github/workflows/wx-deploy.yml`：V0.2.11 三任务 CI 示例。

当前接线注意：`pnpm-workspace.yaml` 仅包含 `apps/*` 和 `packages/*`，未包含 `scripts/*`。因此根命令 `pnpm test`/`pnpm -r test` 当前不会自动执行本模块 11 个测试；必须显式运行下方命令，或后续把该包接入 workspace/CI。

## 数据模型

无数据库模型、无 Prisma 迁移、无运行时持久化。

## 测试与质量

```bash
pnpm exec vitest run scripts/dev-cli/
```

静态盘点共 11 个 `it()`：

- `__tests__/platform.test.ts`：6 个，覆盖 macOS 候选路径、fallback、缺失错误和可用性探测。
- `__tests__/cli-helper.test.ts`：5 个，覆盖 upload、buildNpm、autoPreview、CliError 和 islogin 非零退出码。

测试通过 mock `node:fs.existsSync` 与 `node:child_process.spawn`，不会启动真实 IDE。

## 常见问题 (FAQ)

### 为什么不用 Node 原生 strip-types？

Node 不同版本对 TypeScript ESM 和 `.js` 到 `.ts` 解析行为存在差异；项目统一用 `tsx`，减少 Node 18/22/25 漂移。

### 为什么 `islogin` 非零退出码不抛异常？

未登录属于状态，不是进程级故障。方法返回 `ExecResult`，由 `status`/`islogin` 命令决定展示和退出码。

### 为什么 CI 不直接 upload？

upload 依赖微信开发者工具登录态和扫码授权。V0.2.11 只做 build-npm/status 探测，避免在公共 runner 中伪造可用性。

### 为什么 `pnpm test` 看起来通过，但 11 个 CLI 测试未必执行？

该包目前不在 `pnpm-workspace.yaml` 的 packages 范围内。以 `pnpm exec vitest run scripts/dev-cli/` 为本模块权威测试命令；CI 接线修复前，不得把根测试绿灯等同于 CLI 测试绿灯。

## 相关文件清单

- `package.json`：独立包元数据和本模块测试命令。
- `index.ts`：commander 命令入口。
- `cli-helper.ts`：spawn 包装、超时和错误模型。
- `platform.ts`：平台路径探针。
- `paths.ts`：默认配置。
- `__tests__/platform.test.ts`：平台探针测试。
- `__tests__/cli-helper.test.ts`：命令包装测试。
- `../../bin/wx`：裸命令入口。
- `../../docs/CLI-INTEGRATION.md`：完整使用与 CI 指南。
- `../../.github/workflows/wx-deploy.yml`：V0.2.11 CI workflow。

## 变更记录 (Changelog)

- **2026-07-16T21:48:38+08:00** — init #14 新建模块上下文；实测确认 4 个 TypeScript 实现文件、2 个测试文件、11 个 `it()`；记录 `scripts/*` 未纳入 pnpm workspace，根 `pnpm test` 不会自动执行 CLI 测试的接线缺口。
- **V0.2.11** — 新增 `wx-deploy.yml`：Ubuntu lint/typecheck/test + macOS wx-build + macOS wx-status。
- **V0.2.10** — 新增跨平台 CLI 包装、`bin/wx`、根 npm scripts 和 11 个单测。
