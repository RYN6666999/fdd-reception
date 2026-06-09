# fdd-reception — 完整 TODO 計劃

> 軍工級規則：Guard 失敗 → 讀錯誤 → 修根因 → 重跑。永遠不跳過。
> 每個 Phase 完成後跑 `npm run guard:specs`，Phase 1 後跑 `npm run guard:contracts`，deploy 前跑 `npm run guard:all`。

---

## Phase 0 — 骨架 + SPEC ✅

- [x] 建立目錄結構 `client/ operator/ admin/ server/ contracts/ specs/ guards/`
- [x] `specs/server.spec.md` — 完整八區塊
- [x] `specs/client.spec.md` — 完整八區塊（確認：正面優先，反面 Phase 3b 選做）
- [x] `specs/operator.spec.md` — 完整八區塊（確認：人工確認全卡號 + confirming 狀態）
- [x] `specs/admin.spec.md` — 完整八區塊
- [x] `guards/check-specs.mjs` — guard:specs 守門腳本
- [x] `guards/check-contracts.mjs` — guard:contracts 守門腳本骨架
- [x] `package.json` — guard pipeline 腳本
- [x] `wrangler.toml` — D1 + Durable Objects 骨架
- [x] `tsconfig.json`
- [x] `guard:specs PASSED`

---

## Phase 1 — Contracts Baseline ✅

> 守門：`npm run guard:contracts` 必須 PASSED 才能進 Phase 2

### 1a. Token Schema
- [x] `contracts/token.schema.ts`
  - 狀態枚舉：`issued | opened | uploaded | confirmed | expired | destroyed`
  - 欄位：`id, operator_id, created_at, opened_at, expires_at, status, short_url`
  - Zod refinement：`expires_at > opened_at`
- [x] `contracts/token.schema.test.ts`
  - happy path：valid token
  - 邊界：expires_at = opened_at → 應拒絕
  - 拒絕：無效 status 字串

### 1b. OCR Card Schema
- [x] `contracts/ocr-card.schema.ts`
  - 欄位：`card_number (16碼), expiry (MM/YY), holder_name (optional)`
  - Zod refinement：Luhn 校驗（卡號）
  - Zod refinement：到期日合理性（expiry 未過期）
- [x] `contracts/ocr-card.schema.test.ts`
  - happy：`4111 1111 1111 1111`（Luhn valid Visa test card）
  - 拒絕：Luhn invalid
  - 拒絕：已過期的到期日
  - 邊界：`holder_name` 缺席 → 應通過

### 1c. OCR ID Schema
- [x] `contracts/ocr-id.schema.ts`
  - 欄位：`name, id_number, birth_date`
  - Zod refinement：台灣身分證字號校驗演算法（A1234567890 格式 + 加權校驗）
- [x] `contracts/ocr-id.schema.test.ts`
  - happy：合法身分證號
  - 拒絕：格式不符
  - 拒絕：校驗碼錯誤

### 1d. Submission Schema
- [x] `contracts/submission.schema.ts`
  - 欄位：`token_id, ocr_card, ocr_id, installment (optional), photo_hash`
  - **CVV 不在此 schema**（CVV 走獨立 WebSocket 推送，不寫 DB）
- [x] `contracts/submission.schema.test.ts`
  - happy：完整送出
  - 拒絕：token_id 缺席
  - 拒絕：photo_hash 格式不符（非 SHA-256）

### 1e. Timeline Event Schema
- [x] `contracts/timeline-event.schema.ts`
  - 欄位：`id, event_type, token_id, operator_id, timestamp, metadata (optional)`
  - event_type 枚舉：`token_issued | token_opened | token_submitted | token_confirmed | token_expired | token_destroyed | photo_downloaded`
- [x] `contracts/timeline-event.schema.test.ts`

### 1f. Guard 更新
- [x] 更新 `guards/check-contracts.mjs` — 加入存在性 + tsc 型別檢查
- [x] `npm run guard:contracts` PASSED

---

## Phase 2 — 後端 Token Pipeline ✅

> 守門：`npm run guard:all` 在本 phase 完成前必須針對 server/ 通過

### 2a. D1 Schema
- [x] `server/schema.sql`
  - `tokens` table（含所有 Token 欄位）
  - `submissions` table（敏感欄位加密儲存）
  - `timeline_events` table
  - `admin_access_log` table
  - Index：`tokens(operator_id, status)`, `timeline_events(token_id)`, `timeline_events(operator_id, timestamp)`

