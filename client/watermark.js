export async function applyWatermark(canvas, tokenId) {
  const ctx = canvas.getContext('2d')
  const text = `限業務使用 · ${new Date().toLocaleString('zh-TW')} · ${tokenId.slice(-6)}`

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 4)

  ctx.font = `bold ${Math.max(20, canvas.width / 25)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.strokeStyle = 'rgba(0,0,0,0.8)'
  ctx.lineWidth = 4
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(text, 0, 0)

  ctx.restore()

  const blob = await canvasToBlob(canvas)
  const hash = await sha256(blob)
  return { canvas, blob, hash }
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

export async function sha256(blob) {
  const buf = await blob.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
