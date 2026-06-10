import { generateId } from '../../utils/id'

interface Env { DB: D1Database }

const TTL_MINUTES = 10

export async function handleOpen(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })

  if (token['status'] === 'expired' || token['status'] === 'destroyed') {
    return new Response('Gone', { status: 410 })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  // issued → opened：此時才開始計算 10 分鐘 TTL
  if (token['status'] === 'issued') {
    const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000).toISOString()

    await env.DB.prepare(
      `UPDATE tokens SET status='opened', opened_at=?, expires_at=? WHERE id=?`
    ).bind(nowIso, expiresAt, tokenId).run()

    await env.DB.prepare(
      `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
       VALUES (?, 'token_opened', ?, ?, ?)`
    ).bind(generateId(), tokenId, token['operator_id'] as string, nowIso).run()

    return Response.json({
      id: tokenId,
      status: 'opened',
      expires_at: expiresAt,
    })
  }

  // opened / uploaded / confirmed：允許重新整理
  return Response.json({
    id: tokenId,
    status: token['status'],
    expires_at: token['expires_at'],
  })
}