### 2b. Token API
- [x] `server/api/token/issue.ts` — POST `/api/token/issue`
  - 驗證 operator session
  - 產生短網址（nanoid 8 碼）
  - Rate limit：每 operator 每小時 100 次（D1 counter）
  - 寫入 `timeline_events`：`token_issued`
- [x] `server/api/token/open.ts` — POST `/api/token/:id/open`
  - `issued` → `opened`，記錄 `opened_at`
  - 設定 10 分鐘 TTL
  - 寫入 `timeline_events`：`token_opened`
- [x] `server/api/token/submit.ts` — POST `/api/token/:id/submit`
  - 驗證 `Submission` schema（Zod safeParse）
  - 驗證 `photo_hash` 與 Token 綁定的 hash 匹配
  - AES-256-GCM 加密卡號 + 身分證字號
  - `uploaded` 後狀態不可再 submit → 409
  - 透過 Durable Object 推送 `uploaded` 事件給業務端
  - 寫入 `timeline_events`：`token_submitted`
- [x] `server/api/token/confirm.ts` — POST `/api/token/:id/confirm`
  - `uploaded` → `confirmed`
  - 寫入 `timeline_events`：`token_confirmed`
- [x] `server/api/token/destroy.ts` — DELETE `/api/token/:id/destroy`
  - 任何狀態 → `destroyed`
  - 刪除 `submissions` 表的敏感欄位（卡號、身分證加密值置 NULL）
  - 寫入 `timeline_events`：`token_destroyed`

### 2c. Token 過期排程
- [x] `server/cron/expire-tokens.ts` — Cron Trigger（每分鐘）
  - 查詢 `opened` 且 `expires_at < now()` 的 Token
  - 批次更新 → `expired`
  - 透過 Durable Object 推送 `expired` 事件
  - 寫入 `timeline_events`：`token_expired`

### 2d. Durable Object — SessionRoom
- [x] `server/durable-objects/session-room.ts`
  - 狀態持有：當前 Token 的最新快照
  - WS 連線管理（業務端多個裝置可連同一房間）
  - 推送事件：`uploaded | expired | destroyed | confirmed`
  - 重連時推送快照（`type: 'snapshot'`）

### 2e. CVV 推送（獨立不寫 DB）
- [x] 在 `submit.ts` 收到 CVV 後，立即透過 Durable Object 推送給業務端 WS
- [x] CVV 不進任何 log、不進 D1

---

## Phase 3 — 客戶端拍照 + OCR ✅

### 3a. 核心 UI 骨架
- [x] `client/index.html` — 最小 HTML shell（無歡迎詞、無引導文案）
- [x] `client/app.js` — State machine（`loading | invalid | capture | confirm | done | error`）
  - 使用原生 JS class + dispatchEvent，不用框架
  - 每個 state 對應一個 view function，禁止直接 DOM 操作在 state 外部
- [x] `client/style.css` — 極簡，無顏色情緒設計

### 3b. 拍照 + Camera API
- [x] `client/camera.js`
  - `getUserMedia({ video: { facingMode: 'environment' } })`
  - File input fallback（不支援 camera 的環境）
  - 拍照後回傳 `Blob`
  - 解析度限制：最大 2048px 邊長（壓縮過大圖片）

### 3c. 浮水印
- [x] `client/watermark.js`
  - Canvas API 套用浮水印：`限業務使用 · {YYYY-MM-DD HH:mm} · {token_id 後六碼}`
  - 字體：白字 + 黑色描邊（在任何背景可讀）
  - 位置：圖片中央斜向 45°（防截圖去除）
  - 輸出：浮水印後的 `Blob` + SHA-256 hash
  - 浮水印強制套用，無法繞過（hash 與 token 綁定，伺服器端驗證）

### 3d. OCR — 信用卡正面
- [x] `client/ocr-card.js`
  - Tesseract.js worker（`createWorker('eng')`）
  - 預處理：灰階 + 對比增強（提高 OCR 準確率）
  - 擷取邏輯：
    - 卡號：16 位數字群組識別（`\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}`）
    - 到期日：`MM/YY` 或 `MM/YYYY` 格式
    - 持卡人姓名（optional，最後一行英文大寫）
  - 結果用 `OcrCardSchema.safeParse()` 驗證
  - 驗證失敗 → 回傳空欄位（允許手動輸入，不阻斷）

### 3e. OCR — 身分證
- [x] `client/ocr-id.js`
  - 擷取邏輯：
    - 姓名（中文）
    - 身分證字號（`[A-Z]\d{9}` 格式）
    - 生日（民國 → 西元轉換）
  - 結果用 `OcrIdSchema.safeParse()` 驗證

