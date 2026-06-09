// Service Worker — fdd-reception operator PWA
const CACHE = 'fdd-op-v1'
const PRECACHE = [
  '/operator/',
  '/operator/index.html',
  '/operator/style.css',
  '/operator/app.js',
  '/operator/state.js',
  '/operator/ws.js',
  '/operator/clipboard.js',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // API 請求永遠走網路，不快取
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request))
    return
  }

  // 靜態資源：Cache First
  e.respondWith(
    caches.match(e.request).then(cached => cached ?? fetch(e.request))
  )
})
