let sessionToken = null

export function setSession(token) { sessionToken = token }
export function clearSession() { sessionToken = null }

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
      ...opts.headers,
    }
  })
  if (res.status === 401) {
    clearSession()
    location.reload()
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`${res.status}`)
  return res
}

export async function login(adminId, password) {
  const res = await fetch('/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin_id: adminId, password }),
  })
  if (!res.ok) throw new Error('登入失敗')
  const data = await res.json()
  setSession(data.token)
  return data
}

export async function queryTimeline({ from, to, operatorId, limit = 50, offset = 0 }) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (operatorId) params.set('operator_id', operatorId)
  params.set('limit', limit)
  params.set('offset', offset)
  const res = await apiFetch(`/api/admin/timeline?${params}`)
  return res.json()
}

export async function downloadPhoto(tokenId) {
  const res = await apiFetch(`/api/admin/photo/${tokenId}`)
  return res.blob()
}

export async function deleteRecord(tokenId) {
  await apiFetch(`/api/admin/record/${tokenId}`, { method: 'DELETE' })
}
