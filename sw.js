// Service Worker mínimo — Gime Burello Pastelería
// Solo hace que la app sea instalable (criterio PWA).
// No cachea contenido: siempre trabaja online con Supabase en tiempo real.

const CACHE_NAME = 'gime-pasteleria-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Sin estrategia de caché: todas las requests van directo a la red
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
