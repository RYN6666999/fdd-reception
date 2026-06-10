import { generateId } from '../../utils/id'
import { encrypt } from '../../utils/crypto'
import { SubmissionSchema } from '../../../contracts/submission.schema'
import type { Env } from '../../types/env'

const REQUIRED_PHOTOS = ['id_front', 'id_back', 'card_front', 'card_back'] as const

export async function handleSubmit(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare(`SELECT * FROM tokens WHERE id = ?`).bind(tokenId).first()
  if (!token) return new Response('Not Found', { status: 404 })
  if (token.status === 'expired' || token.status === 'destroyed') return new Response('Gone', { status: 410 })
  if (token.status === 'issued') return new Response('not opened', { status: 409 })
  if (token.status === 'uploaded' || token.status === 'confirmed') return new Response('Conflict', { status: 409 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('invalid JSON', { status: 400 })
  }

  const result = SubmissionSchema.safeParse(body)
  if (!result.success) {
    console.error('[submit] zod_failed:', result.error.flatten())
    return new Response('invalid submission', { status: 400 })
  }
  const submission = result.data

  const missingPhotos: string[] = []
  for (const photoType of REQUIRED_PHOTOS) {
    const r2Key = `${tokenId}/${photoType}.jpg`
    const obj = await env.PHOTOS.head(r2Key)
    if (!obj) missingPhotos.push(photoType)
  }
  if (missingPhotos.length > 0) {
    return new Response(`missing photos: ${missingPhotos.join(', ')}`, { status: 400 })
  }

  let cardNumEnc: string | null
  let idNumEnc: string | null
  try {
    cardNumEnc = submission.ocr_card?.card_number
      ? await encrypt(submission.ocr_card.card_number, env.ENCRYPTION_KEY)
      : null
    idNumEnc = submission.ocr_id?.id_number
      ? await encrypt(submission.ocr_id.id_number, env.ENCRYPTION_KEY)
      : null
  } catch (err: unknown) {
    console.error('[submit] crypto_failed:', err)
    return new Response('crypto error', { status: 500 })
  }

  const submissionId = generateId()
  const now = new Date().toISOString()

  await env.DB.prepare(`
    INSERT INTO submissions (id, token_id, card_number_enc, id_number_enc, holder_name, expiry, installment, photo_hash,
      id_front_key, id_back_key, card_front_key, card_back_key, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    submissionId, tokenId, cardNumEnc, idNumEnc,
    submission.ocr_card?.holder_name ?? null,
    submission.ocr_card?.expiry ?? null,
    submission.installment ?? null,
    submission.photo_hash,
    `${tokenId}/id_front.jpg`,
    `${tokenId}/id_back.jpg`,
    `${tokenId}/card_front.jpg`,
    `${tokenId}/card_back.jpg`,
    now
  ).run()

  await env.DB.prepare(`UPDATE tokens SET status='uploaded' WHERE id=?`).bind(tokenId).run()

  await env.DB.prepare(`
    INSERT INTO timeline_events (id, event_type, token_id, operator_id, timestamp)
    VALUES (?, 'token_submitted', ?, ?, ?)
  `).bind(generateId(), tokenId, token.operator_id as string, now).run()

  const roomId = env.SESSION_ROOM.idFromName(tokenId)
  const room = env.SESSION_ROOM.get(roomId)
  await room.fetch('http://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      type: 'uploaded',
      submission: {
        // 全卡號不進廣播（業務端走 /card 解密 API），只給末四碼供核對
        ocr_card: {
          ...submission.ocr_card,
          card_number: undefined,
          card_last4: submission.ocr_card?.card_number?.slice(-4),
        },
        ocr_id: submission.ocr_id,
        installment: submission.installment,
      }
    })
  })

  return Response.json({ ok: true })
}
