import { AppState } from './state.js'
import { SessionWS } from './ws.js'
import { copyToClipboard, showCopiedFeedback } from './clipboard.js'

const app = new AppState()
const ws = new SessionWS()
let currentToken = null
let cvvValue = null
let qrInstance = null

// ===== Tab 切換 =====
let activeTab = 'current'

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab
    if (tab === activeTab) return
    activeTab = tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
    document.getElementById('tab-current').hidden = (tab !== 'current')
    document.getElementById('tab-history').hidden = (tab !== 'history')
    if (tab === 'history') loadHistory()
  })
})

// ===== View router（限 #tab-current 內） =====
app.on((state, data) => {
  document.querySelectorAll('#tab-current [id^="view-"]').forEach(el => el.hidden = true)
  document.getElementById(`view-${state}`).hidden = false
  if (state === 'error') {
    document.getElementById('view-error').textContent = data?.message ?? '發生錯誤'
  }
})

// ===== WS status =====
ws.on('disconnected', () => { document.getElementById('ws-status').hidden = false })
ws.on('connected', () => { document.getElementById('ws-status').hidden = true })

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
  clearQrCode()
  app.transition('idle')
  alert('連結已失效，可重新發送。')
})

ws.on('snapshot', (msg) => {
  if (msg.status === 'uploaded') {
    app.transition('reviewing', { submission: msg.submission })
    fillReviewingView(msg.submission)
  }
})

// CVV 自動清除
document.addEventListener('visibilitychange', () => { if (document.hidden) clearCvv() })

function clearCvv() {
  cvvValue = null
  const cvvEl = document.querySelector('[data-field="cvv"] .value')
  if (cvvEl) cvvEl.textContent = '••••'
}

function clearQrCode() {
  const container = document.getElementById('qrcode-container')
  container.innerHTML = ''
  qrInstance = null
}

function fillReviewingView(submission) {
  const set = (field, val) => {
    const el = document.querySelector(`[data-field="${field}"] .value`)
    if (el && val) el.textContent = val
  }
  set('name', submission?.ocr_id?.name ?? submission?.name)
  set('id_number', submission?.ocr_id?.id_number ?? submission?.id_number)
  set('birth_date', submission?.ocr_id?.birth_date ?? submission?.birth_date)
  set('card_last4', submission?.ocr_card?.card_number?.slice(-4) ?? submission?.card_number?.slice(-4))
  set('expiry', submission?.ocr_card?.expiry ?? submission?.expiry)
  set('installment', submission?.installment ? `${submission.installment} 期` : '一次付清')
}

// 點欄位複製
document.querySelectorAll('.field').forEach(field => {
  field.addEventListener('click', async () => {
    const val = field.querySelector('.value')?.textContent
    if (!val || val === '••••') return
    const isCvv = field.dataset.field === 'cvv'
    await copyToClipboard(val, { autoClear: isCvv })
    showCopiedFeedback(field.querySelector('.value'))
  })
})

// ===== 發送連結 + 產 QR Code =====
document.getElementById('btn-issue').addEventListener('click', async () => {
  try {
    let operatorId = localStorage.getItem('operator_id')
    if (!operatorId) {
      operatorId = prompt('請輸入業務 ID：')
      if (!operatorId) return
      localStorage.setItem('operator_id', operatorId)
    }

    const res = await fetch('/api/token/issue', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
    if (!res.ok) throw new Error('發送失敗')
    const token = await res.json()
    currentToken = token

    document.getElementById('short-url-display').textContent = token.short_url

    // QR Code
    clearQrCode()
    const container = document.getElementById('qrcode-container')
    // QRCode 是全域變數（從 CDN script 載入）
    if (typeof QRCode !== 'undefined') {
      qrInstance = new QRCode(container, {
        text: token.short_url,
        width: 200,
        height: 200,
        colorDark: '#1a1a1a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      })
    } else {
      container.textContent = token.short_url
    }

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
  clearQrCode()
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
    const formatted = card_number.replace(/(\d{4})/g, '$1 ').trim()
    document.getElementById('full-card-number').textContent = formatted
    app.transition('confirming')
  } catch {
    alert('無法取得卡號，請稍後再試')
  }
})

// 人工確認無誤
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
  clearQrCode()
  ws.destroy()
  currentToken = null
  app.transition('idle')
}

document.getElementById('btn-destroy-reviewing').addEventListener('click', doDestroy)
document.getElementById('btn-done-close').addEventListener('click', doDestroy)

// ===== 歷史記錄 =====
async function loadHistory() {
  const listEl = document.getElementById('history-list')
  listEl.innerHTML = '<p class="loading-text">載入中...</p>'

  const operatorId = localStorage.getItem('operator_id')
  if (!operatorId) {
    listEl.innerHTML = '<p class="loading-text">請先在「目前客戶」頁登入業務 ID。</p>'
    return
  }

  try {
    const res = await fetch('/api/operator/history', {
      headers: { 'Authorization': `Bearer ${operatorId}` }
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const { events } = await res.json()

    if (!events.length) {
      listEl.innerHTML = '<p class="loading-text">尚無記錄。</p>'
      return
    }

    listEl.innerHTML = events.map(ev => {
      const date = new Date(ev.timestamp).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
      const statusClass = ev.status === 'confirmed' ? 'confirmed' : ev.status === 'uploaded' ? 'uploaded' : ''
      const statusText = {
        confirmed: '已確認', uploaded: '待確認',
        issued: '發送中', expired: '已失效',
        destroyed: '已結案',
      }[ev.status] ?? ev.status
      return `
        <div class="history-item">
          <div class="hi-row">
            <span class="hi-label">時間</span>
            <span>${date}</span>
          </div>
          <div class="hi-row">
            <span class="hi-label">狀態</span>
            <span class="history-status ${statusClass}">${statusText}</span>
          </div>
          ${ev.card_last4 ? `<div class="hi-row"><span class="hi-label">卡號末四</span><span>•••• ${ev.card_last4}</span></div>` : ''}
          ${ev.name ? `<div class="hi-row"><span class="hi-label">姓名</span><span>${ev.name}</span></div>` : ''}
        </div>
      `
    }).join('')
  } catch (err) {
    listEl.innerHTML = `<p class="loading-text">載入失敗（${err.message}）</p>`
  }
}
