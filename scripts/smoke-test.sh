#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://fdd-reception.mandrill210025.workers.dev}"

pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1"; [ -n "${RAY_ID:-}" ] && printf "    Ray-ID: %s\n" "$RAY_ID"; exit 1; }

extract_ray() { RAY_ID=$(grep -i 'cf-ray' "$1" 2>/dev/null | head -1 | awk '{print $2}' || true); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

printf "\n🔍 Smoke test → %s\n\n" "$BASE_URL"

# --- 1. Issue ---
curl -sf -D "$TMP/h1" -o "$TMP/issue.json" \
  -X POST "$BASE_URL/api/token/issue" \
  -H "Authorization: Bearer smoke-test" || { extract_ray "$TMP/h1"; fail "POST /api/token/issue failed"; }

TOKEN_ID=$(python3 -c "import sys,json; print(json.load(open('$TMP/issue.json'))['id'])" 2>/dev/null) \
  || fail "issue response missing 'id'"
pass "issue → token $TOKEN_ID"

# --- 2. Open ---
curl -sf -D "$TMP/h2" -o "$TMP/open.json" \
  -X POST "$BASE_URL/api/token/$TOKEN_ID/open" \
  || { extract_ray "$TMP/h2"; fail "POST /api/token/$TOKEN_ID/open failed"; }

python3 -c "import sys,json; d=json.load(open('$TMP/open.json')); assert 'expires_at' in d, 'missing expires_at'" 2>/dev/null \
  || fail "open response missing 'expires_at'"
pass "open → status opened"

# --- 3. Client page ---
curl -sf -D "$TMP/h3" -o "$TMP/client.html" \
  "$BASE_URL/client/?token=$TOKEN_ID" \
  || { extract_ray "$TMP/h3"; fail "GET /client/ failed"; }

grep -q 'wizard' "$TMP/client.html" \
  || fail "client HTML missing wizard markup"
pass "client page serves HTML with wizard"

# --- 4. Cleanup: destroy the smoke token ---
curl -sf -X DELETE "$BASE_URL/api/token/$TOKEN_ID/destroy" -o /dev/null 2>/dev/null || true

printf "\n✅ All smoke tests passed.\n\n"
