export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  })
  videoEl.srcObject = stream
  await videoEl.play()
  return stream
}

export function stopCamera(stream) {
  stream?.getTracks().forEach(t => t.stop())
}

export function captureFrame(videoEl) {
  const canvas = document.createElement('canvas')
  const maxDim = 2048
  let w = videoEl.videoWidth, h = videoEl.videoHeight
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h)
  return canvas
}

export function fileToCanvas(file) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxDim = 2048
      let w = img.width, h = img.height
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      resolve(canvas)
    }
    img.src = URL.createObjectURL(file)
  })
}
