import { z } from 'zod'

const LETTER_MAP: Record<string, number> = {
  A:10,B:11,C:12,D:13,E:14,F:15,G:16,H:17,I:34,
  J:18,K:19,L:20,M:21,N:22,O:35,P:23,Q:24,R:25,
  S:26,T:27,U:28,V:29,W:32,X:30,Y:31,Z:33
}

function validateTwId(id: string): boolean {
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false
  const letterVal = LETTER_MAP[id[0]!]!
  const digits = [Math.floor(letterVal/10), letterVal%10, ...id.slice(1).split('').map(Number)]
  const weights = [1,9,8,7,6,5,4,3,2,1,1]
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i]!, 0)
  return sum % 10 === 0
}

export const OcrIdSchema = z.object({
  name: z.string().min(1),
  id_number: z.string()
    .regex(/^[A-Z][12]\d{8}$/, 'Format: 1 uppercase letter + 1/2 + 8 digits')
    .refine(validateTwId, { message: 'Invalid ID number (checksum failed)' }),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
})

export type OcrId = z.infer<typeof OcrIdSchema>
