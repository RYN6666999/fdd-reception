/**
 * guard:specs
 * 確保每個模組的 SPEC.md 存在且包含八個必要區塊。
 * 失敗 → exit 1，阻斷 Phase 1 開工。
 */
import { readFileSync, existsSync } from 'fs'

const REQUIRED_SPECS = [
  'specs/server.spec.md',
  'specs/client.spec.md',
  'specs/operator.spec.md',
  'specs/admin.spec.md',
]

const REQUIRED_SECTIONS = [
  'Purpose',
  'Non-Goals',
  'I/O Boundaries',
  'State Machine',
  'Failure Modes',
  'Security Constraints',
  'Acceptance Criteria',
  'Out of Scope',
]

let failed = false

for (const specPath of REQUIRED_SPECS) {
  if (!existsSync(specPath)) {
    console.error(`❌ MISSING: ${specPath}`)
    failed = true
    continue
  }

  const content = readFileSync(specPath, 'utf8')
  const missingSections = REQUIRED_SECTIONS.filter(s => !content.includes(`## ${s}`))

  if (missingSections.length > 0) {
    console.error(`❌ ${specPath} 缺少區塊: ${missingSections.join(', ')}`)
    failed = true
  } else {
    console.log(`✅ ${specPath}`)
  }
}

if (failed) {
  console.error('\nguard:specs FAILED — 補齊 SPEC.md 後才能進 Phase 1')
  process.exit(1)
}

console.log('\nguard:specs PASSED')
