import { startCamera, stopCamera, captureFrame, fileToCanvas } from './camera.js'
import { applyWatermark, sha256, canvasToBlob } from './watermark.js'
import { luhn, validateTwId, notExpired, setError, clearError } from './validate.js'
import { uploadPhoto, submitData } from './api.js'

const tokenId = new URLSearchParams(location.search).get('token')
let currentStep = 0
let cameraStream = null
const collectedData = {
  photoHashes: [],
  ocr: {},
  uploadedTypes: new Set(),
}

function showView(id) {
  ['view-loading','view-invalid','view-error','wizard','view-done'].forEach(v => {
    const el = document.getElementById(v)
    if (el) el.hidden = (v !== id)
  })
}

function goToStep(n) {
  currentStep = n
  const track = document.getElementById('wizard-track')
  const stepWidth = Math.min(window.innerWidth, 480)
  track.style.transform = `translateX(-${n * stepWidth}px)`
  updateProgress(n)
}

function updateProgress(n) {
  document.querySelectorAll('.progress-dot').forEach((dot, i) => {
    dot.classList.toggle('done', i < n)
    dot.classList.toggle('active', i === n)
  })
}

async function setupCapture(stepNum, videoContainerId, btnCaptureId, fileInputId, fieldsId, btnNextId, photoType) {
  const container = document.getElementById(videoContainerId)
  const btnCapture = document.getElementById(btnCaptureId)
  const fileInput = document.getElementById(fileInputId)

  let video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;'

  // 先接事件再等相機：權限對話框 pending 時「從相簿選擇」仍要可用
  btnCapture.disabled = true
  btnCapture.onclick = async () => {
    const canvas = captureFrame(video)
    stopCamera(cameraStream)
    await processCapture(canvas, container, fieldsId, btnNextId, photoType)
  }

  fileInput.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    stopCamera(cameraStream)
    const canvas = await fileToCanvas(file)
    await processCapture(canvas, container, fieldsId, btnNextId, photoType)
  }

  try {
    cameraStream = await startCamera(video)
    container.innerHTML = ''
    container.appendChild(video)
    // 相機就緒才開放拍照鈕，避免拍出黑畫面
    btnCapture.disabled = false
  } catch {
    btnCapture.hidden = true
  }
}

async function processCapture(canvas, container, fieldsId, btnNextId, photoType) {
  const preview = document.createElement('img')
  preview.style.cssText = 'width:100%;height:100%;object-fit:cover;'
  container.innerHTML = ''

  const { blob, hash } = await applyWatermark(canvas, tokenId)
  collectedData.photoHashes.push(hash)

  preview.src = URL.createObjectURL(blob)
  container.appendChild(preview)

  const btnNext = document.getElementById(btnNextId)
  btnNext.disabled = true
  btnNext.textContent = '上傳中...'

  try {
    const result = await uploadPhoto(tokenId, blob, photoType)
    collectedData.uploadedTypes.add(photoType)

    if (result.ocr) {
      fillOcrFields(photoType, result.ocr)
    }

    if (result.ocr_failed && photoType === 'card_front') {
      const fields = document.getElementById(fieldsId)
      if (fields && !fields.querySelector('.ocr-hint')) {
        const hint = document.createElement('p')
        hint.className = 'ocr-hint'
        hint.style.cssText = 'font-size:0.85em;'
        hint.textContent = '自動辨識未成功。新式卡片的卡號常印在背面，下一步拍背面時會自動帶入；也可直接手動輸入。'
        fields.prepend(hint)
      }
    }

    if (fieldsId) {
      const fields = document.getElementById(fieldsId)
      if (fields) fields.hidden = false
    }

    btnNext.disabled = false
    btnNext.textContent = '下一步'
  } catch (err) {
    console.error('[app] upload_failed:', err)
    btnNext.disabled = false
    btnNext.textContent = '下一步（上傳失敗，可重拍）'
  }
}

function fillOcrFields(photoType, ocr) {
  if (photoType === 'id_front') {
    if (ocr.name) document.getElementById('id-name').value = ocr.name
    if (ocr.id_number) document.getElementById('id-number').value = ocr.id_number
    if (ocr.birth_date) document.getElementById('id-birth').value = ocr.birth_date
    collectedData.ocr.idFront = ocr
  } else if (photoType === 'card_front') {
    if (ocr.card_number) document.getElementById('card-number').value = ocr.card_number.replace(/(.{4})/g, '$1 ').trim()
    if (ocr.expiry) document.getElementById('card-expiry').value = ocr.expiry
    if (ocr.holder_name) document.getElementById('card-holder').value = ocr.holder_name
    collectedData.ocr.cardFront = ocr
  } else if (photoType === 'card_back') {
    // 新式卡片卡號印在背面：正面沒讀到的欄位用背面結果補
    const numEl = document.getElementById('card-number')
    if (ocr.card_number && !numEl.value.replace(/\D/g, '')) {
      numEl.value = ocr.card_number.replace(/(.{4})/g, '$1 ').trim()
    }
    const expEl = document.getElementById('card-expiry')
    if (ocr.expiry && !expEl.value) expEl.value = ocr.expiry
  }
}

