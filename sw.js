// App-shell cache. Data (Supabase) is never cached: always live.
const CACHE = 'network-v12';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'supabase.js', 'marked.js', 'purify.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase + CDN go straight to network
  // Network first so updates show up immediately; cache is the offline fallback.
  // `cache: 'no-cache'` forces revalidation with the server every time, so the
  // app shell (index.html + app.js + styles.css) can never go version-skewed
  // from the browser HTTP cache serving a stale copy of one file.
  e.respondWith(fetch(new Request(e.request, { cache: 'no-cache' })).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
