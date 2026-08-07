/*
 * Service worker: keeps the shell openable when the network is not.
 *
 * Scope is deliberately narrow. It caches only this app's own static build —
 * never Supabase. Payroll figures must come from the server or not at all; a
 * cached salary total is a wrong salary total, and the attendance outbox
 * already covers writing while offline.
 *
 * Same-origin GETs are served stale-while-revalidate: the app opens instantly
 * from cache and quietly updates behind you. Navigations fall back to the
 * cached shell so opening the installed app in a dead spot still gets you the
 * register, with the sync lamp telling the truth about how fresh it is.
 */
const CACHE = 'salary-shell-v1'
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SHELL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch Supabase

  // A navigation always wants the shell; the router lives in the bundle.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(SHELL, copy))
          return res
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || live
    }),
  )
})
