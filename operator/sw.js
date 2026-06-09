// Service Worker — fdd-reception operator PWA
// v2: Network First，避免 cache 卡住舊版本
const CACHE = 'fdd-op-v2'

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
  // 清除所有舊 cache
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // 所有請求永遠走網路，不用 cache
  e.respondWith(fetch(e.request))
})
