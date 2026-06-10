import type { Env } from '../../types/env'

const VALID_TYPES = ['id_front', 'id_back', 'card_front', 'card_back'] as const
type PhotoType = typeof VALID_TYPES[number]

const OCR_PROMPTS: Record<PhotoType, string> = {
  id_front: 'This is a Taiwanese national ID card (front). Extract: name (姓名), id_number (身分證字號, format: 1 letter + 9 digits), birth_date (出生日期, format: YYYY-MM-DD). Return JSON only: {"name":"...","id_number":"...","birth_date":"..."}',
  id_back: 'This is the back of a Taiwanese national ID card. No data extraction needed. Return JSON: {"ok":true}',
  card_front: 'This is a credit card front. Extract: card_number (16 digits), expiry (MM/YY), holder_name. Return JSON only: {"card_number":"...","expiry":"...","holder_name":"..."}',
  card_back: 'This is the back of a credit card. No data extraction needed. Return JSON: {"ok":true}',
}

export async function handlePhotoUpload(request: Request, env: Env, tokenId: string): Promise<Response> {
  const token = await env.DB.prepare('SELECT status FROM tokens WHERE id = ?').bind(tokenId).first()
  if (!token) return new Response('not found', { status: 404 })
  if (token.status !== 'opened' && token.status !== 'uploaded') {
    return new Response('wrong status', { status: 409 })
  }

  const formData = await request.formData()
  const photo = formData.get('photo') as File | null
  const type = formData.get('type') as string | null

  if (!photo) return new Response('photo required', { status: 400 })
  if (!type || !VALID_TYPES.includes(type as PhotoType)) {
    return new Response('type must be one of: id_front, id_back, card_front, card_back', { status: 400 })
  }

  const photoType = type as PhotoType
  const bytes = new Uint8Array(await photo.arrayBuffer())

  if (bytes.length > 5 * 1024 * 1024) {
    return new Response('photo too large (max 5MB)', { status: 413 })
  }

  const r2Key = `${tokenId}/${photoType}.jpg`
  try {
    await env.PHOTOS.put(r2Key, bytes, {
      httpMetadata: { contentType: 'image/jpeg' },
    })
  } catch (err: unknown) {
    console.error('[photo] r2_put_failed:', err)
    return new Response('storage error', { status: 500 })
  }

  let ocr: Record<string, unknown> = {}
  try {
    const b64 = uint8ToBase64(bytes)
    const aiResult = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      prompt: OCR_PROMPTS[photoType],
      image: Array.from(bytes),
    })
    const raw = (aiResult as { description?: string }).description ?? ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        ocr = JSON.parse(jsonMatch[0])
      }
    } catch {
      console.error('[photo] ocr_json_parse_failed, raw:', raw.slice(0, 200))
    }
  } catch (err: unknown) {
    console.error('[photo] ocr_failed:', err)
  }

  const column = `${photoType}_key` as const
  try {
    await env.DB.prepare(`UPDATE submissions SET ${column} = ? WHERE token_id = ?`)
      .bind(r2Key, tokenId)
      .run()
  } catch {
    // submissions row may not exist yet (photo uploaded before submit)
  }

  return Response.json({ ok: true, r2_key: r2Key, ocr })
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}
