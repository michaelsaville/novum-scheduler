// Novum Scheduler service worker.
// Bumped cache name = clients pick up the new SW on next activate.
const CACHE = 'novum-shell-v1';
const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-256.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails atomically; if one URL is missing the whole install fails.
      // Use Promise.allSettled so a missing icon doesn't brick the SW.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isNavigation(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /api/* → never SW-handled. Auth, photos, push subscribe, ICS — all must
  // hit the network with their cookies + headers untouched.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets → cache-first, populate on miss.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // HTML navigations → network-first. If the network is down, serve /offline.
  // We never cache authenticated HTML — there's no way to know which session
  // it belongs to and stale role-gated pages would be a mess.
  if (isNavigation(req)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          const offline = await cache.match('/offline');
          return offline ?? new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  // Anything else (XHR, fonts, fetches) → pass through. Browsers handle
  // their own HTTP cache fine for these.
});

// ── Web push ──────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || 'Novum Scheduler';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/me' },
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/me';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        try {
          const u = new URL(c.url);
          if (u.pathname === target || c.url.endsWith(target)) {
            return c.focus();
          }
        } catch {}
      }
      return self.clients.openWindow(target);
    })(),
  );
});
