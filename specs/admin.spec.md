# SPEC: Admin（管理後台 PWA）

## Purpose
提供 Timeline 歷史查詢、浮水印照片下載、30 天自動刪除確認的管理界面。

## Non-Goals
- 不做即時監控（即時監控在 operator 模組）
- 不做業務帳號的 CRUD（本期假設帳號由環境變數設定）
- 不做資料匯出（CSV / Excel）[需 Ryan 確認]
- 不做 KPI 統計圖表

## I/O Boundaries

| 動作 | 輸入 | 輸出 / 呼叫 |
|---|---|---|
| 登入 | admin_id + 密碼 | POST `/api/admin/auth` |
| 查詢 Timeline | `TimelineQuery`（日期範圍、operator_id） | GET `/api/admin/timeline` → `TimelineEvent[]` |
| 下載浮水印照片 | `token_id` | GET `/api/admin/photo/:tokenId` → Blob |
| 手動刪除記錄 | `token_id` | DELETE `/api/admin/record/:tokenId` |

## State Machine

無複雜狀態，單純 `loading | loaded | error` 的資料查詢模式，不需要 state machine。

## Failure Modes

1. **查無資料**：顯示「此區間無記錄」，不顯示空 table
2. **照片已刪除（30 天後）**：下載按鈕呈現「已刪除」狀態，不可點擊
3. **未授權**：401 → 導回登入頁

## Security Constraints

- **Admin 帳號**：只允許 IP allowlist 或 Cloudflare Access 保護（不暴露公網）
- **30 天自動刪除**：`submissions` 表的敏感欄位（卡號加密值、身分證字號加密值）在 `confirmed_at + 30d` 後由 Cron Trigger 清除；`timeline_events` 保留（無敏感欄位）
- **照片下載 log**：每次下載寫入 `admin_access_log`（who, when, token_id）

## Acceptance Criteria

1. 查詢 100 筆記錄回應時間 < 500ms
2. 30 天刪除邏輯：手動觸發 Cron 後，過期記錄的敏感欄位變為 NULL
3. 照片下載記錄在 `admin_access_log` 中可查
4. 非 admin 帳號無法存取任何 `/api/admin/` 端點（401）
5. 畫面在 Desktop Chrome / Safari 正常顯示

## Out of Scope

- 行動裝置優化
- [需 Ryan 確認] 是否需要匯出 CSV？
- 多層級管理員權限
