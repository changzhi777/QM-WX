# 部署代码审查 + 优化(v0.1.17)

**时间**:2026-06-29 14:22:40  
**模式**:安全加固 + CI/CD 一致性 + 可观测性  
**范围**:7 个文件改动,**零行为破坏**(纯补强)

## 上下文

QM-WX 已部署到腾讯云 qingmulife.cn(2026-06-29 完成 9 坑全解)。本段针对部署相关代码做一次审查,补 P0 隐患 + 标准化 + 加基础可观测性。

## 已识别问题(12 项)

### 🔴 P0(必修)
1. nginx-qmwx-api.conf 缺 `/health` 精确 location(P0 隐患 — 注释提了但未写)
2. nginx 反代 `/uploads/` 走 server,缺 `client_max_body_size` 防 413

### 🟠 P1
3. env.example 缺 `WX_REFUND_NOTIFY_URL`(CLAUDE.md 提到,env 漏)
4. WX_APPID 默认值硬编码真实值(`${WX_APPID:-wx426885831a05f18e}`)
5. smoke.sh 缺 wxpay/admin/wallet 模块覆盖
6. deploy-staging.yml 还调 `git pull`(legacy,镜像为唯一可信源)

### 🟡 P2
7. Dockerfile 无 HEALTHCHECK(docker compose 无自愈)
8. nginx conf 无 gzip
9. JWT_SECRET 占位太弱(改默认仅 dev)
10. 文档 CHANGELOG 缺 v0.1.17 段

## 执行步骤

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `deploy/nginx-qmwx-api.conf` | 加 `/health` 精确 location + `/uploads/` 直 serve + `client_max_body_size 20m` + `expires 30d` + gzip |
| 2 | `env.example` | 补 `WX_REFUND_NOTIFY_URL` + 移除 WX_APPID 默认值 + JWT_SECRET 警告 |
| 3 | `docker-compose.yml` | server 段 WX_APPID 改 `${WX_APPID:?}` 强制 |
| 4 | `apps/server/Dockerfile` | runner 加 HEALTHCHECK 段 |
| 5 | `scripts/smoke.sh` | 模块覆盖从 5 个扩到 7 个(去 app-config 因未注册) |
| 6 | `.github/workflows/deploy-staging.yml` | 移除 `git pull --ff-only 2>/dev/null \|\| true` |
| 7 | `CHANGELOG.md` | 加 v0.1.17 段 |

## 验收

- [ ] nginx conf `docker run --rm -v $(pwd)/deploy:/etc/nginx/conf.d:ro nginx:alpine nginx -t` 通过
- [ ] Dockerfile 构建:`docker build -t test -f apps/server/Dockerfile apps/server`
- [ ] yaml lint 通过(deploy-staging.yml)
- [ ] smoke.sh 模块列表修正(去 app-config)

## 不在本次范围(后续 PATCH)

- staging.sh 重写(走 compose 而非单容器)— 留给 v0.1.18
- Dockerfile `pnpm deploy` 精简镜像 — 留给 v0.1.18
- prod-deploy.sh 一键脚本 — 留给 v0.1.18
- monitor.sh 监控 — 留给 v0.1.19