// nanoid-style 8-char short code using crypto
export function generateId(len = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export function generateShortCode(): string {
  return generateId(8)
}
