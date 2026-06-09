import { generateId } from '../../utils/id'

interface Env { DB: D1Database }

export async function handleOpen(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })

  // 只有 expired / destroyed 才真正失效
  if (token['status'] === 'expired' || token['status'] === 'destroyed') {
    return new Response('Gone', { status: 410 })
  }

  const now = new Date()

  // issued → opened（只需 transition 一次）
  if (token['status'] === 'issued') {
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const openedAt = now.toISOString()

    await env.DB.prepare(
      `UPDATE tokens SET status='opened', opened_at=?, expires_at=? WHERE id=?`
    ).bind(openedAt, expiresAt, tokenId).run()

    await env.DB.prepare(
      `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
       VALUES (?, 'token_opened', ?, ?, ?)`
    ).bind(generateId(), tokenId, token['operator_id'] as string, openedAt).run()

    return Response.json({ id: tokenId, status: 'opened', opened_at: openedAt, expires_at: expiresAt })
  }

  // opened / uploaded / confirmed：允許客戶重新整理，直接回目前狀態
  return Response.json({
    id: tokenId,
    status: token['status'],
    opened_at: token['opened_at'],
    expires_at: token['expires_at'],
  })
}
