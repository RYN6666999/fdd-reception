import { test, expect } from 'bun:test'
import { OcrIdSchema } from './ocr-id.schema'

const VALID_PAYLOAD = {
  name: '王小明',
  id_number: 'A123456789', // checksum: sum=130, 130%10===0
  birth_date: '1990-01-01',
}

test('happy: valid Taiwan ID passes', () => {
  const result = OcrIdSchema.safeParse(VALID_PAYLOAD)
  expect(result.success).toBe(true)
})

test('reject: lowercase first letter', () => {
  const result = OcrIdSchema.safeParse({ ...VALID_PAYLOAD, id_number: 'a123456789' })
  expect(result.success).toBe(false)
})

test('reject: second digit is 3 (only 1 or 2 allowed)', () => {
  const result = OcrIdSchema.safeParse({ ...VALID_PAYLOAD, id_number: 'A323456789' })
  expect(result.success).toBe(false)
})

test('reject: valid format but wrong checksum', () => {
  // A123456780 — last digit changed from 9 to 0, checksum will fail
  const result = OcrIdSchema.safeParse({ ...VALID_PAYLOAD, id_number: 'A123456780' })
  expect(result.success).toBe(false)
})

test('reject: empty name', () => {
  const result = OcrIdSchema.safeParse({ ...VALID_PAYLOAD, name: '' })
  expect(result.success).toBe(false)
})
