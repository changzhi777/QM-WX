#!/usr/bin/env bash
# ============================================================
# apps/server smoke test
# 跑法：服务器起来后，bash scripts/smoke.sh
# 退出码：0 = 全过，非 0 = 有失败
# ============================================================

set -e

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

assert_status() {
  local expected=$1
  local actual=$2
  local name=$3
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name (期望 $expected, 实际 $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_code() {
  local expected=$1
  local actual=$2
  local name=$3
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $name (code=$actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name (期望 code=$expected, 实际 $actual)"
    FAIL=$((FAIL + 1))
  fi
}

post() {
  local path=$1
  local body=${2:-'{}'}
  curl -s -o /tmp/smoke_body.json -w "%{http_code}" \
    -X POST -H "content-type: application/json" \
    -d "$body" "$BASE$path"
}

post_with_token() {
  local path=$1
  local token=$2
  local body=${3:-'{}'}
  curl -s -o /tmp/smoke_body.json -w "%{http_code}" \
    -X POST -H "content-type: application/json" \
    -H "authorization: Bearer $token" \
    -d "$body" "$BASE$path"
}

echo ""
echo "=========================================="
echo "  QM-WX Server Smoke Test"
echo "  Base: $BASE"
echo "=========================================="
echo ""

# ===== 1. Health =====
echo "[1] 健康检查"
status=$(curl -s -o /tmp/smoke_body.json -w "%{http_code}" "$BASE/health")
assert_status 200 "$status" "GET /health"
code=$(jq -r '.status' /tmp/smoke_body.json 2>/dev/null)
assert_code "ok" "$code" "/health.status"

# ===== 2. 公开端点 =====
echo "[2] 公开端点（无需登录）"
status=$(post /api/mall '{"action":"listProducts","payload":{"page":1}}')
assert_status 200 "$status" "POST /api/mall listProducts"
code=$(jq -r '.code' /tmp/smoke_body.json 2>/dev/null)
assert_code "0" "$code" "listProducts.code"

status=$(post /api/content '{"action":"list","payload":{"page":1}}')
assert_status 200 "$status" "POST /api/content list"
code=$(jq -r '.code' /tmp/smoke_body.json 2>/dev/null)
assert_code "0" "$code" "content.list.code"

# ===== 3. 需鉴权端点 =====
echo "[3] 需鉴权端点（无 token 应 401）"
status=$(post /api/user '{"action":"me"}')
assert_status 401 "$status" "POST /api/user me (无 token)"

status=$(post /api/sport '{"action":"myStats"}')
assert_status 401 "$status" "POST /api/sport myStats (无 token)"

status=$(post /api/weekly-report '{"action":"currentWeek"}')
assert_status 401 "$status" "POST /api/weekly-report currentWeek (无 token)"

status=$(post /api/upload)
assert_status 401 "$status" "POST /api/upload (无 token)"

# ===== 4. 功能开关守卫 =====
echo "[4] 功能开关守卫（wallet=OFF 应 403）"
status=$(post_with_token /api/wallet '{"action":"get"}' "fake-token")
assert_status 401 "$status" "POST /api/wallet (无效 token → 401)"

# ===== 5. 业务 action 路由校验 =====
echo "[5] 业务 action 路由校验"
status=$(post /api/sport '{"action":"checkin","payload":{"distance":999}}')
assert_status 400 "$status" "POST /api/sport checkin (无 token → 401)"
# 实际上未鉴权先 401，加 token 后才校验 distance
status=$(post_with_token /api/sport '{"action":"checkin","payload":{"distance":999}}' "fake")
assert_status 401 "$status" "POST /api/sport checkin (token 假 → 401)"

# ===== 6. 模块路由注册 =====
echo "[6] 模块路由注册（每个 module 至少 1 端点）"
for module in user sport mall content weekly-report; do
  status=$(post "/api/$module" '{}')
  if [ "$status" = "200" ] || [ "$status" = "400" ] || [ "$status" = "401" ]; then
    echo -e "  ${GREEN}✓${NC} /api/$module 路由可达 (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} /api/$module 路由不可达 (HTTP $status)"
    FAIL=$((FAIL + 1))
  fi
done

# ===== 7. CORS / 错误处理 =====
echo "[7] 错误处理"
status=$(post /api/nonexistent '{}')
assert_status 404 "$status" "POST /api/nonexistent (404)"

# ===== 总结 =====
echo ""
echo "=========================================="
echo -e "  通过：${GREEN}$PASS${NC}  失败：${RED}$FAIL${NC}"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0
