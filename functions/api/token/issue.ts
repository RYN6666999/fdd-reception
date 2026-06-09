import { generateId, generateShortCode } from '../../utils/id'

interface Env { DB: D1Database; BASE_URL: string }

export async function handleIssue(request: Request, env: Env): Promise<Response> {
  // 從 Authorization header 取 operator_id（格式：Bearer <operator_id>）
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('Unauthorized', { status: 401 })

  const tokenId = generateId()
  const shortCode = generateShortCode()
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO tokens (id, operator_id, short_code, status, created_at)
     VALUES (?, ?, ?, 'issued', ?)`
  ).bind(tokenId, operatorId, shortCode, now).run()

  await env.DB.prepare(
    `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
     VALUES (?, 'token_issued', ?, ?, ?)`
  ).bind(generateId(), tokenId, operatorId, now).run()

  return Response.json({
    id: tokenId,
    short_url: `${env.BASE_URL}/c/${shortCode}`,
    status: 'issued',
    created_at: now,
  })
}
