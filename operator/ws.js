export class SessionWS {
  #ws = null
  #tokenId = null
  #listeners = new Map()
  #retryCount = 0
  #maxRetries = 5
  #destroyed = false

  connect(tokenId) {
    this.#tokenId = tokenId
    this.#destroyed = false
    this.#connect()
  }

  #connect() {
    if (this.#destroyed) return
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.#ws = new WebSocket(`${proto}//${location.host}/api/session/${this.#tokenId}/ws`)

    this.#ws.onopen = () => {
      this.#retryCount = 0
      this.#emit('connected', {})
    }

    this.#ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        this.#emit(msg.type, msg)
      } catch {}
    }

    this.#ws.onclose = () => {
      if (this.#destroyed) return
      this.#emit('disconnected', {})
      if (this.#retryCount < this.#maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, this.#retryCount), 16000)
        this.#retryCount++
        setTimeout(() => this.#connect(), delay)
      }
    }
  }

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, [])
    this.#listeners.get(event).push(fn)
  }

  #emit(event, data) {
    this.#listeners.get(event)?.forEach(fn => fn(data))
  }

  destroy() {
    this.#destroyed = true
    this.#ws?.close()
  }
}
