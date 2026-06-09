import { AppState } from './state.js'
import { startCamera, stopCamera, captureFrame, fileToCanvas } from './camera.js'
import { applyWatermark } from './watermark.js'
import { ocrCard } from './ocr-card.js'
import { ocrId } from './ocr-id.js'
import { luhn, validateTwId, notExpired, setError, clearError } from './validate.js'
import { submitData } from './api.js'

const tokenId = new URLSearchParams(location.search).get('token')
const app = new AppState()
let cameraStream = null

// View router
app.on((state, data) => {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.hidden = true)
  const view = document.getElementById(`view-${state}`)
  if (view) view.hidden = false
  if (state === 'error') {
    document.getElementById('view-error').textContent = data.message ?? '發生錯誤'
  }
})

async function init() {
  if (!tokenId) { app.transition('invalid'); return }

  try {
    const res = await fetch(`/api/token/${tokenId}/open`, { method: 'POST' })
    if (!res.ok) { app.transition('invalid'); return }
    app.transition('capture')
    initCapture()
  } catch {
    app.transition('error', { message: '網路錯誤，請稍後再試' })
  }
}

function initCapture() {
  const video = document.getElementById('camera-preview')
  const btnCapture = document.getElementById('btn-capture')
  const fileInput = document.querySelector('#btn-upload input')

  startCamera(video).then(stream => { cameraStream = stream }).catch(() => {
    video.hidden = true
    btnCapture.hidden = true
  })

  btnCapture.addEventListener('click', async () => {
    const canvas = captureFrame(video)
    await processImage(canvas)
  })

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const canvas = await fileToCanvas(file)
    await processImage(canvas)
  })
}

async function processImage(canvas) {
  app.transition('loading')
  try {
    const { blob, hash } = await applyWatermark(canvas, tokenId)
    stopCamera(cameraStream)

    const [cardResult, idResult] = await Promise.allSettled([
      ocrCard(blob),
      ocrId(blob),
    ])

    app.transition('confirm', {
      photo_blob: blob,
      photo_hash: hash,
      ocr_card: cardResult.status === 'fulfilled' ? cardResult.value : {},
      ocr_id: idResult.status === 'fulfilled' ? idResult.value : {},
    })

    prefillForm(app.data)
  } catch (err) {
    app.transition('error', { message: '處理圖片時發生錯誤' })
  }
}

function prefillForm(data) {
  const f = document.getElementById('form-confirm')
  if (data.ocr_card?.card_number) f.card_number.value = data.ocr_card.card_number
  if (data.ocr_card?.expiry) f.expiry.value = data.ocr_card.expiry
  if (data.ocr_id?.id_number) f.id_number.value = data.ocr_id.id_number
  if (data.ocr_id?.name) f.name.value = data.ocr_id.name
  if (data.ocr_id?.birth_date) f.birth_date.value = data.ocr_id.birth_date
}

// Phase 4 補完 form submit handler
document.getElementById('form-confirm')?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target
  let valid = true

  // 卡號驗證
  const cardNum = f.card_number.value.replace(/\s|-/g, '')
  if (!luhn(cardNum)) {
    setError(f.card_number, '卡號無效')
    valid = false
  } else clearError(f.card_number)

  // 到期日驗證
  if (!notExpired(f.expiry.value)) {
    setError(f.expiry, '卡片已過期')
    valid = false
  } else clearError(f.expiry)

  // 身分證驗證
  if (!validateTwId(f.id_number.value)) {
    setError(f.id_number, '身分證字號無效')
    valid = false
  } else clearError(f.id_number)

  if (!valid) return

  const { photo_blob, photo_hash } = app.data
  if (!photo_blob || !photo_hash) {
    app.transition('error', { message: '請重新拍照' })
    return
  }

  try {
    await submitData(tokenId, {
      card_number: f.card_number.value,
      expiry: f.expiry.value,
      holder_name: f.holder_name?.value,
      name: f.name.value,
      id_number: f.id_number.value,
      birth_date: f.birth_date.value,
      installment: f.installment?.value,
    }, photo_blob, photo_hash)

    // CVV 送出：透過單獨的 fetch（不存 DB）
    if (f.cvv.value) {
      await fetch(`/api/token/${tokenId}/cvv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_id: tokenId, cvv: f.cvv.value }),
      })
      f.cvv.value = ''
    }

    app.transition('done')
  } catch (err) {
    if (err.message === 'ALREADY_SUBMITTED') {
      app.transition('error', { message: '資料已送出，請勿重複操作。' })
    } else {
      app.transition('error', { message: '送出失敗，請重試。' })
    }
  }
})

init()
