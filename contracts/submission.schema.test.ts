import { describe, it, expect } from 'bun:test'
import { SubmissionSchema, CvvPayloadSchema } from './submission.schema'

const validCard = {
  card_number: '4111111111111111',
  expiry: '12/30',
}

const validId = {
  name: '王小明',
  id_number: 'A123456789',
  birth_date: '1990-01-01',
}

const validPhotoHash = 'a'.repeat(64)

describe('SubmissionSchema', () => {
  it('happy: valid full submission', () => {
    const result = SubmissionSchema.safeParse({
      token_id: 'tok_abc123',
      ocr_card: validCard,
      ocr_id: validId,
      installment: 12,
      photo_hash: validPhotoHash,
    })
    expect(result.success).toBe(true)
  })

  it('happy: installment absent should pass', () => {
    const result = SubmissionSchema.safeParse({
      token_id: 'tok_abc123',
      ocr_card: validCard,
      ocr_id: validId,
      photo_hash: validPhotoHash,
    })
    expect(result.success).toBe(true)
  })

  it('reject: empty token_id', () => {
    const result = SubmissionSchema.safeParse({
      token_id: '',
      ocr_card: validCard,
      ocr_id: validId,
      photo_hash: validPhotoHash,
    })
    expect(result.success).toBe(false)
  })

  it('reject: photo_hash not 64-char hex', () => {
    const result = SubmissionSchema.safeParse({
      token_id: 'tok_abc123',
      ocr_card: validCard,
      ocr_id: validId,
      photo_hash: 'abc123',
    })
    expect(result.success).toBe(false)
  })
})

describe('CvvPayloadSchema', () => {
  it('happy: 3-digit CVV', () => {
    const result = CvvPayloadSchema.safeParse({ token_id: 'tok_abc123', cvv: '123' })
    expect(result.success).toBe(true)
  })

  it('happy: 4-digit CVV', () => {
    const result = CvvPayloadSchema.safeParse({ token_id: 'tok_abc123', cvv: '1234' })
    expect(result.success).toBe(true)
  })

  it('reject: 5-digit CVV', () => {
    const result = CvvPayloadSchema.safeParse({ token_id: 'tok_abc123', cvv: '12345' })
    expect(result.success).toBe(false)
  })
})