function setupNextButton(btnId, validator, onNext) {
  const btn = document.getElementById(btnId)
  btn.onclick = () => {
    if (validator && !validator()) return
    onNext()
  }
}

async function init() {
  if (!tokenId) {
    showView('view-invalid')
    return
  }

  try {
    const res = await fetch(`/api/token/${tokenId}/open`, { method: 'POST' })
    if (res.status === 410) {
      showView('view-invalid')
      return
    }
    const opened = await res.json()
    if (opened.expires_at) startTtlCountdown(opened.expires_at)
  } catch {
    // network error — let user continue, submit will catch
  }

  showView('wizard')
  goToStep(0)

  // 導覽/欄位/送出的接線不依賴相機，必須先完成
  // （相機權限對話框 pending 會卡住 await，不能把這些排在它後面）
  setupNextButton('btn-next-0', null, () => goToStep(1))
  setupNextButton('btn-next-1', null, () => goToStep(2))
  setupNextButton('btn-next-2', null, () => goToStep(3))
  document.getElementById('card-cvv').addEventListener('input', (e) => {
    document.getElementById('btn-next-3').disabled = e.target.value.length < 3
  })
  formatCardNumberInput(document.getElementById('card-number'))
  formatExpiryInput(document.getElementById('card-expiry'))

  setupNextButton('btn-next-3', null, () => {
    fillConfirm()
    goToStep(4)
  })

  // 相機初始化各自獨立進行，失敗或 pending 都不阻斷其他功能
  setupCapture(0, 'capture-id-front', 'btn-capture-id-front', 'file-id-front', 'fields-id-front', 'btn-next-0', 'id_front')
  setupCapture(1, 'capture-id-back', 'btn-capture-id-back', 'file-id-back', null, 'btn-next-1', 'id_back')
  setupCapture(2, 'capture-card-front', 'btn-capture-card-front', 'file-card-front', 'fields-card-front', 'btn-next-2', 'card_front')
  setupCapture(3, 'capture-card-back', 'btn-capture-card-back', 'file-card-back', null, 'btn-next-3', 'card_back')

  document.getElementById('btn-back-to-edit').onclick = () => goToStep(2)

  document.getElementById('btn-submit').onclick = async () => {
    const btn = document.getElementById('btn-submit')
    const fieldError = validateBeforeSubmit()
    if (fieldError) {
      alert(fieldError)
      goToStep(fieldError.includes('身分證') || fieldError.includes('姓名') || fieldError.includes('生日') ? 0 : 2)
      return
    }
    btn.disabled = true
    btn.textContent = '送出中...'
    try {
      await doSubmit()
      if (ttlTimer) clearInterval(ttlTimer)
      document.getElementById('ttl-banner').hidden = true
      showView('view-done')
    } catch (err) {
      console.error('[app] submit_failed:', err)
      btn.disabled = false
      btn.textContent = '確認送出'
      const messages = {
        ALREADY_SUBMITTED: '資料已送出，請勿重複操作。',
        TOKEN_EXPIRED: '連結已逾時（超過 10 分鐘），請聯繫業務人員重新發送。',
        VALIDATION_FAILED: '資料驗證未通過，請回上一步檢查卡號、有效期限與身分證字號。',
        PHOTO_MISSING: '有照片未上傳成功，請回前面步驟重拍。',
      }
      alert(messages[err.message] ?? '送出失敗，請檢查網路後重試。')
      if (err.message === 'TOKEN_EXPIRED') showView('view-invalid')
    }
  }
}

let ttlTimer = null

