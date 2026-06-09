import { z } from 'zod'

export const TimelineEventTypeSchema = z.enum([
  'token_issued',
  'token_opened',
  'token_submitted',
  'token_confirmed',
  'token_expired',
  'token_destroyed',
  'photo_downloaded',
  'data_auto_deleted',
])

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  event_type: TimelineEventTypeSchema,
  token_id: z.string().min(1),
  operator_id: z.string().min(1),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const TimelineQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  operator_id: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})

export type TimelineEvent = z.infer<typeof TimelineEventSchema>
export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>
