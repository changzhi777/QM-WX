# CI/CD 接入指南

> 📍 QM-WX monorepo · GitHub Actions

## 当前状态

✅ **CI 已在 `.github/workflows/ci.yml` 落地**

包含 3 个 jobs：
1. `lint-typecheck-test` — lint + typecheck + test（含 e2e）
2. `build-server` — shared build + server build + 产物上传
3. `docker-image` — main 分支额外做 Docker image 构建验证

## 触发条件

- push 到 `main` / `develop`
- PR 提向 `main` / `develop`

## 服务依赖

CI 起两个 service 容器：
- **PostgreSQL 16** （端口 5432，DB=`qmwx_test`）
- **Redis 7** （端口 6379）

## 必装 GitHub Secrets

| Secret | 用途 | 何时必须 |
|---|---|---|
| `WX_APPID` | 微信小程序 AppID | 真实环境登录 |
| `WX_SECRET` | 微信小程序 Secret | 真实环境登录 |
| `WX_MCH_ID` | 微信商户号 | 钱包/支付 |
| `WX_PAY_KEY` | 支付密钥 | 钱包/支付 |
| `WX_NOTIFY_URL` | 支付回调 URL | 钱包/支付 |
| `JWT_SECRET` | JWT 签名密钥 | **生产必须** |
| `DOCKERHUB_USERNAME` | Docker Hub 账号 | 推镜像时 |
| `DOCKERHUB_TOKEN` | Docker Hub token | 推镜像时 |

> CI 中用占位 secret 跑测试通过；生产环境部署时再覆盖。

## 本地用 act 验证

```bash
# 安装 act（macOS）
brew install act

# 跑 CI 等价流程
act -j lint-typecheck-test
```

## 部署流程（待 Phase 4 接入）

### Staging（建议用阿里云/腾讯云 ECS）

```yaml
# 后续加 deploy-staging job
- name: SSH + deploy
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.STAGING_HOST }}
    username: deploy
    key: ${{ secrets.STAGING_SSH_KEY }}
    script: |
      cd /opt/qm-wx
      git pull
      pnpm --filter @qm-wx/server build
      pnpm --filter @qm-wx/server prisma migrate deploy
      pm2 restart qm-wx-server
```

### Production

需先确认：
- ✅ 域名 ICP 备案
- ✅ SSL 证书
- ✅ 微信商户号申请完成
- ✅ 监控/Sentry 接入

## 故障排查

### `prisma migrate deploy` 失败

CI 第一次跑会从 migration 0 开始 apply。如果 DB 已有 schema 但缺 `_prisma_migrations` 表，会冲突。

修法：手动连 DB 跑 `prisma migrate resolve` 或重置 DB。

### e2e 测试 5/5 跳过

`RUN_E2E=1` 没设。检查 `.github/workflows/ci.yml` 的 env 块。

### `pnpm install` 慢

`pnpm/action-setup` + `setup-node` 的 `cache: pnpm` 已在用。第一次 ~2min，之后 ~30s。

## 改进路线

- [ ] 加 `codeql-analysis.yml`（GitHub 自带安全扫描）
- [ ] 加 `release-please.yml`（自动发版 + CHANGELOG）
- [ ] staging deploy job（手动触发）
- [ ] docker push 到阿里云容器镜像服务（ACR）
