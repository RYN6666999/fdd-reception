import type { Env } from '../../types/env'

const VALID_TYPES = ['id_front', 'id_back', 'card_front', 'card_back'] as const
type PhotoType = typeof VALID_TYPES[number]

// 模型選型（實測記錄見 TODOS 決策表 #8）：
// llava-1.5-7b 跟不住 "JSON only"（回傳純描述）；llama-3.2-11b-vision 拒絕辨識信用卡（安全對齊）
// mistral-small-3.1 兩種證件皆穩定輸出 JSON，中文姓名 + 民國年轉換正確
const OCR_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'
const OCR_MAX_ATTEMPTS = 2

const OCR_PROMPTS: Record<PhotoType, string> = {
  id_front: 'This is a Taiwanese national ID card (front). Extract: name (姓名, keep original Chinese characters), id_number (統一編號, format: 1 uppercase letter + 9 digits), birth_date (出生日期 shown as ROC calendar 民國N年; convert: Gregorian year = N + 1911; output format YYYY-MM-DD). Respond with ONLY this JSON object and nothing else: {"name":"...","id_number":"...","birth_date":"..."}',
  id_back: 'This is the back of a Taiwanese national ID card. No data extraction needed. Respond with ONLY this JSON object and nothing else: {"ok":true}',
  card_front: 'This is a credit card front. Extract: card_number (the embossed 16-digit number), expiry (MM/YY), holder_name (uppercase latin letters). Respond with ONLY this JSON object and nothing else: {"card_number":"...","expiry":"...","holder_name":"..."}',
  card_back: 'This is the back of a credit card. No data extraction needed. Respond with ONLY this JSON object and nothing else: {"ok":true}',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK_SIZE = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
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

  const photoDataUrl = `data:image/jpeg;base64,${bytesToBase64(bytes)}`
  let ocr: Record<string, unknown> | null = null
  for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS && !ocr; attempt++) {
    try {
      const aiResult = await env.AI.run(OCR_MODEL, {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPTS[photoType] },
            { type: 'image_url', image_url: { url: photoDataUrl } },
          ],
        }],
      })
      const out = aiResult as { response?: string; description?: string }
      const ocrRaw = out.response ?? out.description ?? ''
      const jsonMatch = ocrRaw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        // raw OCR text contains the card/ID data itself — log length only, never content
        console.error(`[endpoint:photo] ocr_no_json (attempt ${attempt}), raw_length:`, ocrRaw.length)
        continue
      }
      try {
        ocr = JSON.parse(jsonMatch[0])
      } catch (e) {
        console.error(`[endpoint:photo] ocr_parse_failed (attempt ${attempt}):`, e, 'raw_length:', ocrRaw.length)
      }
    } catch (err: unknown) {
      console.error(`[endpoint:photo] ocr_failed (attempt ${attempt}):`, err)
    }
  }
  if (!ocr) {
    if (photoType === 'id_front' || photoType === 'card_front') {
      return Response.json({ ok: false, ocr_failed: true, field: 'parse', r2_key: r2Key })
    }
    ocr = {}
  }

  if (photoType === 'id_front') {
    const idRegex = /^[A-Z][12]\d{8}$/
    if (!ocr.id_number || !idRegex.test(ocr.id_number as string)) {
      // PII: never log the OCR'd value itself, only which field failed
      console.error('[endpoint:photo] ocr_validation_failed: id_number invalid')
      return Response.json({ ok: false, ocr_failed: true, field: 'id_number', r2_key: r2Key })
    }
    if (!ocr.name || (ocr.name as string).trim().length < 2) {
      console.error('[endpoint:photo] ocr_validation_failed: name too short')
      return Response.json({ ok: false, ocr_failed: true, field: 'name', r2_key: r2Key })
    }
    if (!ocr.birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(ocr.birth_date as string)) {
      console.error('[endpoint:photo] ocr_validation_failed: birth_date format')
      return Response.json({ ok: false, ocr_failed: true, field: 'birth_date', r2_key: r2Key })
    }
  }

  if (photoType === 'card_front') {
    const digits = ((ocr.card_number as string) || '').replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19 || !luhnCheck(digits)) {
      console.error('[endpoint:photo] ocr_validation_failed: card_number invalid')
      return Response.json({ ok: false, ocr_failed: true, field: 'card_number', r2_key: r2Key })
    }
    if (!ocr.expiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(ocr.expiry as string)) {
      console.error('[endpoint:photo] ocr_validation_failed: expiry format')
      return Response.json({ ok: false, ocr_failed: true, field: 'expiry', r2_key: r2Key })
    }
    if (!ocr.holder_name || (ocr.holder_name as string).trim().length < 2) {
      console.error('[endpoint:photo] ocr_validation_failed: holder_name too short')
      return Response.json({ ok: false, ocr_failed: true, field: 'holder_name', r2_key: r2Key })
    }
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

function luhnCheck(num: string): boolean {
  let sum = 0
  let alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i]!, 10)
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}
