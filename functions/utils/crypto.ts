export async function encrypt(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )
  // 輸出格式：base64(iv):base64(ciphertext)
  return `${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`
}

export async function decrypt(encrypted: string, keyBase64: string): Promise<string> {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('decrypt payload missing')
  }
  const parts = encrypted.split(':')
  if (parts.length !== 2) {
    throw new Error('decrypt payload format invalid')
  }
  const [ivB64, ctB64] = parts
  const key = await importKey(keyBase64)
  const iv = Uint8Array.from(atob(ivB64!), c => c.charCodeAt(0))
  const ct = Uint8Array.from(atob(ctB64!), c => c.charCodeAt(0))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(plain)
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  if (!keyBase64 || typeof keyBase64 !== 'string') {
    throw new Error('ENCRYPTION_KEY missing')
  }
  let raw: Uint8Array
  try {
    raw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
  } catch {
    throw new Error('ENCRYPTION_KEY not valid base64')
  }
  if (raw.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes, got ${raw.length}`)
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
