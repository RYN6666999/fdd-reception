export function luhn(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length !== 16) return false
  let sum = 0, alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

const LETTER_MAP = {
  A:10,B:11,C:12,D:13,E:14,F:15,G:16,H:17,I:34,
  J:18,K:19,L:20,M:21,N:22,O:35,P:23,Q:24,R:25,
  S:26,T:27,U:28,V:29,W:32,X:30,Y:31,Z:33
}

export function validateTwId(id) {
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false
  const lv = LETTER_MAP[id[0]]
  const digits = [Math.floor(lv/10), lv%10, ...id.slice(1).split('').map(Number)]
  const weights = [1,9,8,7,6,5,4,3,2,1,1]
  return digits.reduce((s, d, i) => s + d * weights[i], 0) % 10 === 0
}

export function notExpired(expiry) {
  const [mm, yy] = expiry.split('/')
  const year = parseInt(yy.length === 2 ? '20' + yy : yy)
  const month = parseInt(mm)
  const now = new Date()
  return new Date(year, month - 1) >= new Date(now.getFullYear(), now.getMonth())
}

// 顯示/清除錯誤訊息（用 outline 不用顏色）
export function setError(inputEl, msg) {
  inputEl.style.outline = msg ? '2px solid black' : ''
  let errEl = inputEl.nextElementSibling
  if (!errEl?.classList.contains('field-error')) {
    errEl = document.createElement('span')
    errEl.className = 'field-error'
    errEl.style.cssText = 'font-size:0.8em; display:block;'
    inputEl.insertAdjacentElement('afterend', errEl)
  }
  errEl.textContent = msg
}

export function clearError(inputEl) {
  setError(inputEl, '')
}
