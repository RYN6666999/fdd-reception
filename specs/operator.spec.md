# SPEC: Operator（業務端懸浮資料卡 PWA）

## Purpose
讓業務在通話中即時看到客戶送出的資料，並提供複製按鈕加速輸入系統。

## Non-Goals
- 不做業務節奏控制（不提示「現在說什麼」）
- 不做 Token 核准或拒絕的業務決策
- 不做統計報表（統計在 admin 模組）
- 不做帳號管理

## I/O Boundaries

| 動作 | 輸入 | 輸出 / 呼叫 |
|---|---|---|
| 登入 | operator_id + PIN | POST `/api/operator/auth` → session token |
| 產生 Token | — | POST `/api/token/issue` → `Token` (含短網址) |
| 即時接收資料 | WebSocket `/api/session/:tokenId/ws` | `SessionEvent` stream |
| 複製欄位 | 點擊 | Clipboard API |
| 結案 | 確認後點擊 | DELETE `/api/token/:id/destroy` |

## State Machine

```
業務端畫面狀態：

idle ──發送連結──▶ waiting ──收到 uploaded──▶ reviewing ──展開全卡號──▶ confirming ──人工按「確認無誤」──▶ done
  ▲                  │                            │                                                              │
  └──────────────────┴────────────────────────────┴──────────destroy()──────────────────────────────────────────▶ idle
```

- `idle`：無進行中的 Token
- `waiting`：Token 已發出，等客戶填完
- `reviewing`：客戶已送出，業務端看資料
- `done`：業務已確認，Token 進入 confirmed

## Failure Modes

1. **WebSocket 斷線**：顯示「連線中斷，重新連線...」badge，自動重連（指數退避，最多 5 次）；重連後請求狀態快照
2. **複製失敗（Clipboard API 被拒）**：fallback 為 `window.prompt` 呈現文字讓業務手動複製
3. **Token 過期（客戶未完成）**：WebSocket 推送 `expired` 事件 → 畫面回到 `idle`，提示「連結已失效，可重新發送」

## Security Constraints

- **CVV 顯示**：只在 `reviewing` 狀態顯示，離開頁面或切換 tab 自動清除
- **CVV 複製後**：60 秒後自動清除剪貼簿（`navigator.clipboard.writeText('')`）
- **卡號遮蔽**：預設顯示後四碼；業務點擊「確認看全號」→ 顯示完整卡號 → 業務人工核對後按「確認無誤」→ 才能觸發 `confirm()`；這是阻斷確認步驟，不可跳過
- **Session token**：儲存在 memory，不寫 localStorage；重整後需重新登入

## Acceptance Criteria

1. 客戶送出後，業務端 < 1 秒內看到資料（WebSocket 延遲）
2. 點任何欄位 = 複製到剪貼簿，同時顯示「已複製」提示 1 秒
3. CVV 複製 60 秒後，再次貼上應為空字串
4. 結案後，該客戶所有資料從業務端畫面消失
5. WS 斷線重連後，資料不丟失（快照機制）
6. 無任何主動提示業務說什麼或做什麼的文案

## Out of Scope

- 多個進行中 Token 同時顯示（單 Token 先做，並行留 Out of Scope）
- 業務端的歷史記錄查詢（在 admin 模組）
- 行動裝置 App
