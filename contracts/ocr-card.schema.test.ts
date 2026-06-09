import { describe, it, expect } from 'bun:test'
import { OcrCardSchema } from './ocr-card.schema'

const futureExpiry = '12/99'

describe('OcrCardSchema', () => {
  it('happy: valid Visa test card with future expiry', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '4111111111111111',
      expiry: futureExpiry,
      holder_name: 'John Doe',
    })
    expect(result.success).toBe(true)
  })

  it('happy: holder_name is optional', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '4111111111111111',
      expiry: futureExpiry,
    })
    expect(result.success).toBe(true)
  })

  it('reject: Luhn invalid card number', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '4111111111111112',
      expiry: futureExpiry,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(e => e.message)
      expect(messages.some(m => m.includes('Luhn'))).toBe(true)
    }
  })

  it('reject: expired card', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '4111111111111111',
      expiry: '01/20',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(e => e.message)
      expect(messages.some(m => m.includes('expired'))).toBe(true)
    }
  })

  it('reject: card number not 16 digits', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '411111111111',
      expiry: futureExpiry,
    })
    expect(result.success).toBe(false)
  })

  it('boundary: card number with spaces passes after transform', () => {
    const result = OcrCardSchema.safeParse({
      card_number: '4111 1111 1111 1111',
      expiry: futureExpiry,
    })
    expect(result.success).toBe(true)
  })
})
