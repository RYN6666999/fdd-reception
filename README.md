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
guard:contracts  → 確保 Zod schemas 存在
guard:types      → TypeScript 型別檢查
guard:lint       → ESLint
guard:all        → 全部跑過才能 deploy
```

```bash
npm run guard:specs      # Phase 0 → 1 的門
npm run guard:contracts  # Phase 1 → 2 的門
npm run guard:all        # deploy 前的門
```

## 開發進度

- [x] Phase 0：骨架 + SPEC.md
- [ ] Phase 1：Contracts Baseline
- [ ] Phase 2：後端 Token Pipeline
- [ ] Phase 3：客戶端拍照 + OCR
- [ ] Phase 4：客戶端確認 + 上傳
- [ ] Phase 5：業務端懸浮資料卡
- [ ] Phase 6：敏感資料保護
- [ ] Phase 7：管理後台 Timeline
- [ ] Phase 8：Guard Pipeline 完整化
- [ ] Phase 9：實戰驗收

## [需 Ryan 確認] 開放問題

1. `specs/client.spec.md` — OCR 是否需要同時辨識信用卡正反面？
2. `specs/operator.spec.md` — 業務是否會同時服務多名客戶（多 Token 同時顯示）？
3. `specs/operator.spec.md` — 卡號是否需要 PIN 二次確認才能顯示全部？
4. `specs/admin.spec.md` — 是否需要匯出 CSV？
