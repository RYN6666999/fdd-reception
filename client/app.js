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
    await processCapture(canvas, container, fieldsId, btnNextId, photoType)
  }

  fileInput.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    stopCamera(cameraStream)
    const canvas = await fileToCanvas(file)
    await processCapture(canvas, container, fieldsId, btnNextId, photoType)
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

    if (result.ocr && fieldsId) {
      fillOcrFields(photoType, result.ocr)
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
  } catch {
    // network error — let user continue, submit will catch
  }

  showView('wizard')
  goToStep(0)

  await setupCapture(0, 'capture-id-front', 'btn-capture-id-front', 'file-id-front', 'fields-id-front', 'btn-next-0', 'id_front')
  setupNextButton('btn-next-0', null, () => goToStep(1))

  await setupCapture(1, 'capture-id-back', 'btn-capture-id-back', 'file-id-back', null, 'btn-next-1', 'id_back')
  setupNextButton('btn-next-1', null, () => goToStep(2))

  await setupCapture(2, 'capture-card-front', 'btn-capture-card-front', 'file-card-front', 'fields-card-front', 'btn-next-2', 'card_front')
  setupNextButton('btn-next-2', null, () => goToStep(3))

  await setupCapture(3, 'capture-card-back', 'btn-capture-card-back', 'file-card-back', null, 'btn-next-3', 'card_back')
  document.getElementById('card-cvv').addEventListener('input', (e) => {
    document.getElementById('btn-next-3').disabled = e.target.value.length < 3
  })
  setupNextButton('btn-next-3', null, () => {
    fillConfirm()
    goToStep(4)
  })

  document.getElementById('btn-back-to-edit').onclick = () => goToStep(2)

  document.getElementById('btn-submit').onclick = async () => {
    const btn = document.getElementById('btn-submit')
    btn.disabled = true
    btn.textContent = '送出中...'
    try {
      await doSubmit()
      showView('view-done')
    } catch (err) {
      console.error('[app] submit_failed:', err)
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
