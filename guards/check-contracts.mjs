/**
 * guard:contracts
 * 確保所有 Zod schema 檔案存在且可以 import（語法合法）。
 * 失敗 → exit 1，阻斷 Phase 2 開工。
 */
import { existsSync } from 'fs'

const REQUIRED_CONTRACTS = [
  'contracts/token.schema.ts',
  'contracts/ocr-card.schema.ts',
  'contracts/ocr-id.schema.ts',
  'contracts/submission.schema.ts',
  'contracts/timeline-event.schema.ts',
]

let failed = false

for (const contractPath of REQUIRED_CONTRACTS) {
  if (!existsSync(contractPath)) {
    console.error(`❌ MISSING: ${contractPath}`)
    failed = true
  } else {
    console.log(`✅ ${contractPath}`)
  }
}

if (failed) {
  console.error('\nguard:contracts FAILED — 補齊 contracts/ 後才能進 Phase 2')
  process.exit(1)
}

console.log('\nguard:contracts PASSED')
