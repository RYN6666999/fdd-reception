import { login, queryTimeline, downloadPhoto, deleteRecord, clearSession } from './api.js'

const PAGE_SIZE = 50
let currentOffset = 0
let currentFilters = {}
let totalCount = 0

const EVENT_LABELS = {
  token_issued: '發送連結',
  token_opened: '客戶開啟',
  token_submitted: '客戶送出',
  token_confirmed: '業務確認',
  token_expired: '連結失效',
  token_destroyed: '結案',
  photo_downloaded: '下載照片',
  data_auto_deleted: '自動刪除',
}

// Login
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault()
  const fd = new FormData(e.target)
  try {
    await login(fd.get('admin_id'), fd.get('password'))
    document.getElementById('view-login').hidden = true
    document.getElementById('view-main').hidden = false
    await search()
  } catch {
    const err = document.getElementById('login-error')
    err.textContent = '帳號或密碼錯誤'
    err.hidden = false
  }
})

document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession()
  document.getElementById('view-main').hidden = true
  document.getElementById('view-login').hidden = false
})

document.getElementById('btn-search').addEventListener('click', () => {
  currentOffset = 0
  search()
})

document.getElementById('btn-prev').addEventListener('click', () => {
  currentOffset = Math.max(0, currentOffset - PAGE_SIZE)
  search()
})

document.getElementById('btn-next').addEventListener('click', () => {
  currentOffset += PAGE_SIZE
  search()
})

async function search() {
  currentFilters = {
    from: document.getElementById('filter-from').value || undefined,
    to: document.getElementById('filter-to').value || undefined,
    operatorId: document.getElementById('filter-operator').value || undefined,
    limit: PAGE_SIZE,
    offset: currentOffset,
  }

  try {
    const data = await queryTimeline(currentFilters)
    totalCount = data.total ?? data.events?.length ?? 0
    renderTimeline(data.events ?? [])
  } catch (err) {
    console.error(err)
  }
}

function renderTimeline(events) {
  const empty = document.getElementById('timeline-empty')
  const table = document.getElementById('timeline-table')
  const tbody = document.getElementById('timeline-body')

  if (events.length === 0) {
    empty.hidden = false
    table.hidden = true
    updatePagination(0)
    return
  }

  empty.hidden = true
  table.hidden = false

  tbody.innerHTML = events.map(ev => `
    <tr>
      <td>${new Date(ev.timestamp).toLocaleString('zh-TW')}</td>
      <td>${EVENT_LABELS[ev.event_type] ?? ev.event_type}</td>
      <td>${ev.operator_id}</td>
      <td title="${ev.token_id}">${ev.token_id.slice(0, 8)}...</td>
      <td>
        ${ev.event_type === 'token_confirmed' ? `<button onclick="handleDownload('${ev.token_id}')">下載照片</button>` : ''}
        ${ev.event_type === 'token_confirmed' ? `<button onclick="handleDelete('${ev.token_id}')">刪除</button>` : ''}
      </td>
    </tr>
  `).join('')

  updatePagination(events.length)
}

function updatePagination(count) {
  const page = Math.floor(currentOffset / PAGE_SIZE) + 1
  document.getElementById('page-info').textContent = `第 ${page} 頁`
  document.getElementById('btn-prev').disabled = currentOffset === 0
  document.getElementById('btn-next').disabled = count < PAGE_SIZE
}

window.handleDownload = async (tokenId) => {
  try {
    const blob = await downloadPhoto(tokenId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `photo-${tokenId}.jpg`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    alert('照片無法下載（可能已刪除）')
  }
}

window.handleDelete = async (tokenId) => {
  if (!confirm('確定刪除此記錄的敏感資料？')) return
  try {
    await deleteRecord(tokenId)
    await search()
  } catch {
    alert('刪除失敗')
  }
}
