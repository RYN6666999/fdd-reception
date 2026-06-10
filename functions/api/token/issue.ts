import { generateId, generateShortCode } from '../../utils/id'
import type { Env } from '../../types/env'

export async function handleIssue(request: Request, env: Env): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('Unauthorized', { status: 401 })

  const tokenId = generateId()
  const shortCode = generateShortCode()
  const now = new Date()
  const nowIso = now.toISOString()

  // expires_at 不在 issue 時設定，等客戶實際開啟連結（/open）時才開始 10 分鐘計時
  await env.DB.prepare(
    `INSERT INTO tokens (id, operator_id, short_code, status, created_at)
     VALUES (?, ?, ?, 'issued', ?)`
  ).bind(tokenId, operatorId, shortCode, nowIso).run()

  await env.DB.prepare(
    `INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
     VALUES (?, 'token_issued', ?, ?, ?)`
  ).bind(generateId(), tokenId, operatorId, nowIso).run()

  // 用 request.url 取得當前 domain，不寫死 BASE_URL 環境變數
  const origin = new URL(request.url).origin
  return Response.json({
    id: tokenId,
    short_url: `${origin}/c/${shortCode}`,
    status: 'issued',
    created_at: nowIso,
  })
}