### 3f. Phase 3b（選做，正面辨識失敗時才觸發）
- [x] `client/ocr-card-back.js` — 背面 CVV 辨識
  - 只在 OCR 正面卡號辨識失敗後，顯示「請翻到背面重拍」提示
  - 辨識失敗仍允許手動輸入，不阻斷

---

## Phase 4 — 客戶端確認 + 上傳 ✅

### 4a. 確認畫面
- [x] `client/views/confirm.js`
  - 顯示 OCR 結果（可編輯）
  - 卡號欄位：顯示 16 碼（可編輯），Luhn 即時校驗
  - 到期日欄位：MM/YY，到期日校驗
  - CVV 欄位：`type="password"`，3-4 碼，僅傳送不儲存
  - 身分證字號欄位：即時校驗演算法
  - 分期選項（optional）：下拉選單
  - 送出按鈕：所有必填欄位通過校驗才 enable

### 4b. 上傳 API 呼叫
- [x] `client/api.js`
  - `submitData(tokenId, submission, cvv)`
    - 先 POST `submission`（不含 CVV）→ `/api/token/:id/submit`
    - 成功後透過 WS 推送 CVV（不含在 HTTP body）
    - 失敗處理：409 → 顯示「已送出」；網路錯誤 → 顯示重試按鈕
  - CVV 送出後立即清除變數（`cvv = null`）

### 4c. 完成畫面
- [x] `client/views/done.js`
  - 靜態文字：「資料已送出」
  - 無任何下一步按鈕
  - 無倒數、無情感設計

---

## Phase 5 — 業務端懸浮資料卡 ✅

### 5a. 核心 UI
- [x] `operator/index.html`
- [x] `operator/app.js` — State machine（`idle | waiting | reviewing | confirming | done | error`）
  - **`confirming` 是阻斷狀態**：展開全卡號後必須人工按「確認無誤」才能 `confirm()`

### 5b. Token 發送流程
- [x] `operator/views/idle.js`
  - 「發送收件連結」按鈕
  - 呼叫 `POST /api/token/issue` → 取得短網址
  - 複製短網址到剪貼簿 + 顯示「已複製」1 秒
  - 進入 `waiting` 狀態

### 5c. WebSocket 即時接收
- [x] `operator/ws.js`
  - 連線 `/api/session/:tokenId/ws`
  - 事件處理：`uploaded | expired | destroyed | confirmed | snapshot`
  - 斷線自動重連（指數退避 1s → 2s → 4s → 8s → 16s，最多 5 次）
  - 重連後請求快照（`type: 'get_snapshot'`）
  - 斷線期間顯示「連線中斷，重新連線...」badge

### 5d. 資料卡 + 複製
- [x] `operator/views/reviewing.js`
  - 欄位分組：
    - **Step 1 — 持卡人**：姓名、身分證字號、生日
    - **Step 2 — 卡片資訊**：卡號（後四碼）、到期日、分期
    - **Step 3 — 確認**：「確認看全號」按鈕
  - 每個欄位點擊 = 複製到剪貼簿 + 顯示「已複製」提示 1 秒
  - Clipboard API 失敗 → `window.prompt` fallback

### 5e. 人工確認全卡號（阻斷步驟）
- [x] `operator/views/confirming.js`
  - 進入條件：業務點擊「確認看全號」
  - 顯示完整 16 碼卡號（解密 API 呼叫）
  - 顯示「請核對卡號無誤後按確認」
  - 兩個按鈕：「確認無誤」→ 觸發 `confirm()` | 「資料有誤」→ 回到 `reviewing`
  - **不可跳過此步驟直接 confirm**

### 5f. CVV 接收與自動清除
- [x] CVV 透過 WS 推送，顯示後：
  - 離開頁面 / 切換 tab → 自動清除 CVV DOM
  - 複製 CVV 後 60 秒：`navigator.clipboard.writeText('')`
  - 進入 `confirming` 或 `done` 狀態後清除 CVV

### 5g. 結案
- [x] `operator/views/done.js`
  - 「結案」按鈕 → DELETE `/api/token/:id/destroy`
  - 結案後清空所有客戶資料 DOM
  - 回到 `idle` 狀態

---

## Phase 6 — 敏感資料保護 ✅

### 6a. 加密儲存
- [x] `server/utils/crypto.ts`
  - AES-256-GCM 加密 / 解密
  - Key 從 `env.ENCRYPTION_KEY` 讀取（Cloudflare Workers Secret）
  - 輸出：`{ iv, ciphertext, tag }` 序列化為 base64 string
