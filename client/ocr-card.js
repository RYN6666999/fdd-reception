// Tesseract.js 從 CDN 載入，此模組假設 Tesseract 已在 window 上
export async function ocrCard(blob) {
  const worker = await Tesseract.createWorker('eng')
  try {
    const url = URL.createObjectURL(blob)
    const { data } = await worker.recognize(url)
    URL.revokeObjectURL(url)

    const text = data.text
    const cardNumber = extractCardNumber(text)
    const expiry = extractExpiry(text)
    const holderName = extractHolderName(text)

    return { card_number: cardNumber, expiry, holder_name: holderName }
  } finally {
    await worker.terminate()
  }
}

function extractCardNumber(text) {
  const match = text.replace(/\s/g, '').match(/\d{16}/)
  if (match) return match[0]
  const spaced = text.match(/\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}/)
  return spaced ? spaced[0].replace(/[\s-]/g, '') : null
}

function extractExpiry(text) {
  const match = text.match(/(\d{2})\/(\d{2,4})/)
  return match ? match[0] : null
}

function extractHolderName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const nameLine = lines.reverse().find(l => /^[A-Z ]+$/.test(l) && l.length > 3)
  return nameLine || undefined
}
