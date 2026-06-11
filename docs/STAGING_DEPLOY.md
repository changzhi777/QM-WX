# Staging 部署指南

> 📍 QM-WX · ECS + ACR · 手动 + 自动触发

## 整体架构

```
GitHub (main)
    ↓ push / workflow_dispatch
ci.yml (lint+test+build+docker-image)
    ↓ 镜像推到 ACR
deploy-staging.yml
    ↓ SSH
ECS (qm-wx-server container)
```

## 一次性准备

### 1. ECS 实例

- 推荐：阿里云 ECS · 2 核 4G · 40G SSD
- 镜像：Ubuntu 22.04 LTS
- 安全组：开放 22（SSH）+ 3000（后端 HTTP）+ 80/443（Nginx 反代）
- 系统：root 登录后建 `deploy` 用户

```bash
# 在 ECS 上
adduser deploy
mkdir -p /home/deploy/.ssh
# 把 GitHub Actions 公钥粘到 authorized_keys
echo "ssh-ed25519 AAAA... github-actions-deploy" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 装 Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

### 2. 阿里云 ACR

- 控制台：容器镜像服务 → 个人版
- 创建命名空间 `qm-wx`
- 创建镜像仓库 `qm-wx-server`
- 记录：
  - `ACR_REGISTRY`：`registry.cn-hangzhou.aliyuncs.com`（按 region）
  - `ACR_USERNAME`：阿里云账号
  - `ACR_PASSWORD`：独立密码（在 ACR 控制台设）

### 3. PG + Redis（如果不在 ECS 本地）

- 阿里云 RDS PostgreSQL 16（推荐）
- 阿里云 Redis 7
- 记下：
  - `DATABASE_URL`
  - `REDIS_URL`

### 4. ECS 上的 .env

```bash
# 在 ECS /opt/qm-wx/.env.staging
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGINS=https://staging.example.com

DATABASE_URL=postgresql://user:pass@rm-xxxx.rds.aliyuncs.com:5432/qmwx_staging
REDIS_URL=redis://r-xxxx.redis.rds.aliyuncs.com:6379

JWT_SECRET=<32-字符随机>
JWT_ACCESS_TTL=2h
JWT_REFRESH_TTL=30d

WX_APPID=wx426885831a05f18e
WX_SECRET=...
```

### 5. GitHub Secrets

仓库 Settings → Secrets and variables → Actions：

| Secret | 说明 |
|---|---|
| `ACR_REGISTRY` | `registry.cn-hangzhou.aliyuncs.com` |
| `ACR_USERNAME` | 阿里云账号 |
| `ACR_PASSWORD` | ACR 独立密码 |
| `STAGING_HOST` | ECS 公网 IP |
| `STAGING_USER` | `deploy` |
| `STAGING_SSH_KEY` | `cat ~/.ssh/id_ed25519` 私钥 |
| `STAGING_URL` | `https://staging.example.com`（健康检查） |
| `WX_APPID` / `WX_SECRET` | 真实环境微信凭据 |

## 部署流程

### 手动触发

1. GitHub → Actions → Deploy Staging
2. Run workflow → 选 `staging` 分支
3. 等 5-10 分钟（lint+test+build+push+deploy+health）

### 自动触发

- push 到 main 分支
- GitHub Actions 自动跑 `Deploy Staging`

### 首次部署

```bash
# 在 ECS 上手动起
ssh deploy@staging.example.com
cd /opt/qm-wx
git clone <repo-url> .
mkdir -p uploads
cp .env.example .env.staging
# 编辑填真实 secret

# 拉镜像 + 起容器
docker pull registry.cn-hangzhou.aliyuncs.com/qm-wx/qm-wx-server:staging
docker run -d --name qm-wx-server \
  --restart unless-stopped \
  --env-file .env.staging \
  -p 3000:3000 \
  -v /opt/qm-wx/uploads:/app/uploads \
  registry.cn-hangzhou.aliyuncs.com/qm-wx/qm-wx-server:staging

# 跑 migrate
docker exec qm-wx-server npx prisma migrate deploy

# 健康检查
curl http://localhost:3000/health
```

## 监控

### 日志

```bash
# ECS 上
docker logs -f qm-wx-server
# 或
ssh deploy@staging.example.com 'docker logs --tail 100 -f qm-wx-server'
```

### 反向代理（Nginx）

```nginx
# /etc/nginx/sites-available/qm-wx
server {
  listen 443 ssl http2;
  server_name staging.example.com;

  ssl_certificate /etc/letsencrypt/live/staging.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/staging.example.com/privkey.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Sentry（待接入）

```bash
# apps/server/src/server.ts 加 Sentry.init
# pnpm add @sentry/node
```

## 回滚

### 手动回滚

```bash
# 在 ECS 上
ssh deploy@staging.example.com
docker images | grep qm-wx-server  # 找上一个 tag
docker stop qm-wx-server
docker rm qm-wx-server
docker run -d --name qm-wx-server \
  --restart unless-stopped \
  --env-file .env.staging \
  -p 3000:3000 \
  -v /opt/qm-wx/uploads:/app/uploads \
  registry.cn-hangzhou.aliyuncs.com/qm-wx/qm-wx-server:staging-<上一个 sha>
```

### 自动回滚

`deploy/staging.sh` 已有：健康检查失败时自动回滚到上一个 tag。

## 故障排查

### 镜像拉取失败

```bash
# 在 ECS 上手动登
docker login registry.cn-hangzhou.aliyuncs.com
# 检查 ACR 仓库是否存在、网络通
```

### 容器起不来

```bash
docker logs qm-wx-server --tail 200
# 常见：env 文件路径错、prisma 引擎缺失、端口占用
```

### 健康检查超时

```bash
# 容器起来了但 /health 返 500
docker exec qm-wx-server curl localhost:3000/health
# 看应用层错误
docker logs qm-wx-server | grep -i error
```

### prisma migrate 失败

```bash
# 在 ECS 上
docker exec qm-wx-server npx prisma migrate status
# 如果有 failed migration
docker exec qm-wx-server npx prisma migrate resolve --applied <migration-name>
# 或 --rolled-back
```

## 改进路线

- [ ] 接入 Sentry（错误监控）
- [ ] 接入阿里云日志服务（SLS）
- [ ] 蓝绿部署（避免停机）
- [ ] 自动回滚到上一个稳定 tag
- [ ] staging / production 环境隔离
