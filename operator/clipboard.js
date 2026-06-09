export async function copyToClipboard(text, { autoClear = false } = {}) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // fallback
    window.prompt('請手動複製：', text)
  }
  if (autoClear) {
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {})
    }, 60_000)
  }
}

export function showCopiedFeedback(el) {
  const original = el.textContent
  el.textContent = '已複製'
  setTimeout(() => { el.textContent = original }, 1000)
}
