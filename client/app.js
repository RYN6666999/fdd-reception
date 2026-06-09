import { startCamera, stopCamera, captureFrame, fileToCanvas } from './camera.js'
import { applyWatermark, sha256, canvasToBlob } from './watermark.js'
import { ocrCard } from './ocr-card.js'
import { ocrId } from './ocr-id.js'
import { luhn, validateTwId, notExpired, setError, clearError } from './validate.js'
import { submitData } from './api.js'

const tokenId = new URLSearchParams(location.search).get('token')
let currentStep = 0
let cameraStream = null
const collectedData = {
  idFrontBlob: null, idBackBlob: null,
  cardFrontBlob: null, cardBackBlob: null,
  photoHashes: [],
  ocr: {}
}

// --- View helpers ---
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

// --- Camera helpers ---
async function setupCapture(stepNum, videoContainerId, btnCaptureId, fileInputId, fieldsId, btnNextId, processCallback) {
  const container = document.getElementById(videoContainerId)
  const btnCapture = document.getElementById(btnCaptureId)
  const fileInput = document.getElementById(fileInputId)

  let video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;'

  try {
    cameraStream = await startCamera(video)
    container.innerHTML = ''
    container.appendChild(video)
  } catch {
    btnCapture.hidden = true
  }

  btnCapture.onclick = async () => {
    const canvas = captureFrame(video)
    stopCamera(cameraStream)
    await processCapture(canvas, container, fieldsId, btnNextId, processCallback)
  }

  fileInput.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    stopCamera(cameraStream)
    const canvas = await fileToCanvas(file)
    await processCapture(canvas, container, fieldsId, btnNextId, processCallback)
  }
}

async function processCapture(canvas, container, fieldsId, btnNextId, processCallback) {
  const preview = document.createElement('img')
  preview.style.cssText = 'width:100%;height:100%;object-fit:cover;'
  container.innerHTML = ''

  const { blob, hash } = await applyWatermark(canvas, tokenId)
  collectedData.photoHashes.push(hash)

  preview.src = URL.createObjectURL(blob)
  container.appendChild(preview)

  if (fieldsId) {
    const fields = document.getElementById(fieldsId)
    if (fields) fields.hidden = false
    processCallback(blob, hash)
  }

  document.getElementById(btnNextId).disabled = false
  return blob
}

// --- OCR handlers ---
async function processIdFront(blob) {
  try {
    const result = await ocrId(blob)
    if (result.name) document.getElementById('id-name').value = result.name
    if (result.id_number) document.getElementById('id-number').value = result.id_number
    if (result.birth_date) document.getElementById('id-birth').value = result.birth_date
    collectedData.ocr.idFront = result
  } catch {}
}

async function processCardFront(blob) {
  try {
    const result = await ocrCard(blob)
    if (result.card_number) document.getElementById('card-number').value = result.card_number.replace(/(.{4})/g, '$1 ').trim()
    if (result.expiry) document.getElementById('card-expiry').value = result.expiry
    if (result.holder_name) document.getElementById('card-holder').value = result.holder_name
    collectedData.ocr.cardFront = result
  } catch {}
}

async function processCardBack(blob) {
  try {
    const worker = await Tesseract.createWorker('eng')
    const url = URL.createObjectURL(blob)
    const { data } = await worker.recognize(url)
    URL.revokeObjectURL(url)
    await worker.terminate()
    const cvvMatch = data.text.match(/\b\d{3,4}\b/)
    if (cvvMatch) document.getElementById('card-cvv').value = cvvMatch[0]
  } catch {}
}

// --- Step navigation ---
function setupNextButton(btnId, validator, onNext) {
  const btn = document.getElementById(btnId)
  btn.onclick = () => {
    if (validator && !validator()) return
    onNext()
  }
}

// --- Init ---
async function init() {
  if (!tokenId) {
    showView('view-invalid')
    return
  }

  // /open 只是狀態追蹤，非同步 fire-and-forget
  // 失敗不擋住客戶填表（只有真正 expired/destroyed 才顯示失效）
  try {
    const res = await fetch(`/api/token/${tokenId}/open`, { method: 'POST' })
    if (res.status === 410) {
      // 410 = expired 或 destroyed，才真正拒絕
      showView('view-invalid')
      return
    }
  } catch {
    // 網路問題也讓客戶繼續，submit 時再擋
  }

  showView('wizard')
  goToStep(0)

  // Setup step 0: 身分證正面
  await setupCapture(0, 'capture-id-front', 'btn-capture-id-front', 'file-id-front', 'fields-id-front', 'btn-next-0', processIdFront)
  setupNextButton('btn-next-0', null, () => goToStep(1))

  // Setup step 1: 身分證背面（拍完即可下一步，無 OCR fields）
  await setupCapture(1, 'capture-id-back', 'btn-capture-id-back', 'file-id-back', null, 'btn-next-1', () => {})
  setupNextButton('btn-next-1', null, () => goToStep(2))

  // Setup step 2: 信用卡正面
  await setupCapture(2, 'capture-card-front', 'btn-capture-card-front', 'file-card-front', 'fields-card-front', 'btn-next-2', processCardFront)
  setupNextButton('btn-next-2', null, () => goToStep(3))

  // Setup step 3: 信用卡背面 + CVV
  await setupCapture(3, 'capture-card-back', 'btn-capture-card-back', 'file-card-back', null, 'btn-next-3', processCardBack)
  document.getElementById('card-cvv').addEventListener('input', (e) => {
    document.getElementById('btn-next-3').disabled = e.target.value.length < 3
  })
  setupNextButton('btn-next-3', null, () => {
    fillConfirm()
    goToStep(4)
  })

  // Step 4: 確認送出
  document.getElementById('btn-back-to-edit').onclick = () => goToStep(2)

  document.getElementById('btn-submit').onclick = async () => {
    const btn = document.getElementById('btn-submit')
    btn.disabled = true
    btn.textContent = '送出中...'
    try {
      await doSubmit()
      showView('view-done')
    } catch (err) {
      btn.disabled = false
      btn.textContent = '確認送出'
      alert(err.message === 'ALREADY_SUBMITTED' ? '資料已送出，請勿重複操作。' : '送出失敗，請重試。')
    }
  }
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

  await submitData(tokenId, {
    card_number: cardNum,
    expiry: document.getElementById('card-expiry').value,
    holder_name: document.getElementById('card-holder').value || undefined,
    name: document.getElementById('id-name').value,
    id_number: document.getElementById('id-number').value,
    birth_date: document.getElementById('id-birth').value,
    installment: document.getElementById('card-installment').value || undefined,
    extra_photo_hashes: collectedData.photoHashes.slice(1),
  }, collectedData.idFrontBlob || new Blob(), photoHash)

  if (cvv) {
    await fetch(`/api/token/${tokenId}/cvv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: tokenId, cvv }),
    })
  }
}

// 修正 wizard-track 寬度（動態計算）
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
