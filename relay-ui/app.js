const timeline = document.getElementById('timeline')
const typing = document.getElementById('typing')
const composer = document.getElementById('composer')
const messageInput = document.getElementById('messageInput')
const sendBtn = document.getElementById('sendBtn')
const installBtn = document.getElementById('installBtn')

let deferredInstallPrompt = null

function nowLabel() {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function appendParagraphWithBreaks(target, text) {
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    target.append(document.createTextNode(lines[i]))
    if (i < lines.length - 1) target.append(document.createElement('br'))
  }
}

function addMessage(role, text) {
  const article = document.createElement('article')
  article.className = `msg ${role}`

  const p = document.createElement('p')
  appendParagraphWithBreaks(p, text)

  const time = document.createElement('time')
  time.textContent = nowLabel()

  article.append(p, time)
  timeline.append(article)
  timeline.scrollTop = timeline.scrollHeight
}

function setSending(isSending) {
  sendBtn.disabled = isSending
  messageInput.disabled = isSending
  typing.hidden = !isSending
}

async function sendMessage(text) {
  const response = await fetch('/c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      conv: 'web',
      uid: 'ryan',
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `http_${response.status}`)
  }

  return payload
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault()

  const text = messageInput.value.trim()
  if (!text) return

  messageInput.value = ''
  addMessage('user', text)
  setSending(true)

  try {
    const payload = await sendMessage(text)
    addMessage('bot', payload.reply || '(靜默)')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    addMessage('bot', `連線異常：${msg}`)
  } finally {
    setSending(false)
    messageInput.focus()
  }
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // no-op: service worker registration failure should not block chat.
  })
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredInstallPrompt = event
  installBtn.hidden = false
})

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return
  deferredInstallPrompt.prompt()
  await deferredInstallPrompt.userChoice
  deferredInstallPrompt = null
  installBtn.hidden = true
})

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  installBtn.hidden = true
})
