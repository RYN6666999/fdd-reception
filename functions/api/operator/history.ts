import type { Env } from '../../types/env'

export async function handleOperatorHistory(request: Request, env: Env): Promise<Response> {
  const operatorId = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!operatorId) return new Response('Unauthorized', { status: 401 })

  // JOIN submissions 取卡號末四碼（submissions.card_number_enc 已加密，但 expiry/holder_name 是明文）
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.status, t.created_at,
            s.expiry, s.holder_name, s.installment
     FROM tokens t
     LEFT JOIN submissions s ON s.token_id = t.id
     WHERE t.operator_id = ?
     ORDER BY t.created_at DESC
     LIMIT 100`
  ).bind(operatorId).all()

  const events = results.map(row => ({
    token_id: row.id,
    status: row.status,
    timestamp: row.created_at,
    expiry: row.expiry ?? null,
    name: row.holder_name ?? null,
    installment: row.installment ?? null,
  }))

  return Response.json({ events })
}
