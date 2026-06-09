import { generateId } from '../../utils/id'
import { encrypt } from '../../utils/crypto'
import { SubmissionSchema } from '../../../contracts/submission.schema'

interface Env {
  DB: D1Database
  ENCRYPTION_KEY: string
  SESSION_ROOM: DurableObjectNamespace
}

export async function handleSubmit(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })
  if (token.status === 'expired' || token.status === 'destroyed') return new Response('Gone', { status: 410 })
  if (token.status === 'issued') return new Response('not opened', { status: 409 })
  if (token.status === 'uploaded' || token.status === 'confirmed') return new Response('Conflict', { status: 409 })

  const formData = await request.formData()
  const submissionJson = formData.get('submission') as string
  const photo = formData.get('photo') as File | null

  if (!submissionJson) return new Response('Bad Request', { status: 400 })
  if (!photo) return new Response('photo required', { status: 400 })

  let parsed: unknown
  try {
    parsed = JSON.parse(submissionJson)
  } catch {
    return new Response('invalid JSON', { status: 400 })
  }
  const result = SubmissionSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[submit] zod failed:', result.error.flatten())
    return new Response('invalid submission', { status: 400 })
  }
  const submission = result.data

  // 驗證 photo hash
  const buf = await photo.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  if (hash !== submission.photo_hash) {
    return new Response('Watermark verification failed', { status: 400 })
  }

  // 加密敏感欄位
  let cardNumEnc: string | null
  let idNumEnc: string | null
  try {
    cardNumEnc = submission.ocr_card?.card_number
      ? await encrypt(submission.ocr_card.card_number, env.ENCRYPTION_KEY)
      : null
    idNumEnc = submission.ocr_id?.id_number
      ? await encrypt(submission.ocr_id.id_number, env.ENCRYPTION_KEY)
      : null
  } catch (err: any) {
    console.error('[submit] crypto_failed:', err?.message)
    return new Response('crypto failed', { status: 500 })
  }

  const submissionId = generateId()
  const now = new Date().toISOString()

  await env.DB.prepare(`
    INSERT INTO submissions (id, token_id, card_number_enc, id_number_enc, holder_name, expiry, installment, photo_hash, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    submissionId, tokenId, cardNumEnc, idNumEnc,
    submission.ocr_card?.holder_name ?? null,
    submission.ocr_card?.expiry ?? null,
    submission.installment ?? null,
    submission.photo_hash,
    now
  ).run()

  await env.DB.prepare(`UPDATE tokens SET status='uploaded' WHERE id=?`).bind(tokenId).run()

  await env.DB.prepare(`
    INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
    VALUES (?, 'token_submitted', ?, ?, ?)
  `).bind(generateId(), tokenId, token.operator_id as string, now).run()

  // 透過 Durable Object 推送 uploaded 事件給業務端（不含 CVV，CVV 走另一個端點）
  const roomId = env.SESSION_ROOM.idFromName(tokenId)
  const room = env.SESSION_ROOM.get(roomId)
  await room.fetch('http://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      type: 'uploaded',
      submission: {
        ocr_card: { ...submission.ocr_card, card_number: undefined }, // 不推全卡號
        ocr_id: submission.ocr_id,
        installment: submission.installment,
      }
    })
  })

  return Response.json({ ok: true })
}
