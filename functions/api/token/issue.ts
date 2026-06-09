import { generateId, generateShortCode } from '../../utils/id'

interface Env { DB: D1Database; BASE_URL: string }

const TTL_MINUTES = 30

export async function handleIssue(request: Request, env: Env): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('Unauthorized', { status: 401 })

  const tokenId = generateId()
  const shortCode = generateShortCode()
  const now = new Date()
  const nowIso = now.toISOString()
  // 從產 QR code 當下就開始倒數
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000).toISOString()

  await env.DB.prepare(
    `INSERT INTO tokens (id, operator_id, short_code, status, created_at, expires_at)
     VALUES (?, ?, ?, 'issued', ?, ?)`
  ).bind(tokenId, operatorId, shortCode, nowIso, expiresAt).run()

  await env.DB.prepare(
    `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
     VALUES (?, 'token_issued', ?, ?, ?)`
  ).bind(generateId(), tokenId, operatorId, nowIso).run()

  return Response.json({
    id: tokenId,
    short_url: `${env.BASE_URL}/c/${shortCode}`,
    status: 'issued',
    created_at: nowIso,
    expires_at: expiresAt,
  })
}
