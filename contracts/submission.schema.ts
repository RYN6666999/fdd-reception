import { z } from 'zod'
import { OcrCardSchema } from './ocr-card.schema'
import { OcrIdSchema } from './ocr-id.schema'

export const SubmissionSchema = z.object({
  token_id: z.string().min(1),
  ocr_card: OcrCardSchema,
  ocr_id: OcrIdSchema,
  installment: z.number().int().min(1).max(36).optional(),
  photo_hash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be SHA-256 hex string'),
})

// CVV 走獨立 WS 推送，不在此 schema
export const CvvPayloadSchema = z.object({
  token_id: z.string().min(1),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits'),
})

export type Submission = z.infer<typeof SubmissionSchema>
export type CvvPayload = z.infer<typeof CvvPayloadSchema>
