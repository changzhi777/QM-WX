# 微信开发者工具 CLI 集成指南 — V0.2.10

> 📍 文档：V0.2.10 新增；与 `apps/server/CLAUDE.md` / `apps/miniprogram/CLAUDE.md` / 根 CLAUDE.md 三方同步。

---

## 🎯 设计目标

把微信开发者工具的 **`cli` 二进制**封装成可 npm 脚本化 + 可裸调 + 可 CI 自动化的统一入口，让开发/CI 都能 `pnpm wx:auto-preview` `pnpm wx:upload --version V0.2.10` 等方式直接操作 IDE，**完全避开 UI**。

- **透明 spawn**：所有 stdout/stderr 默认 pipe 到父进程，实时看 cli 进度
- **跨平台**：macOS / Win / Linux 路径自动探测，缺失时抛 `BinNotFoundError` 含所有尝试路径
- **双模式**：可 `pnpm wx:<cmd>` 转发，也可用 `./bin/wx <cmd>` 裸调
- **不动 miniprogram-automator**（V0.1.43 已用，与 CLI 并存）

---

## 📦 文件结构

```
bin/wx                                # shebang CJS 入口：exec tsx 调 TS 源
scripts/dev-cli/
├── package.json                      # "type": "module" 子包声明
├── platform.ts                       # 平台探针：process.platform → CLI 路径映射 + existsSync 探测 + BinNotFoundError
├── paths.ts                          # 默认值：DEFAULT_PORT 9421 / DEFAULT_PROJECT_ROOT
├── cli-helper.ts                     # CliHelper class：open/login/islogin/auto/preview/autoPreview/upload/buildNpm/close/quit/cache/engine
├── index.ts                          # commander 入口：12 子命令 + 错误处理
└── __tests__/
    ├── platform.test.ts              # 6 用例（路径探针 3 平台 + BinNotFoundError）
    └── cli-helper.test.ts            # 5 用例（mock spawn 验证 4 命令参数 + CliError）
docs/CLI-INTEGRATION.md               # 本文件
package.json (root)                   # +bin.wx + 12 npm scripts 转发
```

---

## 🔧 命令清单

| npm scripts  | 实际调  | 功能 |
| --- | --- | --- |
| `pnpm wx:status` | `wx status` | 健康检查：CLI 是否安装 + IDE 是否登录 |
| `pnpm wx:open` | `wx open --project ... --port 9421` | 打开 IDE + 打开项目 |
| `pnpm wx:login` | `wx login` | 扫码登录 |
| `pnpm wx:islogin` | `wx islogin` | 是否已登录（exit 0 = 是） |
| `pnpm wx:auto` | `wx auto --port 9421` | 启动 IDE HTTP 自动化模式（port hook） |
| `pnpm wx:preview` | `wx preview` | 普通预览（生成二维码扫码） |
| `pnpm wx:auto-preview` | `wx auto-preview` | 自动预览（拉起模拟器） — **最常用** |
| `pnpm wx:upload` | `wx upload --version X --desc ...` | 上传代码（必填 version + desc） |
| `pnpm wx:build-npm` | `wx build-npm` | 构建 npm（V0.1.150 mp-shared 注入流程） |
| `pnpm wx:close` | `wx close` | 关闭项目窗口 |
| `pnpm wx:quit` | `wx quit` | 完全退出 IDE |

> 全部 `--port` 默认 `9421`、全部 `--project` 默认 `./apps/miniprogram/miniprogram`，可通过命令行覆盖。

---

## 🌍 跨平台路径映射

| 平台 | 候选路径（按顺序） |
| --- | --- |
| **macOS** (darwin) | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`<br>`/Applications/微信开发者工具.app/Contents/MacOS/cli`<br>`/Applications/WeChat Developer Tools.app/Contents/MacOS/cli` |
| **Windows** (win32) | `C:\Program Files\Tencent\微信开发者工具\cli.exe`<br>`C:\Program Files (x86)\Tencent\微信开发者工具\cli.exe` |
| **Linux** (linux) | `/opt/wechat-devtools/cli`<br>`/snap/bin/wechat-devtools` |
| 其他 | 不支持（抛 `BinNotFoundError`） |

> **缺失时**：`BinNotFoundError` 含完整已尝试路径，方便排查装包位置。

---

## 📋 用法示例

### 本地开发

```bash
# 健康检查
pnpm wx:status

# 自动预览（拉起模拟器，最常用）
pnpm wx:auto-preview

# 自定义端口
./bin/wx auto --port 9422

