import { z } from 'zod'

function luhn(card: string): boolean {
  const digits = card.replace(/\D/g, '')
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10)
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function notExpired(expiry: string): boolean {
  // expiry format: MM/YY or MM/YYYY
  const [mm, yy] = expiry.split('/')
  const month = parseInt(mm!, 10)
  const year = parseInt(yy!.length === 2 ? '20' + yy : yy!, 10)
  const now = new Date()
  const exp = new Date(year, month - 1, 1) // first day of expiry month
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return exp >= thisMonth
}

export const OcrCardSchema = z.object({
  card_number: z.string()
    .transform(s => s.replace(/\s|-/g, ''))  // 移除空格和連字號
    .pipe(z.string().length(16).regex(/^\d+$/))
    .refine(luhn, { message: 'Invalid card number (Luhn check failed)' }),
  expiry: z.string()
    .regex(/^\d{2}\/\d{2}(\d{2})?$/, 'Format must be MM/YY or MM/YYYY')
    .refine(notExpired, { message: 'Card is expired' }),
  holder_name: z.string().optional(),
})

export type OcrCard = z.infer<typeof OcrCardSchema>
