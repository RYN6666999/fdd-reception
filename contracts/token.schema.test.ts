import { test, expect } from 'bun:test'
import { TokenSchema, TokenStatusSchema } from './token.schema'

const base = {
  id: 'tok_123',
  operator_id: 'op_456',
  short_url: 'https://example.com/abc',
  status: 'issued' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  opened_at: null,
  expires_at: null,
  confirmed_at: null,
}

test('happy path: valid issued token with all nulls', () => {
  const result = TokenSchema.safeParse(base)
  expect(result.success).toBe(true)
})

test('happy path: opened token with expires_at > opened_at', () => {
  const result = TokenSchema.safeParse({
    ...base,
    status: 'opened',
    opened_at: '2026-01-01T10:00:00.000Z',
    expires_at: '2026-01-02T10:00:00.000Z',
  })
  expect(result.success).toBe(true)
})

test('reject: expires_at <= opened_at', () => {
  const result = TokenSchema.safeParse({
    ...base,
    status: 'opened',
    opened_at: '2026-01-02T10:00:00.000Z',
    expires_at: '2026-01-01T10:00:00.000Z',
  })
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0]?.message).toBe('expires_at must be after opened_at')
  }
})

test('reject: invalid status', () => {
  const result = TokenSchema.safeParse({ ...base, status: 'pending' })
  expect(result.success).toBe(false)
})

test('reject: short_url is not a valid URL', () => {
  const result = TokenSchema.safeParse({ ...base, short_url: 'not-a-url' })
  expect(result.success).toBe(false)
})
