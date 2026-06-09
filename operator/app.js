import { AppState } from './state.js'
import { SessionWS } from './ws.js'
import { copyToClipboard, showCopiedFeedback } from './clipboard.js'

const app = new AppState()
const ws = new SessionWS()
let currentToken = null
let cvvValue = null

// View router
app.on((state, data) => {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.hidden = true)
  document.getElementById(`view-${state}`).hidden = false
  if (state === 'error') {
    document.getElementById('view-error').textContent = data.message ?? '發生錯誤'
  }
})

// WS status badge
ws.on('disconnected', () => { document.getElementById('ws-status').hidden = false })
ws.on('connected', () => { document.getElementById('ws-status').hidden = true })

// WS events
ws.on('uploaded', (msg) => {
  app.transition('reviewing', { submission: msg.submission })
  fillReviewingView(msg.submission)
  if (msg.cvv) {
    cvvValue = msg.cvv
    document.querySelector('[data-field="cvv"] .value').textContent = msg.cvv
  }
})

ws.on('expired', () => {
  currentToken = null
  cvvValue = null
  app.transition('idle')
  alert('連結已失效，可重新發送。')
})

ws.on('snapshot', (msg) => {
  if (msg.status === 'uploaded') {
    app.transition('reviewing', { submission: msg.submission })
    fillReviewingView(msg.submission)
  }
})

// 清除 CVV（換頁或切 tab）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearCvv()
})

function clearCvv() {
  cvvValue = null
  const cvvEl = document.querySelector('[data-field="cvv"] .value')
  if (cvvEl) cvvEl.textContent = '••••'
}

function fillReviewingView(submission) {
  const set = (field, val) => {
    const el = document.querySelector(`[data-field="${field}"] .value`)
    if (el && val) el.textContent = val
  }
  set('name', submission?.ocr_id?.name)
  set('id_number', submission?.ocr_id?.id_number)
  set('birth_date', submission?.ocr_id?.birth_date)
  set('card_last4', submission?.ocr_card?.card_number?.slice(-4))
  set('expiry', submission?.ocr_card?.expiry)
  set('installment', submission?.installment ? `${submission.installment} 期` : '一次付清')
}

// 點欄位複製
document.querySelectorAll('.field').forEach(field => {
  field.addEventListener('click', async () => {
    const val = field.querySelector('.value')?.textContent
    if (!val || val === '••••') return
    const fieldName = field.dataset.field
    const iscvv = fieldName === 'cvv'
    await copyToClipboard(val, { autoClear: iscvv })
    showCopiedFeedback(field.querySelector('.value'))
  })
})

// 發送連結
document.getElementById('btn-issue').addEventListener('click', async () => {
  try {
    const operatorId = localStorage.getItem('operator_id') || prompt('請輸入業務 ID：')
    if (!operatorId) return
    localStorage.setItem('operator_id', operatorId)

    const res = await fetch('/api/token/issue', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
    if (!res.ok) throw new Error('發送失敗')
    const token = await res.json()
    currentToken = token

    document.getElementById('short-url-display').textContent = token.short_url
    await copyToClipboard(token.short_url)
    app.transition('waiting', { token })
    ws.connect(token.id)
  } catch (err) {
    app.transition('error', { message: err.message })
  }
})

document.getElementById('btn-copy-url').addEventListener('click', async () => {
  const url = currentToken?.short_url
  if (url) {
    await copyToClipboard(url)
    showCopiedFeedback(document.getElementById('btn-copy-url'))
  }
})

document.getElementById('btn-cancel-waiting').addEventListener('click', () => {
  ws.destroy()
  currentToken = null
  app.transition('idle')
})

// 確認看全號（進入 confirming 阻斷狀態）
document.getElementById('btn-show-full-card').addEventListener('click', async () => {
  try {
    const operatorId = localStorage.getItem('operator_id')
    const res = await fetch(`/api/token/${currentToken.id}/card`, {
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
    if (!res.ok) throw new Error()
    const { card_number } = await res.json()
    // 格式化：每4碼一組
    const formatted = card_number.replace(/(\d{4})/g, '$1 ').trim()
    document.getElementById('full-card-number').textContent = formatted
    app.transition('confirming')
  } catch {
    alert('無法取得卡號，請稍後再試')
  }
})

// 人工確認無誤 → confirm()
document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
  try {
    const operatorId = localStorage.getItem('operator_id')
    await fetch(`/api/token/${currentToken.id}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
    clearCvv()
    document.getElementById('full-card-number').textContent = ''
    app.transition('done')
  } catch {
    alert('確認失敗，請重試')
  }
})

// 資料有誤 → 回 reviewing
document.getElementById('btn-confirm-back').addEventListener('click', () => {
  document.getElementById('full-card-number').textContent = ''
  app.transition('reviewing')
})

// 結案
async function doDestroy() {
  try {
    const operatorId = localStorage.getItem('operator_id')
    await fetch(`/api/token/${currentToken?.id}/destroy`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
  } catch {}
  clearCvv()
  ws.destroy()
  currentToken = null
  app.transition('idle')
}

document.getElementById('btn-destroy-reviewing').addEventListener('click', doDestroy)
document.getElementById('btn-done-close').addEventListener('click', doDestroy)
