# 小程序前端对接公网域名（qingmulife.cn）

> 创建于 2026-06-29 15:13（`/zcf:workflow` 阶段 4-执行 前置）
> 关联：[deploy-prod-qingmulife.md](../../memory/deploy-prod-qingmulife.md) / [mp-shared-runtime-build.md](../../memory/mp-shared-runtime-build.md)

---

## 🎯 目标

让 `apps/miniprogram`（微信小程序）在 release/trial 版时，把 API 请求打向公网 `https://qingmulife.cn`（企业官网共用域名），并跑通**登录全链路**。

## 📊 现状 vs 目标

| 项 | 现状 | 目标 |
|---|---|---|
| `API_BASE.prod` | `https://api.qingmu.example`（占位） | `https://qingmulife.cn`（共用官网） |
| `CORS_ORIGINS`（云） | 空字符串 | `https://qingmulife.cn,http://localhost:3000,http://localhost:5173` |
| `WX_SECRET`（云） | 占位 | 用户提供的真值 |
| 后端镜像 | 不动 | 不动（`API_BASE` 后端不用，grep 0 命中） |
| 微信后台 `request 合法域名` | 未配 | **本次不管**（dev 体验版先跑通） |

## 🛠️ 6 个原子步骤

### 步骤 1️⃣ — 改 shared `API_BASE.prod`

**文件**：`packages/shared/src/api-contracts/endpoints.ts:13`
**改动**：1 行
```diff
- prod: 'https://api.qingmu.example',
+ prod: 'https://qingmulife.cn',
```

### 步骤 2️⃣ — 加测试断言

**文件**：`packages/shared/src/api-contracts/endpoints.test.ts`
**新增**：5 行
```ts
it('API_BASE.prod 指向已备案公网域名（生产微信合法域名）', () => {
  expect(API_BASE.prod).toBe('https://qingmulife.cn');
});
```

### 步骤 3️⃣ — 改 `.env.example` 注释

**文件**：`apps/server/.env.example`
**改动**：注释 + 示例值

```diff
- # CORS_ORIGINS=
+ # CORS_ORIGINS=https://qingmulife.cn,http://localhost:3000,http://localhost:5173
+ # 微信小程序 wx.request 不走 CORS（仅浏览器/qm-admin 走）
+ # 生产必须含 https://qingmulife.cn；dev 可只含 localhost
+ CORS_ORIGINS=
```

### 步骤 4️⃣ — **本地** 重建小程序 shared 运行时产物

**命令**：
```bash
pnpm build:mp-shared
```

**为什么**：小程序运行时读 `apps/miniprogram/miniprogram/miniprogram_npm/@qm-wx/shared/` 的 CJS 产物（gitignore），改 src 后必须重新编译注入。typecheck 走 tsconfig paths 直读 src（无需重建）。

**预期产物**：`apps/miniprogram/miniprogram/miniprogram_npm/@qm-wx/shared/api-contracts/endpoints.js` 内含新 prod URL。

### 步骤 5️⃣ — **云服务器手贴** `/opt/qm-wx/.env`

**操作**：
```bash
ssh <user>@106.53.168.73
vim /opt/qm-wx/.env
# 把 WX_SECRET 占位换成真值（用户从 mp.weixin.qq.com → 开发管理 → 开发设置拿）
# 把 CORS_ORIGINS 改成 https://qingmulife.cn,http://localhost:3000,http://localhost:5173
```

### 步骤 6️⃣ — **云服务器** force-recreate server

**命令**：
```bash
cd /opt/qm-wx
docker compose -f docker-compose.prod.yml up -d --force-recreate server
docker logs -f qmwx-server | head -30
```

**⚠️ 注意**（来自 deploy memory 坑 9）：`docker compose restart` 不重读 `.env`，**必须** `--force-recreate`。

### 步骤 7️⃣ — 真机/体验版验证

**前置**：打开微信开发者工具 → 导入 `apps/miniprogram/` → 工具栏勾选"不校验合法域名"（因为还没去 mp.weixin.qq.com 配）。

**操作**：
1. 选"体验版"扫码
2. 看 `app.onLaunch` 静默登录（POST `/api/user` action=login）
3. 控制台 + 云端日志看是否 200

**云端健康检查**：
```bash
curl -i https://qingmulife.cn/health        # 期望 200 {status:ok,env:production,...}
curl -i https://qingmulife.cn/api/user      # 期望 200 (POST login) 或 401 (无 token)
```

## ✅ 验收 checklist

- [ ] `API_BASE.prod === 'https://qingmulife.cn'`
- [ ] shared `pnpm test` 6/6 通过
- [ ] `pnpm build:mp-shared` 生成新 miniprogram_npm 产物
- [ ] `apps/server/.env.example` 注释完整
- [ ] 云 `.env` WX_SECRET 真值 + CORS_ORIGINS 已贴
- [ ] 服务器 force-recreate 无 env 报错
- [ ] `https://qingmulife.cn/health` 返回 200
- [ ] `https://qingmulife.cn/api/user` 反代通
- [ ] 体验版静默登录走通（看云端日志）
- [ ] 1 个业务请求（如 sport.myStats）200

## 🚫 不碰的边界

- ❌ 后端代码（无 schema / service / route 改）
- ❌ CORS 中间件 `app.ts:65-66`
- ❌ CI / GitHub Actions
- ❌ 微信小程序后台 `request 合法域名`（后续 Phase 4.2 切真生产再做）
- ❌ nginx 配置（已就位）
- ❌ Dockerfile / docker-compose（已就位）
- ❌ 重打 server 镜像（API_BASE 不被后端使用，grep 0 命中）

## ⚠️ 风险

| 风险 | 缓解 |
|---|---|
| WX_SECRET 没换真值 → 登录失败 | 步骤 5 强制要真值，否则停 |
| `docker compose restart` 不重读 env | 用 `--force-recreate` |
| 体验版报 `url not in domain list` | 工具栏勾选"不校验合法域名" |
| 小程序运行时是旧 shared 产物 | 步骤 4 强制重 build |

## 📦 交付物

- 1 行 src + 5 行 test + 4 行 .env.example 注释
- 1 次 `pnpm build:mp-shared`
- 1 次云 .env 改 + 1 次 force-recreate
- 1 次体验版扫码验证
- 1 份会话快照更新（memory）

## 🏷️ 关联

- upstream: [[deploy-prod-qingmulife]]（云部署 + 9 坑）
- upstream: [[mp-shared-runtime-build]]（小程序 shared 运行时构建）
- next: 微信后台配 `request 合法域名`（Phase 4.2）
- next: P0 user 鉴权 bug 修（API-AUDIT GAP-1，非本次）

🤙 最小动线 + 跑通登录 = 验收。