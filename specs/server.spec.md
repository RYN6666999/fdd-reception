# SPEC: Server（後端 API + DB）

## Purpose
提供 Token 管理、資料接收、Timeline 記錄、WebSocket 即時推送的後端服務。

## Non-Goals
- 不做任何業務邏輯（不判斷是否應該核卡、不計算分期費率）
- 不做身份驗證以外的業務規則
- 不做主動通知（Email / SMS / Push）
- 不做 OCR（OCR 在客戶端瀏覽器執行）

## I/O Boundaries

| 端點 | 方法 | 輸入 Schema | 輸出 Schema |
|---|---|---|---|
| `/api/token/issue` | POST | `TokenIssueRequest` | `Token` |
| `/api/token/:id/open` | POST | — | `Token` |
| `/api/token/:id/submit` | POST | `Submission` | `SubmissionAck` |
| `/api/token/:id/confirm` | POST | — | `Token` |
| `/api/token/:id/destroy` | DELETE | — | `{ ok: true }` |
| `/api/session/:tokenId/ws` | WS | — | `SessionEvent` |
| `/api/admin/timeline` | GET | `TimelineQuery` | `TimelineEvent[]` |

所有 Schema 定義在 `contracts/`，由 Zod 在 runtime 驗證。

## State Machine

```
Token 狀態機：

issued ──open()──▶ opened ──submit()──▶ uploaded ──confirm()──▶ confirmed
   │                  │                    │                        │
   └──expire()──▶ expired            expire()──▶ expired      destroy()──▶ destroyed
                       │
                  destroy()──▶ destroyed
```

- `issued`：Token 建立，尚未被客戶打開
- `opened`：客戶打開連結，計時開始（10 分鐘）
- `uploaded`：客戶送出資料，等業務確認
- `confirmed`：業務確認收到，資料寫入 Timeline
- `expired`：超過 10 分鐘未完成，自動失效
- `destroyed`：業務手動結案，所有敏感資料刪除

狀態轉換規則：
- 任何狀態皆可 → `destroyed`（業務端結案按鈕）
- `expired` / `destroyed` 是終態，不可回頭

## Failure Modes

1. **Token 已過期**：客戶打開連結但 Token 已 expired → 回傳 `410 Gone` + 錯誤訊息「連結已失效，請聯繫業務人員」
2. **重複送出**：Token 已在 `uploaded` 或 `confirmed` 狀態時再次 POST submit → 回傳 `409 Conflict`，不覆蓋資料
3. **WebSocket 斷線**：業務端 WS 斷線 → Durable Object 持有狀態，重連時補發最新快照；不丟事件

## Security Constraints

- **卡號儲存**：AES-256-GCM 加密，key 存 Cloudflare Workers Secret，不儲存明文
- **CVV**：永不寫入 DB，僅透過 WebSocket 推送業務端，推送後即丟棄
- **自動刪除**：`confirmed` 狀態 30 天後，排程刪除 `submissions` 表的敏感欄位（卡號、身分證字號保留 hash）
- **Token 一次性**：`submit()` 後 Token 進入 `uploaded`，無法再次提交
- **Rate limit**：`/api/token/issue` 每個 operator_id 每小時最多 100 次
- **浮水印驗證**：`submit()` 收到照片時，伺服器端二次驗證浮水印 hash 是否與 Token 匹配

## Acceptance Criteria

1. Token 從 `issued` → `expired` 時間差不超過 10 分鐘（誤差 ±5 秒）
2. 同一 Token 第二次 POST submit 回傳 `409`，DB 資料不變
3. 業務端 WS 斷線重連後，30 秒內收到最新 Token 狀態快照
4. 刪除 Token（destroy）後，`/api/token/:id` 任何請求皆回傳 `404`
5. 卡號在 DB 中無明文（`SELECT` 結果為加密 blob）
6. CVV 不出現在任何 D1 table、Worker log、或 Timeline 記錄中
7. `guard:all` 在 CI 中跑通

## Out of Scope

- 多租戶 / 多業務團隊隔離（目前假設單一組織）
- 卡號 tokenization（串接 payment gateway）
- 審計日誌的法規合規出口（目前只有內部 Timeline）
- 業務端帳號管理系統
