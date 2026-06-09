import { generateId } from '../../utils/id'

interface Env { DB: D1Database }

export async function handleOpen(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })

  if (token['status'] === 'expired' || token['status'] === 'destroyed') {
    return new Response('Gone', { status: 410 })
  }

  const now = new Date().toISOString()

  // issued → opened（只 transition 一次，expires_at 沿用 issue 時設的）
  if (token['status'] === 'issued') {
    await env.DB.prepare(
      `UPDATE tokens SET status='opened', opened_at=? WHERE id=?`
    ).bind(now, tokenId).run()

    await env.DB.prepare(
      `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
       VALUES (?, 'token_opened', ?, ?, ?)`
    ).bind(generateId(), tokenId, token['operator_id'] as string, now).run()
  }

  // opened / uploaded / confirmed：允許重新整理
  return Response.json({
    id: tokenId,
    status: token['status'] === 'issued' ? 'opened' : token['status'],
    expires_at: token['expires_at'],
  })
}
