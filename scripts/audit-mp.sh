#!/usr/bin/env bash
# =============================================================================
# scripts/audit-mp.sh — V0.2.66 小程序代码提审一键脚本
# =============================================================================
# 流程（按 V0.2.65-66 /commit f314235 实现）：
#   1. POST /api/admin {action:'getMpCategory'}     → 查 mp 服务类目列表
#   2. POST /api/admin {action:'uploadMpMedia'}     → 上传素材（截图 base64 → media_id）
#   3. POST /api/admin {action:'submitMpAudit'}     → 透传 item_list → auditId
#
# 鉴权：需要 SUPER_ADMIN token（admin.service line 72 SUPER_ONLY）
# 前置：
#   - 主人已在 mp 后台「设置 - 第三方设置 - 服务类目」添加目标类目（如 "工具-健康管理"）
#   - 主人已在 .env 配 WX_MP_APPID + WX_MP_SECRET
#   - infra/wx-token.ts getMpAccessToken 已配 Redis 缓存（7000s）
#
# 用法：
#   ./scripts/audit-mp.sh --base https://qingmulife.cn --token "<admin-jwt>" --version V0.2.141 --desc "init #20 V0.2.140 校准收官"
#   ./scripts/audit-mp.sh --base http://localhost:3000 --token "<admin-jwt>" --dry-run    # 仅打印 curl 命令
#
# 输出：每次 step 打印 JSON 响应；最后输出 auditId + 扫码审核提示
# =============================================================================

set -eo pipefail

# ===== 颜色辅助 =====
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ===== 校验入参 =====
BASE=""
TOKEN=""
VERSION="V0.2.141"
DESC=""
DRY_RUN=false
MEDIA_BASE64=""  # 选填：preview_info 截图 base64（无则跳过 uploadMpMedia）
CATEGORY=""     # 选填：指定类目（如 "工具-健康管理"），不填则用第 1 个类目

while [[ $# -gt 0 ]]; do
  case $1 in
    --base)     BASE="$2"; shift 2 ;;
    --token)    TOKEN="$2"; shift 2 ;;
    --version)  VERSION="$2"; shift 2 ;;
    --desc)     DESC="$2"; shift 2 ;;
    --media)    MEDIA_BASE64="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
    *) err "未知参数: $1"; exit 1 ;;
  esac
done

: "${BASE:?--base is required (e.g. https://qingmulife.cn)}"
: "${TOKEN:?--token is required (admin JWT, kind:'admin' / role:'super-admin')}"

# ===== 通用 POST helper =====
post() {
  local action="$1"
  local payload="$2"
  if [[ "$DRY_RUN" == true ]]; then
    echo "[DRY] POST $BASE/api/admin action=$action payload=$payload"
    return 0
  fi
  curl -sS -X POST "$BASE/api/admin" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"$action\",\"payload\":$payload}"
  echo
}

# ===== Step 1: getMpCategory =====
log "▶ [1/3] getMpCategory — 查 mp 服务类目列表"
CATEGORY_RESP=$(post 'getMpCategory' '{}')
log "响应: $CATEGORY_RESP"

# 提取第一个类目（如未指定）
if [[ -z "$CATEGORY" ]]; then
  CATEGORY=$(echo "$CATEGORY_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); cats=d.get('data',{}).get('category_list',[]); print(cats[0]['first_class']+'/'+cats[0]['second_class'] if cats else '工具/健康管理')")
  warn "未指定类目，使用第 1 个: $CATEGORY"
fi

# ===== Step 2: uploadMpMedia (可选) =====
MEDIA_ID=""
if [[ -n "$MEDIA_BASE64" ]]; then
  log "▶ [2/3] uploadMpMedia — 上传审核素材（截图）"
  MEDIA_RESP=$(post 'uploadMpMedia' "{\"mediaBase64\":\"$MEDIA_BASE64\"}")
  log "响应: $MEDIA_RESP"
  MEDIA_ID=$(echo "$MEDIA_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('media_id',''))")
  if [[ -z "$MEDIA_ID" ]]; then
    err "uploadMpMedia 未返 media_id"
    exit 1
  fi
else
  log "▶ [2/3] uploadMpMedia — 跳过（无 --media base64）"
fi

# ===== Step 3: submitMpAudit =====
log "▶ [3/3] submitMpAudit — 透传 item_list → auditId"

# item_list: 标准 1 个 item（pages/index）
# preview_info 可选（media_id 列表，最多 5 张）
ITEM_LIST=$(python3 -c "
import json
item = {
  'address': 'pages/index/index',
  'tag': '$CATEGORY',
  'title': '$DESC',
  'first_class': '$CATEGORY',
  'second_class': '',
  'third_class': '',
  'fourth_class': '',
  'item_id': '',
}
if '$MEDIA_ID':
    item['preview_info'] = [{'pic_type': 1, 'media_id': '$MEDIA_ID'}]
print(json.dumps([item], ensure_ascii=False))
")

AUDIT_RESP=$(post 'submitMpAudit' "{\"itemList\":$ITEM_LIST}")
log "响应: $AUDIT_RESP"

# ===== 输出 =====
AUDIT_ID=$(echo "$AUDIT_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('auditId',''))")
if [[ -n "$AUDIT_ID" ]]; then
  log "✅ 提审成功，auditId: $AUDIT_ID"
  log "👉 扫码审核入口: 微信公众平台 → 版本管理 → 审核版本"
else
  warn "未获取到 auditId，请查上方响应"
fi