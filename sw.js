const CACHE_NAME = 'aris-relay-v1'
const SHELL_ASSETS = [
  '/',
  '/relay-ui/index.html',
  '/relay-ui/app.css',
  '/relay-ui/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const isSameOrigin = url.origin === self.location.origin
  const isChatApi = url.pathname === '/c' || url.pathname === '/health' || url.pathname === '/admin/status'

  if (!isSameOrigin || isChatApi || event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        const copied = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copied)
        })
        return response
      })
    })
  )
})
