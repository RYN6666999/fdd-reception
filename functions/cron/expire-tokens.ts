import { generateId } from '../utils/id'
import type { Env } from '../types/env'

export async function handleExpireTokens(env: Env): Promise<void> {
  const now = new Date().toISOString()

  // issued tokens 的 expires_at 為 NULL（由 open.ts 設定），只處理 opened 狀態
  const expiring = await env.DB.prepare(
    `SELECT id, operator_id FROM tokens WHERE status = 'opened' AND expires_at < ?`
  ).bind(now).all()

  for (const token of expiring.results) {
    await env.DB.prepare(`UPDATE tokens SET status='expired' WHERE id=?`).bind(token.id).run()
    await env.DB.prepare(`
      INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
      VALUES (?, 'token_expired', ?, ?, ?)
    `).bind(generateId(), token.id, token.operator_id, now).run()

    // 推送 expired 事件
    try {
      const roomId = env.SESSION_ROOM.idFromName(token.id as string)
      const room = env.SESSION_ROOM.get(roomId)
      await room.fetch('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'expired' })
      })
    } catch {}
  }
}
