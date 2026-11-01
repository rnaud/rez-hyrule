/* REZ: HYRULE — offline shell.
 * The app is a static Vite build; cache its hashed assets on install so the
 * last rail can still be flown when the network is gone.
 */
const VERSION = 'rez-hyrule-2026-10-31.2';
const CACHE = `rez-hyrule-${VERSION}`;
const BASE = new URL('./', self.location.href);
const SHELL = [
  new URL('./', BASE).href,
  new URL('./index.html', BASE).href,
  new URL('./manifest.webmanifest', BASE).href,
  new URL('./icons/icon-192.png', BASE).href,
  new URL('./icons/icon-512.png', BASE).href,
  new URL('./icons/icon-maskable-512.png', BASE).href,
  new URL('./icons/apple-touch-icon.png', BASE).href,
];

const put = async (cache, url) => {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res && res.ok) await cache.put(url, res.clone());
  } catch {
    /* A missing optional asset must not abort installation. */
  }
};

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(SHELL.map((url) => put(cache, url)));

  // Discover the content-hashed JS, CSS, fonts and icons from the built shell.
  try {
    const indexUrl = new URL('./index.html', BASE).href;
    const res = await fetch(indexUrl, { cache: 'no-cache' });
    if (!res.ok) return;
    const html = await res.text();
    const assets = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const raw = match[1];
      if (/^(data:|blob:|https?:|\/\/)/.test(raw)) continue;
      assets.add(new URL(raw, BASE).href);
    }
    for (const asset of assets) {
      if (!/\.(?:js|css|woff2?|png|svg|webp)(?:\?|$)/i.test(asset)) continue;
      await put(cache, asset);
      if (!asset.includes('.css')) continue;
      // Fonts referenced by url(...) in the bundled stylesheet.
      try {
        const cssRes = await cache.match(asset);
        if (!cssRes) continue;
        const css = await cssRes.text();
        for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
          let raw = m[1].trim().replace(/^['"]|['"]$/g, '');
          if (/^(data:|blob:|https?:|\/\/)/.test(raw)) continue;
          const url = new URL(raw, asset).href;
          if (/\.(?:woff2?|png|svg|webp)(?:\?|$)/i.test(url)) await put(cache, url);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* The runtime cache still covers subsequent visits. */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('rez-hyrule-') && key !== CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function navigationFallback(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    throw new Error('navigation failed');
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(new URL('./', BASE).href)) ||
      (await cache.match(new URL('./index.html', BASE).href)) ||
      new Response('Offline — return to the rail when the light is back.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function runtimeAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }
  event.respondWith(runtimeAsset(request));
});
