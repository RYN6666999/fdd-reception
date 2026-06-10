# fdd-reception — 業務收件工具

**定位：程式只做資料管道，不介入業務節奏。**

fdd-crm 姊妹專案。讓客戶用手機一次性送出信用卡 / 身分證資料，業務端即時收到並複製到系統。

## 架構

```
client/     ← 客戶端 PWA（拍照 → OCR → 確認 → 送出）
operator/   ← 業務端 PWA（懸浮資料卡 + 複製鈕）
admin/      ← 管理後台（Timeline 查詢 + 30 天刪除）
server/     ← Cloudflare Workers + D1 + Durable Objects
contracts/  ← Zod schemas（共用契約）
specs/      ← 各模組 SPEC.md
guards/     ← Guard 腳本
```

## 技術棧

- 前端：Vanilla JavaScript（無框架）
- 後端：Cloudflare Workers + D1 + Durable Objects
- 部署：Cloudflare Pages
- OCR：Tesseract.js（瀏覽器端執行）
- 即時通訊：WebSocket via Durable Objects
- Schema 驗證：Zod

## Guard Pipeline（任一失敗 = 阻斷，不跳過）

```
guard:specs      → 確保 SPEC.md 完整
guard:contracts  → Zod schemas 存在 + contract tests（bun test）
guard:types      → TypeScript 型別檢查
guard:lint       → ESLint（no-explicit-any、server 端 no-console）
guard:security   → CVV / PII 不落地檢查（scripts/security-check.sh）
guard:all        → 全部跑過才能 deploy（CI 同步阻斷 PR）
```

```bash
npm run guard:all        # deploy 前的門
npm run smoke            # deploy 後的線上煙霧測試
```

## 開發進度

- [x] Phase 0：骨架 + SPEC.md
- [x] Phase 1：Contracts Baseline
- [x] Phase 2：後端 Token Pipeline
- [x] Phase 3：客戶端拍照 + OCR
- [x] Phase 4：客戶端確認 + 上傳
- [x] Phase 5：業務端懸浮資料卡
- [x] Phase 6：敏感資料保護
- [x] Phase 7：管理後台 Timeline
- [x] Phase 8：Guard Pipeline 完整化（ESLint + CI + guard:security）
- [ ] Phase 9：實戰驗收（剩部署環境的手動驗收，見 TODOS.md）

## CVV 處理原則

CVV 永不落地：不進 D1、不進 log、不進 R2。
路徑：client → HTTPS POST `/api/token/:id/cvv` → Durable Object WS 即時轉發業務端。
業務端顯示後自動清除（切 tab / 結案 / 複製後 60 秒）。
`npm run guard:security` 在每次 guard:all 自動驗證此不變量。

開放問題的決定記錄在 `TODOS.md` 決策表。
