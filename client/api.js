export async function uploadPhoto(tokenId, blob, type) {
  const form = new FormData()
  form.append('photo', blob, `${type}.jpg`)
  form.append('type', type)

  const res = await fetch(`/api/token/${tokenId}/photo`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upload_${type}_failed: ${res.status}`)
  }

  return res.json()
}

export async function submitData(tokenId, payload) {
  const res = await fetch(`/api/token/${tokenId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (res.status === 409) throw new Error('ALREADY_SUBMITTED')
  if (!res.ok) throw new Error('SUBMIT_FAILED')

  return res.json()
}
