export async function submitData(tokenId, formData, photoBlob, photoHash) {
  // Step 1: 送出 submission（不含 CVV）
  const submission = {
    token_id: tokenId,
    ocr_card: {
      card_number: formData.card_number.replace(/\s|-/g, ''),
      expiry: formData.expiry,
      holder_name: formData.holder_name || undefined,
    },
    ocr_id: {
      name: formData.name,
      id_number: formData.id_number,
      birth_date: formData.birth_date,
    },
    installment: formData.installment ? parseInt(formData.installment) : undefined,
    photo_hash: photoHash,
  }

  const formPayload = new FormData()
  formPayload.append('submission', JSON.stringify(submission))
  formPayload.append('photo', photoBlob, 'photo.jpg')

  const res = await fetch(`/api/token/${tokenId}/submit`, {
    method: 'POST',
    body: formPayload,
  })

  if (res.status === 409) throw new Error('ALREADY_SUBMITTED')
  if (!res.ok) throw new Error('SUBMIT_FAILED')

  return res.json()
}
