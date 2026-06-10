#!/usr/bin/env bash
# OCR 回歸測試：一條命令重現整條 photo → OCR 管線。
# 注意：會打真實的 Workers AI（有少量費用），所以不進 guard:all，需要時手動跑。
#
# 用法：
#   npm run test:ocr                       # 對 production
#   bash scripts/ocr-test.sh http://localhost:8787   # 對 wrangler dev
set -uo pipefail

BASE_URL="${1:-https://fdd-reception.mandrill210025.workers.dev}"
FIXTURES="$(dirname "$0")/../test/fixtures/ocr"
OPERATOR="ocr-regression-test"

FAILED=0
pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1"; FAILED=1; }

printf "\n🔬 OCR regression → %s\n\n" "$BASE_URL"

# --- 建 token ---
TOKEN=$(curl -sf -X POST "$BASE_URL/api/token/issue" -H "Authorization: Bearer $OPERATOR" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])") || { fail "issue token"; exit 1; }
curl -sf -X POST "$BASE_URL/api/token/$TOKEN/open" >/dev/null || { fail "open token"; exit 1; }
pass "token $TOKEN issued + opened"

cleanup() {
  curl -s -o /dev/null -X DELETE "$BASE_URL/api/token/$TOKEN/destroy" \
    -H "Authorization: Bearer $OPERATOR"
}
trap cleanup EXIT

ocr_upload() { # $1=file $2=type → JSON to stdout
  curl -s -X POST "$BASE_URL/api/token/$TOKEN/photo" \
    -F "photo=@$FIXTURES/$1" -F "type=$2"
}

expect_field() { # $1=json $2=jq-ish path(python) $3=expected $4=label
  actual=$(printf '%s' "$1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('ocr', {}).get('$2', ''))" 2>/dev/null)
  if [ "$actual" = "$3" ]; then
    pass "$4 = $3"
  else
    fail "$4 expected [$3] got [$actual]"
  fi
}

# --- 1. 傳統凸字卡正面 ---
R=$(ocr_upload card_front.jpg card_front)
expect_field "$R" card_number "4111111111111111" "card_front 卡號"
expect_field "$R" expiry "12/28" "card_front 期限"

# --- 2. 身分證正面（中文姓名 + 民國年轉換） ---
R=$(ocr_upload id_front.jpg id_front)
expect_field "$R" name "王小明" "id_front 姓名"
expect_field "$R" id_number "A123456789" "id_front 字號"
expect_field "$R" birth_date "1991-05-15" "id_front 生日（民國80→1991）"

# --- 3. 身分證背面（無擷取，僅上傳） ---
R=$(ocr_upload id_back.jpg id_back)
printf '%s' "$R" | grep -q '"ok":true' && pass "id_back 上傳" || fail "id_back 上傳: $R"

# --- 4. 新式卡背面（卡號印在背面 → 輔助辨識） ---
R=$(ocr_upload newstyle_back.jpg card_back)
expect_field "$R" card_number "5520123456785674" "card_back 背面卡號"
expect_field "$R" expiry "11/29" "card_back 背面期限"
# CVV 987 印在圖上，回應中絕不可出現
if printf '%s' "$R" | grep -q "987"; then
  fail "card_back 回應洩漏 CVV"
else
  pass "card_back 回應不含 CVV"
fi

# --- 5. 傳統卡背面（無卡號 → 空結果不算失敗） ---
R=$(ocr_upload card_back.jpg card_back)
printf '%s' "$R" | grep -q '"ok":true' && pass "card_back（無卡號）不誤報失敗" || fail "card_back: $R"

if [ "$FAILED" -eq 1 ]; then
  printf "\n❌ OCR regression FAILED\n\n"
  exit 1
fi
printf "\n✅ OCR regression PASSED\n\n"
