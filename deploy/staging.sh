#!/bin/bash
# ============================================================
# staging 部署脚本（ECS 上执行）
# ============================================================
# 流程：
#   1. 拉新镜像
#   2. prisma migrate deploy
#   3. 重启容器（blue-green 简单版：down + up）
#   4. 健康检查
#
# 环境变量（从 GH Actions 传入）：
#   IMAGE_TAG      - 镜像 tag（如 staging-abc1234）
#   CONTAINER_IMAGE - 完整镜像 URL（如 registry.cn-hangzhou.aliyuncs.com/qm-wx/qm-wx-server:tag）
#   STAGING_DOMAIN - 外部域名（仅展示用）
# ============================================================

set -eo pipefail

# ===== 颜色辅助 =====
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ===== 校验入参 =====
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${CONTAINER_IMAGE:?CONTAINER_IMAGE is required}"

CONTAINER_NAME="qm-wx-server"
APP_DIR="/opt/qm-wx"
ENV_FILE="${APP_DIR}/.env.staging"

cd "$APP_DIR"

# ===== 0. 回滚准备：记下当前镜像 =====
PREV_IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || echo "")
log "当前容器镜像：${PREV_IMAGE:-<none>}"
log "目标镜像：${CONTAINER_IMAGE}"

# ===== 1. 登录 ACR（如果配了 docker login）=====
if [ -n "${ACR_USERNAME:-}" ] && [ -n "${ACR_PASSWORD:-}" ]; then
  log "登录 ACR..."
  REGISTRY_HOST="${CONTAINER_IMAGE%%/*}"
  echo "$ACR_PASSWORD" | docker login "$REGISTRY_HOST" -u "$ACR_USERNAME" --password-stdin
fi

# ===== 2. 拉新镜像 =====
log "拉取镜像：${CONTAINER_IMAGE}"
docker pull "$CONTAINER_IMAGE"

# ===== 3. prisma migrate deploy =====
log "跑 prisma migrate deploy..."
# 在新容器里跑（不污染当前）
docker run --rm \
  --env-file "$ENV_FILE" \
  "$CONTAINER_IMAGE" \
  npx prisma migrate deploy

# ===== 4. 重启容器 =====
log "停旧容器..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

log "起新容器..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p 3000:3000 \
  -v /opt/qm-wx/uploads:/app/uploads \
  "$CONTAINER_IMAGE"

# ===== 5. 健康检查（本地）=====
log "等容器就绪..."
ATTEMPTS=0
MAX_ATTEMPTS=12
while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 5
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    log "✅ 健康检查通过（attempt $ATTEMPTS）"
    log "🎉 部署完成：${IMAGE_TAG}"
    exit 0
  fi
  warn "attempt $ATTEMPTS: 未就绪"
done

# ===== 6. 失败回滚 =====
err "❌ 健康检查失败，回滚到 ${PREV_IMAGE:-<无>}"
if [ -n "$PREV_IMAGE" ]; then
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -p 3000:3000 \
    -v /opt/qm-wx/uploads:/app/uploads \
    "$PREV_IMAGE"
  warn "已回滚到：$PREV_IMAGE"
fi
exit 1
