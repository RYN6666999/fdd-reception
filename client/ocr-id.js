export async function ocrId(blob) {
  const worker = await Tesseract.createWorker('chi_tra+eng')
  try {
    const url = URL.createObjectURL(blob)
    const { data } = await worker.recognize(url)
    URL.revokeObjectURL(url)

    const text = data.text
    return {
      name: extractChineseName(text),
      id_number: extractIdNumber(text),
      birth_date: extractBirthDate(text),
    }
  } finally {
    await worker.terminate()
  }
}

function extractChineseName(text) {
  const match = text.match(/姓名[：:\s]*([^\n\s]{2,5})/)
  return match?.[1] ?? ''
}

function extractIdNumber(text) {
  const match = text.match(/[A-Z][12]\d{8}/)
  return match?.[0] ?? ''
}

function extractBirthDate(text) {
  const match = text.match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日/)
  if (!match) return ''
  const rocYear = parseInt(match[1])
  const year = rocYear + 1911
  const month = match[2].padStart(2, '0')
  const day = match[3].padStart(2, '0')
  return `${year}-${month}-${day}`
}