function startTtlCountdown(expiresAtIso) {
  const banner = document.getElementById('ttl-banner')
  const expiresAt = new Date(expiresAtIso).getTime()

  const tick = () => {
    const remainMs = expiresAt - Date.now()
    if (remainMs <= 0) {
      clearInterval(ttlTimer)
      banner.hidden = true
      alert('連結已逾時（10 分鐘），請聯繫業務人員重新發送。')
      showView('view-invalid')
      return
    }
    const m = Math.floor(remainMs / 60000)
    const s = Math.floor((remainMs % 60000) / 1000)
    banner.textContent = remainMs < 2 * 60000
      ? `⚠️ 連結即將逾時，剩 ${m}:${String(s).padStart(2, '0')}，請盡快送出`
      : `連結有效時間剩 ${m}:${String(s).padStart(2, '0')}`
    banner.hidden = false
  }
  tick()
  ttlTimer = setInterval(tick, 1000)
}

// 卡號輸入自動四碼分組（1234 5678 9012 3456）
function formatCardNumberInput(inputEl) {
  inputEl.setAttribute('inputmode', 'numeric')
  inputEl.addEventListener('input', () => {
    const digits = inputEl.value.replace(/\D/g, '').slice(0, 16)
    inputEl.value = digits.replace(/(.{4})/g, '$1 ').trim()
  })
}

// 有效期限自動補斜線（10/28）
function formatExpiryInput(inputEl) {
  inputEl.setAttribute('inputmode', 'numeric')
  inputEl.addEventListener('input', () => {
    const digits = inputEl.value.replace(/\D/g, '').slice(0, 4)
    inputEl.value = digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
  })
}

// 送出前欄位檢核，回傳第一個錯誤訊息（null = 全過）
function validateBeforeSubmit() {
  const cardNum = document.getElementById('card-number').value.replace(/\s/g, '')
  if (!luhn(cardNum)) return '卡號有誤（檢查碼不符），請核對 16 碼卡號。'
  const expiry = document.getElementById('card-expiry').value
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return '有效期限格式應為 MM/YY（例如 10/28）。'
  if (!notExpired(expiry)) return `有效期限 ${expiry} 已過期，請確認卡片背面或正面的到期日。`
  const idNum = document.getElementById('id-number').value
  if (!validateTwId(idNum)) return '身分證字號檢核失敗，請核對。'
  if (!document.getElementById('id-name').value.trim()) return '請填寫姓名。'
  if (!document.getElementById('id-birth').value) return '請填寫生日。'
  return null
}

function fillConfirm() {
  document.getElementById('confirm-name').textContent = document.getElementById('id-name').value
  document.getElementById('confirm-id-number').textContent = document.getElementById('id-number').value
  document.getElementById('confirm-birth').textContent = document.getElementById('id-birth').value
  const cn = document.getElementById('card-number').value.replace(/\s/g, '')
  document.getElementById('confirm-card-number').textContent = cn.slice(0,4) + ' •••• •••• ' + cn.slice(-4)
  document.getElementById('confirm-expiry').textContent = document.getElementById('card-expiry').value
  const inst = document.getElementById('card-installment').value
  document.getElementById('confirm-installment').textContent = inst ? `${inst} 期` : '一次付清'
}

async function doSubmit() {
  const cardNum = document.getElementById('card-number').value.replace(/\s/g, '')
  const cvv = document.getElementById('card-cvv').value
  const photoHash = collectedData.photoHashes[0] ?? ''

  const requiredTypes = ['id_front', 'id_back', 'card_front', 'card_back']
  const missing = requiredTypes.filter(t => !collectedData.uploadedTypes.has(t))
  if (missing.length > 0) {
    throw new Error('PHOTO_MISSING')
  }

  await submitData(tokenId, {
    token_id: tokenId,
    ocr_card: {
      card_number: cardNum,
      expiry: document.getElementById('card-expiry').value,
      holder_name: document.getElementById('card-holder').value || undefined,
    },
    ocr_id: {
      name: document.getElementById('id-name').value,
      id_number: document.getElementById('id-number').value,
      birth_date: document.getElementById('id-birth').value,
    },
    installment: document.getElementById('card-installment').value ? parseInt(document.getElementById('card-installment').value) : undefined,
    photo_hash: photoHash,
  })

  if (cvv) {
    await fetch(`/api/token/${tokenId}/cvv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: tokenId, cvv }),
    })
  }
}

function fixTrackWidth() {
  const track = document.getElementById('wizard-track')
  if (!track) return
  const stepWidth = Math.min(window.innerWidth, 480)
  document.querySelectorAll('.wizard-step').forEach(s => {
    s.style.width = stepWidth + 'px'
  })
  track.style.width = (stepWidth * 5) + 'px'
  track.style.transform = `translateX(-${currentStep * stepWidth}px)`
}

window.addEventListener('resize', fixTrackWidth)
document.addEventListener('DOMContentLoaded', fixTrackWidth)

init()
