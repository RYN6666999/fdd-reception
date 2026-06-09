# SPEC: Client（客戶端拍照上傳 PWA）

## Purpose
讓客戶用手機瀏覽器完成拍照、OCR 自動辨識、確認資料、一次性送出的流程。

## Non-Goals
- 不做歡迎詞、引導文案、顏色情緒設計
- 不做帳號系統（無需登入）
- 不做 OCR 以外的 AI 推理
- 不做任何業務節奏控制（不倒數、不催促）
- 不做 App 安裝提示

## I/O Boundaries

| 動作 | 輸入 | 輸出 / 呼叫 |
|---|---|---|
| 開啟連結 | URL 中的 `token` 參數 | GET `/api/token/:id` 取得狀態 |
| 拍照 / 上傳 | Camera / File input | `Blob` → Canvas 浮水印 → OCR |
| OCR 結果 | `Blob` | `OcrCardResult` / `OcrIdResult` (Zod 驗證) |
| 送出 | 確認後的資料 | POST `/api/token/:id/submit` with `Submission` |

## State Machine

```
URL 開啟 ──token valid?──▶ 拍照畫面 ──OCR 完成──▶ 確認畫面 ──送出──▶ 完成畫面
                │
               No
                ▼
            失效畫面（靜態，無互動）
```

- 每個畫面對應一個 `view` state：`loading | invalid | capture | confirm | done | error`
- 使用 state machine（非多個 `useState`）

## Failure Modes

1. **Token 已失效（410）**：顯示靜態訊息「此連結已失效，請聯繫業務人員」，無重試按鈕
2. **OCR 辨識失敗**：顯示辨識結果欄位為空，允許客戶手動輸入，不阻斷流程
3. **送出失敗（網路錯誤 / 409）**：顯示「送出失敗，請重試」按鈕；409 則顯示「資料已送出，請勿重複操作」

## Security Constraints

- **浮水印**：拍照後 Canvas 強制套用「限業務使用 · {timestamp} · {token_id}」浮水印，不可關閉
- **CVV 欄位**：type="password"，不寫入任何 local storage / session storage
- **照片不儲存**：送出後 Canvas blob 立即釋放，不寫入瀏覽器快取
- **HTTPS only**：Token 連結必須是 HTTPS，HTTP 直接拒絕

## Acceptance Criteria

1. 從 URL 開啟到拍照畫面顯示 < 2 秒（4G 網路）
2. OCR 完成後，卡號欄位自動填入且可編輯
3. Luhn 校驗失敗時，卡號欄位顯示錯誤提示，阻斷送出
4. 身分證字號校驗失敗時，同上
5. 送出成功後，畫面顯示「完成」且無任何下一步按鈕
6. 無任何歡迎詞、情感文案、顏色變化（UI audit 可驗）
7. 在 iOS Safari 16+ / Android Chrome 110+ 正常運作

## Out of Scope

- 多張卡片（本次只做單張信用卡 + 單張身分證）
- 影片辨識（只做靜態拍照）
- 離線模式
- 信用卡背面辨識（Phase 3b，可選流程，正面辨識失敗時才觸發）
