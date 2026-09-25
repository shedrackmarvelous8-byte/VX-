// VX Service Worker - Version 13.0.0 (Phase 13 PWA & Security)
const CACHE_NAME = 'vx-app-shell-v13'
const STATIC_CACHE_NAME = 'vx-static-assets-v13'

// Core static assets to precache for app shell
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png',
  '/favicon.png',
]

// 1. Install event: Precache core static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => {
        return self.skipWaiting()
      })
      .catch((err) => {
        console.warn('[SW] Precache skipped or partial:', err)
      })
  )
})

// 2. Activate event: Clean up legacy caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE_NAME)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key)
              return caches.delete(key)
            })
        )
      })
      .then(() => {
        return self.clients.claim()
      })
  )
})

// Helper: Check if request is an API, auth, streaming, or sensitive path that must bypass cache
function isBypassUrl(url) {
  const pathname = url.pathname
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/data/') ||
    pathname.includes('/auth/') ||
    pathname.includes('/supabase/') ||
    pathname.includes('/oauth') ||
    pathname.includes('/chat') ||
    pathname.includes('/gemini') ||
    pathname.includes('/sandbox') ||
    pathname.includes('/media/') ||
    pathname.includes('/live') ||
    pathname.includes('/terminal')
  )
}

// 3. Fetch event: Safe routing strategy
self.addEventListener('fetch', (event) => {
  const request = event.request

  // Only handle GET requests; POST, PUT, DELETE, etc. must always hit network directly
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Disallow caching for non-http/https (e.g. chrome-extension, blob, data)
  if (!url.protocol.startsWith('http')) {
    return
  }

  // CRITICAL SECURITY RULE:
  // Bypass all API requests, authentication, streaming, and sensitive operations immediately to network
  if (isBypassUrl(url) || url.origin !== self.location.origin) {
    return
  }

  // Handle static assets (_next/static, fonts, icons, images) -> Stale While Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff|woff2|ttf|css|js)$/)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request)
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone()).catch(() => {})
            }
            return networkResponse
          })
          .catch(() => cachedResponse)

        return cachedResponse || fetchPromise
      })
    )
    return
  }

  // Handle HTML navigation requests (App Shell) -> Network First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy).catch(() => {})
            })
          }
          return networkResponse
        })
        .catch(async () => {
          // If offline, attempt to serve cached app shell
          const cached = await caches.match(request)
          if (cached) return cached
          const rootCached = await caches.match('/')
          if (rootCached) return rootCached

          // Offline fallback HTML
          return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VX — Offline</title>
  <style>
    body { background: #0d0d11; color: #ededed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
    .card { background: #18181c; border: 1px solid #27272a; padding: 32px 24px; border-radius: 12px; max-width: 400px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #ffffff; }
    p { font-size: 14px; color: #a1a1aa; line-height: 1.5; margin: 0 0 20px 0; }
    .btn { background: #27272a; color: #ffffff; border: 1px solid #3f3f46; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s ease; text-decoration: none; display: inline-block; }
    .btn:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You're currently offline</h1>
    <p>VX requires an internet connection for live AI development, sandbox execution, and cloud syncing. Please check your connection.</p>
    <button class="btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>`,
            {
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            }
          )
        })
    )
  }
})

// 4. Message event: Handle explicit skipWaiting request from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
