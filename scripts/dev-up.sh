#!/usr/bin/env bash
# scripts/dev-up.sh — 本地一键起开发后端（Postgres + Redis + Fastify 热重载）
#
# 用法（在仓库任意目录）：
#   bash scripts/dev-up.sh
#
# 行为：
#   1) 探测可用的 compose 命令（docker compose / docker-compose）
#   2) 起 postgres + redis（后台）
#   3) 等 Postgres 就绪
#   4) Prisma generate + migrate（首次自动建库建表）+ seed
#   5) 前台启动后端 http://localhost:3000（Ctrl+C 停后端；容器仍后台运行）
#
# 停掉数据库容器：$DC down       （保留数据）
#                $DC down -v    （连数据一起删）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- 0. Docker 守护进程在跑吗 ---
if ! docker info >/dev/null 2>&1; then
  echo "✖ Docker 未运行。请先打开 Docker Desktop（状态栏鲸鱼图标常亮）再重试。"
  exit 1
fi

# --- 0b. 探测 compose 命令：v2 插件(docker compose) 优先，回退 v1(docker-compose) ---
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "✖ 没找到 Docker Compose。"
  echo "  在 Docker Desktop 设置里启用 Compose，或确认 'docker-compose version' 可用后重试。"
  exit 1
fi
echo "▶ 使用 compose 命令：$DC"

echo "▶ [1/5] 启动 Postgres + Redis…"
# 清理可能残留的同名容器（数据在命名卷 pg_data/redis_data 里，删容器不丢数据）
docker rm -f qmwx-pg qmwx-redis qmwx-server >/dev/null 2>&1 || true
$DC up -d --remove-orphans postgres redis

echo "▶ [2/5] 等待 Postgres 就绪…"
for i in $(seq 1 30); do
  if $DC exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "   ✓ Postgres ready"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then echo "✖ Postgres 启动超时"; exit 1; fi
done

cd apps/server
if [ ! -f .env ]; then
  echo "✖ apps/server/.env 不存在。先 cp ../../env.example .env 并按需填写"; exit 1
fi

echo "▶ [3/5] Prisma generate + migrate（首次自动建库 + 建表）…"
pnpm prisma:generate
pnpm prisma:migrate

echo "▶ [4/5] Seed 初始化 app_config（feature_flags / member_levels / points_rules）…"
pnpm prisma:seed

# fastify-static 需要 uploads 目录存在（否则启动告警）
mkdir -p uploads

# 释放 3000 端口：杀掉占用的旧后端进程（多为上次未关的 pnpm dev / tsx watch）
if lsof -ti tcp:3000 >/dev/null 2>&1; then
  echo "▶ 端口 3000 被占用，释放中（关闭上次残留的后端）…"
  lsof -ti tcp:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

BYPASS="$(grep -E '^DEV_LOGIN_BYPASS=' .env 2>/dev/null | cut -d= -f2 || true)"
echo "▶ [5/5] 启动后端 → http://localhost:3000   (Ctrl+C 停止)"
echo "   健康检查：另开终端 curl http://localhost:3000/health"
echo "   DEV_LOGIN_BYPASS=${BYPASS:-未设置}（=1 时免真实微信号即可登录调试）"
echo "──────────────────────────────────────────────"
pnpm dev
