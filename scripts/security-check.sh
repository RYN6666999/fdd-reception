#!/usr/bin/env bash
# Phase 9c 安全驗收 — 可本地自動化的部分。
# 不變量：CVV 永不落地（不進 D1 schema、不進 server log、不進本地 wrangler 狀態）。
set -uo pipefail

cd "$(dirname "$0")/.."

FAILED=0
pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1"; FAILED=1; }

printf "\n🔒 Security check (Phase 9c)\n\n"

# --- 1. CVV 不在 D1 schema / migrations ---
if grep -ri "cvv" functions/schema.sql migrations/ 2>/dev/null | grep -q .; then
  fail "CVV 出現在 D1 schema 或 migrations"
else
  pass "D1 schema / migrations 無 CVV 欄位"
fi

# --- 2. SubmissionSchema 本體不得有 cvv 欄位（CvvPayloadSchema 是傳輸契約，允許）---
SUBMISSION_BLOCK=$(awk '/export const SubmissionSchema/,/^\}\)/' contracts/submission.schema.ts)
if [ -z "$SUBMISSION_BLOCK" ]; then
  fail "找不到 SubmissionSchema 定義（檢查失效，不可視為通過）"
elif printf '%s' "$SUBMISSION_BLOCK" | grep -qi "cvv"; then
  fail "SubmissionSchema 含 CVV 欄位（會被持久化）"
else
  pass "SubmissionSchema 無 CVV 欄位"
fi

# --- 3. server 端沒有任何 console.* 印出 CVV ---
if grep -rn "console\." functions/ --include="*.ts" | grep -i "cvv" | grep -q .; then
  fail "server log 語句包含 CVV"
else
  pass "server log 語句不含 CVV"
fi

# --- 4. cvv.ts 不寫 DB（不出現 INSERT/UPDATE submissions）---
if grep -E "INSERT|UPDATE" functions/api/token/cvv.ts | grep -q .; then
  fail "cvv.ts 包含 DB 寫入語句"
else
  pass "cvv.ts 純轉發，無 DB 寫入"
fi

# --- 5. 本地 wrangler 狀態（D1 sqlite + logs）無 CVV 殘留 ---
if [ -d .wrangler ]; then
  if grep -ri "cvv" .wrangler/ 2>/dev/null | grep -q .; then
    fail ".wrangler/ 本地狀態含 CVV 殘留"
  else
    pass ".wrangler/ 無 CVV 殘留"
  fi
else
  pass ".wrangler/ 不存在（跳過）"
fi

# --- 6. server 端 log 語句不得把 PII 變數當參數輸出（字串內提及欄位名 OK）---
if grep -rn "console\." functions/ --include="*.ts" \
  | grep -E "[,+] *(ocr\.[a-z_]+|digits\b|cardNumber\b|ocrRaw\.slice)" | grep -q .; then
  fail "server log 語句把 PII 變數當參數輸出"
else
  pass "server log 語句無 PII 變數輸出"
fi

printf "\n📋 需部署環境的手動驗收（無法本地自動化）：\n"
printf "   1. wrangler d1 execute fdd-reception --remote --command \"SELECT card_number_enc FROM submissions LIMIT 3\"\n"
printf "      → 只能看到加密 blob，不能是明文卡號\n"
printf "   2. 真實流程跑一輪後：SELECT * FROM submissions → 確認無 CVV 欄位\n"
printf "   3. 手動觸發 cleanup cron → 確認 30 天前的敏感欄位變 NULL\n"

if [ "$FAILED" -eq 1 ]; then
  printf "\n❌ Security check FAILED\n\n"
  exit 1
fi
printf "\n✅ Security check PASSED（本地部分）\n\n"
