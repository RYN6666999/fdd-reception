export class SessionRoom {
  private sessions: Set<WebSocket> = new Set()
  private snapshot: Record<string, unknown> = {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket 升級
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.accept()
      this.sessions.add(server)

      // 新連線立即推送 snapshot
      if (Object.keys(this.snapshot).length > 0) {
        server.send(JSON.stringify({ type: 'snapshot', ...this.snapshot }))
      }

      server.addEventListener('close', () => this.sessions.delete(server))
      server.addEventListener('error', () => this.sessions.delete(server))

      return new Response(null, { status: 101, webSocket: client })
    }

    // 內部廣播端點
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const msg = await request.json() as Record<string, unknown>

      // 更新 snapshot（CVV 不存）
      if (msg.type !== 'cvv') {
        this.snapshot = { ...this.snapshot, ...msg, status: msg.type }
      }

      const payload = JSON.stringify(msg)
      for (const ws of this.sessions) {
        try { ws.send(payload) } catch { this.sessions.delete(ws) }
      }

      return Response.json({ ok: true, clients: this.sessions.size })
    }

    return new Response('Not Found', { status: 404 })
  }
}
