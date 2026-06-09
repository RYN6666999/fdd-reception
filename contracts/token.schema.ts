import { z } from 'zod'

export const TokenStatusSchema = z.enum([
  'issued', 'opened', 'uploaded', 'confirmed', 'expired', 'destroyed'
])

export const TokenSchema = z.object({
  id: z.string().min(1),
  operator_id: z.string().min(1),
  short_url: z.string().url(),
  status: TokenStatusSchema,
  created_at: z.string().datetime(),
  opened_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  confirmed_at: z.string().datetime().nullable(),
}).refine(
  (t) => t.opened_at === null || t.expires_at === null || t.expires_at > t.opened_at,
  { message: 'expires_at must be after opened_at' }
)

export type Token = z.infer<typeof TokenSchema>
export type TokenStatus = z.infer<typeof TokenStatusSchema>