# 用 npm scripts 直接覆盖默认项目
./bin/wx upload --version V0.2.10 --desc "测试上传" -p /path/to/project
```

### CI 自动化（V0.2.11 落地）

完整 workflow 已落在：**`.github/workflows/wx-deploy.yml`**（3 job 矩阵）

| Job | Runner | 触发条件 | 内容 | 设计理由 |
|---|---|---|---|---|
| **lint-typecheck** | **Ubuntu** | tag push `v0.*` 或手动 dispatch | `pnpm lint` + `pnpm typecheck` + `pnpm test` | Ubuntu 分钟便宜，先快速反馈 lint/typecheck 错，节省 macOS 分钟 |
| **wx-build** | **macOS** | `lint-typecheck` 通过 | `pnpm build:mp-shared` + `pnpm wx:build-npm`（无 IDE 时降级跳过）+ upload-artifact | macOS 是 IDE 唯一可跑平台，主任务 build-npm 验证 mp-shared 注入完整链路 |
| **wx-status** | **macOS** | `lint-typecheck` 通过 | `./bin/wx --help` + `wx status` 健康检查 | 验证 bin 入口 + commander 子命令 + IDE 可达性 |

**触发器**：`push.tags: ['v0.*']` 或手动 `workflow_dispatch`（节省 CI 分钟 — 不跑每次 push）
**并发控制**：`concurrency: wx-deploy-${{ github.ref }}` 自动 cancel in-progress（同 tag 重复推不重复跑）
**Artifacts**：wx-build 成功后上传 `miniprogram-build` archive，保留 7 天供后续 upload/preview job 消费

**为什么仅 build-npm 不调 upload**：
1. **扫码登录 CI 难题**：upload 需要 IDE 扫码登录，CI 自动跑不通（除非 Service Account + project.private.config 配齐，V0.2.11 YAGNI）
2. **节省 macOS 分钟**：每次 macOS 跑 ~10-15 分钟，仅 build-npm 控制在 ~10 分钟内
3. **macOS CI 排队**：「maven macOS runners 公池」有 10-20 分钟排队，按需用

**没用 macOS runner 时的 fallback**：
```bash
if [ -d "/Applications/wechatwebdevtools.app" ]; then
  pnpm wx:build-npm   # wx GUI 走 IDE
else
  exit 0               # macOS runner 默认无 GUI，跳过不报错
fi
```

**触发该 workflow 的方式**：
```bash
# 1. tag 自动触发（推荐）
git tag v0.2.11 && git push origin v0.2.11
# → GitHub Actions 自动跑 wx-deploy.yml

# 2. GitHub UI 手动 dispatch（Actions 标签页 → wx-deploy → Run workflow）

# 3. GitHub CLI
gh workflow run wx-deploy.yml
```

### 在 .husky 脚本里集成（pre-commit）

```bash
#!/usr/bin/env bash
# 提交前自动 build mp-shared + build-npm
pnpm build:mp-shared && pnpm wx:build-npm
```

---

## ⚠️ 关键范式与坑

### 1. 用 tsx 而不是 Node native strip-types
Node 25 `--experimental-strip-types` 在 ESM strict 模式下不解析 `import './x.js'` → `.ts`，会报 `ERR_MODULE_NOT_FOUND`。**改用 tsx 包**（devDep ~3MB）：
- ESM/CJS 自动检测
- .js → .ts 自动解析
- 跨 Node 18+/22+/25 一致

### 2. spawn 子进程 + 不挂父进程 stdio
`child.stdout/stderr.pipe` 串行 buffer 完整 stderr 用于 CliError 抛出（截断 1000 字符防爆栈），同时 `stdio: ['inherit', 'inherit', 'pipe']` 让用户实时看到 cli 输出。

### 3. CliError 双错误源
- **BinNotFoundError**（exit 2）：CLI 未安装，路径表全 false → 用户下载装包
- **CliError**（exit = cli exit code）：CLI 已装但调用失败（如 401 未登录）→ 用户扫码

### 4. `islogin` 不抛错
虽然 `exit=1`（未登录）是有效状态，方法故意不 throw，留给上层 `islogin` / `status` 子命令决定退出码。这是「区分 fatal error vs non-login state」的设计。

### 5. 并存 miniprogram-automator
- CLI：IDE 操作 / 自动化模式 / 上传 / build-npm
- miniprogram-automator：截图 / UI 断言 / 模拟器交互

两者**职责不重叠**，无需合并或替换。

---

## 🧪 测试

```bash
# 跑单测（mock child_process.spawn）
pnpm exec vitest run scripts/dev-cli/
# → 11 用例 pass
```

测试覆盖：
- 3 平台路径命中（darwin 第 1 + 第 2 候选 fallback）
- BinNotFoundError 抛错 + 字段
- isCliAvailable boolean
- listCandidates 路径列表
- CliHelper.upload/buildNpm/autoPreview 参数拼装
- CliError 抛错含 args + exitCode + stderr

---

## 🔗 相关文件 / 上游任务

- 引用：`pnpm build:mp-shared`（scripts/build-mp-shared.mjs）— build-npm 之后的真注入
- 引用：`miniprogram-automator@^0.12.1`（并存）— 截图 / 调试
- 关联：`apps/admin` 仓库（独立 `qm-admin`）— 也用 `wx` 命令做 admin 端预览（V0.1.131 起由 init-architect 在 deploy 时跑）

---

## 📝 变更记录

- **2026-07-16** — V0.2.10 创建：跨平台 CLI 打通 + 12 子命令 + 11 单测 + 文档同步
- **2026-07-16** — V0.2.11 CI 集成：`wx-deploy.yml` 3-job 矩阵（Ubuntu lint-typecheck + macOS wx-build + macOS wx-status）；tag `v0.*` push 自动触发，concurrency cancel-in-progress 节省 CI 分钟；artifacts 上传 miniprogram-build 7 天；YAGNI upload（扫码登录 CI 难题）
