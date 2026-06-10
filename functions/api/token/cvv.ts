import type { Env } from '../../types/env'

export async function handleCvv(request: Request, env: Env, tokenId: string): Promise<Response> {
  const body = await request.json() as { token_id: string; cvv: string }

  if (!body.cvv || !/^\d{3,4}$/.test(body.cvv)) {
    return new Response('Invalid CVV', { status: 400 })
  }

  const token = await env.DB.prepare('SELECT status FROM tokens WHERE id = ?')
    .bind(tokenId).first()
  if (!token) return new Response('not found', { status: 404 })
  if (token['status'] !== 'uploaded') {
    return new Response(`wrong status: ${token['status']}`, { status: 409 })
  }

  // CVV 直接轉發，不碰 DB
  const roomId = env.SESSION_ROOM.idFromName(tokenId)
  const room = env.SESSION_ROOM.get(roomId)
  await room.fetch('http://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type: 'cvv', cvv: body.cvv })
  })

  return Response.json({ ok: true })
}
