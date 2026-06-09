/**
 * guard:contracts
 * 確保所有 Zod schema 檔案存在，並跑 bun test contracts/ 驗證正確性。
 * 失敗 → exit 1，阻斷 Phase 2 開工。
 */
import { existsSync } from 'fs'
import { execSync } from 'child_process'

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

if (!failed) {
  // 跑 contract tests
  try {
    const result = execSync('bun test contracts/ 2>&1', { encoding: 'utf8' })
    const passMatch = result.match(/(\d+) pass/)
    const failMatch = result.match(/(\d+) fail/)
    if (failMatch && parseInt(failMatch[1]) > 0) {
      console.error(`❌ Contract tests: ${failMatch[1]} failed`)
      console.error(result)
      failed = true
    } else {
      console.log(`✅ Contract tests: ${passMatch?.[1] ?? '?'} passed`)
    }
  } catch (e) {
    console.error('❌ Contract tests failed to run:', e.message)
    failed = true
  }
}

if (failed) {
  console.error('\nguard:contracts FAILED')
  process.exit(1)
}
console.log('\nguard:contracts PASSED')
