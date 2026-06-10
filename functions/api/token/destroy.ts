import { generateId } from '../../utils/id'
import type { Env } from '../../types/env'

export async function handleDestroy(request: Request, env: Env, tokenId: string): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('unauthorized', { status: 401 })

  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })
  if (token['operator_id'] !== operatorId) return new Response('forbidden', { status: 403 })

  const now = new Date().toISOString()

  // R2 刪四張照片
  const keys = [
    `${tokenId}/id_front.jpg`,
    `${tokenId}/id_back.jpg`,
    `${tokenId}/card_front.jpg`,
    `${tokenId}/card_back.jpg`,
  ]
  await Promise.all(
    keys.map(k =>
      env.PHOTOS.delete(k).catch(e =>
        console.error('[endpoint:destroy] r2_delete_failed:', k, e)
      )
    )
  )

  // D1 清四個敏感欄位
  await env.DB.prepare(
    `UPDATE submissions SET card_number_enc=NULL, id_number_enc=NULL, holder_name=NULL, expiry=NULL WHERE token_id=?`
  ).bind(tokenId).run()

  await env.DB.prepare(
    `UPDATE tokens SET status='destroyed' WHERE id=?`
  ).bind(tokenId).run()

  await env.DB.prepare(
    `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
     VALUES (?, 'token_destroyed', ?, ?, ?)`
  ).bind(generateId(), tokenId, token['operator_id'] as string, now).run()

  return Response.json({ ok: true })
}