- [x] 確認 `server/api/token/submit.ts` 使用此模組加密卡號 + 身分證字號
- [x] 確認 `server/api/token/destroy.ts` 將加密欄位置 NULL

### 6b. 30 天自動刪除
- [x] `server/cron/cleanup-sensitive.ts` — Cron Trigger（每天一次）
  - 查詢 `confirmed_at < now() - 30 days` 的 `submissions`
  - 將 `card_number_enc, id_number_enc` 欄位置 NULL
  - 寫入 `timeline_events`：`data_auto_deleted`

### 6c. Photo Hash 伺服器端驗證
- [x] 在 `server/api/token/submit.ts` 驗證：
  - 計算收到照片的 SHA-256
  - 比對客戶端送來的 `photo_hash`
  - 不匹配 → 400 Bad Request（防止浮水印被繞過）

---

## Phase 7 — 管理後台 Timeline ✅

### 7a. Timeline 查詢
- [x] `admin/index.html`
- [x] `admin/api.js` — GET `/api/admin/timeline`
  - 支援 `TimelineQuery`：日期範圍、operator_id filter
  - Pagination（每頁 50 筆）

### 7b. 照片下載
- [x] GET `/api/admin/photo/:tokenId`
  - 驗證 admin session
  - 寫入 `admin_access_log`：who, when, token_id
  - 回傳浮水印照片 Blob

### 7c. 手動刪除
- [x] DELETE `/api/admin/record/:tokenId`
  - 刪除 `submissions` 敏感欄位
  - 保留 `timeline_events`（審計不可刪）

---

## Phase 8 — Guard Pipeline 完整化 🔲

### 8a. 更新 guard:contracts
- [x] 加入 tsc 型別檢查（`npx tsc --noEmit`）
- [x] 加入 test runner（`bun test contracts/`）
- [x] 確保所有 schema tests PASSED

### 8b. guard:lint
- [ ] 設定 ESLint（`eslint.config.mjs`）
  - `no-any`、`no-as-cast`（透過 @typescript-eslint rules）
  - `no-console`（server 端）
- [ ] `npm run guard:lint` PASSED

### 8c. CI
- [ ] `.github/workflows/guard.yml`
  - PR 阻斷：`npm run guard:all`
  - 失敗 → PR 不可合併

### 8d. 最終 guard:all 確認
- [ ] `npm run guard:all` 在乾淨 clone 上跑通

---

## Phase 9 — 實戰驗收 🔲

### 9a. 三個真實客戶流程
- [ ] 業務發送連結 → 客戶完成送出 → 業務確認全卡號 → confirm → Timeline 有記錄
- [ ] 驗證 CVV 不出現在 D1 任何 table（`SELECT * FROM submissions` 確認）
- [ ] 驗證 30 天刪除邏輯（手動觸發 Cron，確認敏感欄位變 NULL）

### 9b. 邊界情境驗收
- [ ] Token 過期（10 分鐘）→ 客戶畫面顯示失效訊息
- [ ] 重複送出 → 409，資料不變
- [ ] WS 斷線重連 → 資料不丟失
- [ ] 結案 → 業務端資料清空

### 9c. 安全驗收
- [ ] `grep -r "cvv\|CVV" .wrangler/` → 無結果
- [ ] D1 查詢卡號欄位 → 只看到加密 blob
- [ ] 瀏覽器 DevTools Network → CVV 不出現在任何 HTTP request body

---

## [選做] Phase 3b — 信用卡背面 OCR

> 觸發條件：Phase 3 正面 OCR 辨識失敗率 > 15%（實戰數據支持才做）

- [ ] `client/ocr-card-back.js` — 背面辨識
- [ ] 更新 `client/views/capture.js` — 增加「翻到背面重拍」分支
- [ ] 更新 `specs/client.spec.md` — 補充 Acceptance Criteria

---

## 開放問題追蹤

| # | 問題 | 答案 | 狀態 |
|---|---|---|---|
| 1 | OCR 正反面？ | 正面優先，反面 Phase 3b 選做 | ✅ 已決定 |
| 2 | 業務多 Token 並行？ | 串行：一個客戶處理完再下一位，並行永遠不做 | ✅ 已決定 |
| 3 | 完整卡號確認方式？ | 人工確認（confirming 阻斷狀態），不需 PIN | ✅ 已決定 |
| 4 | Admin CSV 匯出？ | Out of Scope（本期不做） | ✅ 已決定 |
