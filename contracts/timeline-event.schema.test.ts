import { test, expect } from 'bun:test'
import { TimelineEventSchema, TimelineQuerySchema } from './timeline-event.schema'

test('happy: valid event without metadata', () => {
  const result = TimelineEventSchema.safeParse({
    id: 'evt_001',
    event_type: 'token_issued',
    token_id: 'tok_abc',
    operator_id: 'op_xyz',
    timestamp: '2026-06-09T12:00:00.000Z',
  })
  expect(result.success).toBe(true)
})

test('happy: valid event with metadata', () => {
  const result = TimelineEventSchema.safeParse({
    id: 'evt_002',
    event_type: 'photo_downloaded',
    token_id: 'tok_abc',
    operator_id: 'op_xyz',
    timestamp: '2026-06-09T12:00:00.000Z',
    metadata: { ip: '1.2.3.4', ua: 'Mozilla/5.0' },
  })
  expect(result.success).toBe(true)
})

test('reject: event_type not in enum', () => {
  const result = TimelineEventSchema.safeParse({
    id: 'evt_003',
    event_type: 'unknown_event',
    token_id: 'tok_abc',
    operator_id: 'op_xyz',
    timestamp: '2026-06-09T12:00:00.000Z',
  })
  expect(result.success).toBe(false)
})

test('reject: timestamp not ISO datetime', () => {
  const result = TimelineEventSchema.safeParse({
    id: 'evt_004',
    event_type: 'token_expired',
    token_id: 'tok_abc',
    operator_id: 'op_xyz',
    timestamp: '2026-06-09',
  })
  expect(result.success).toBe(false)
})

test('TimelineQuery happy: empty query uses defaults', () => {
  const result = TimelineQuerySchema.safeParse({})
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data.limit).toBe(50)
    expect(result.data.offset).toBe(0)
  }
})

test('TimelineQuery reject: limit > 200', () => {
  const result = TimelineQuerySchema.safeParse({ limit: 201 })
  expect(result.success).toBe(false)
})
