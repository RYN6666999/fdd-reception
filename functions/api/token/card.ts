import { decrypt } from '../../utils/crypto'

interface Env { DB: D1Database; ENCRYPTION_KEY: string }

export async function handleGetCard(request: Request, env: Env, tokenId: string): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('Unauthorized', { status: 401 })

  // 驗證此 operator 擁有此 token
  const token = await env.DB.prepare(
    `SELECT operator_id FROM tokens WHERE id = ? AND status IN ('uploaded', 'confirmed')`
  ).bind(tokenId).first()

  if (!token) return new Response('Not Found', { status: 404 })
  if (token.operator_id !== operatorId) return new Response('Forbidden', { status: 403 })

  const sub = await env.DB.prepare(
    `SELECT card_number_enc FROM submissions WHERE token_id = ?`
  ).bind(tokenId).first()

  if (!sub?.card_number_enc) return new Response('Not Found', { status: 404 })

  const cardNumber = await decrypt(sub.card_number_enc as string, env.ENCRYPTION_KEY)
  return Response.json({ card_number: cardNumber })
}
