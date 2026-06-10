import { generateId } from '../../utils/id'
import type { Env } from '../../types/env'

export async function handleConfirm(request: Request, env: Env, tokenId: string): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('unauthorized', { status: 401 })

  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })
  if (token['operator_id'] !== operatorId) return new Response('forbidden', { status: 403 })
  if (token['status'] !== 'uploaded') return new Response('Conflict', { status: 409 })

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE tokens SET status='confirmed', confirmed_at=? WHERE id=?`
  ).bind(now, tokenId).run()

  await env.DB.prepare(
    `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
     VALUES (?, 'token_confirmed', ?, ?, ?)`
  ).bind(generateId(), tokenId, token['operator_id'] as string, now).run()

  // R2 cleanup: delete photos after confirmation
  const photoKeys = ['id_front', 'id_back', 'card_front', 'card_back']
  for (const key of photoKeys) {
    try {
      await env.PHOTOS.delete(`${tokenId}/${key}.jpg`)
    } catch (err: unknown) {
      console.error('[confirm] r2_delete_failed:', err)
    }
  }

  // Clear sensitive fields from DB
  await env.DB.prepare(
    `UPDATE submissions SET card_number_enc=NULL, id_number_enc=NULL WHERE token_id=?`
  ).bind(tokenId).run()

  return Response.json({ id: tokenId, status: 'confirmed', confirmed_at: now })
}
