// ArticleGuessr offline cache. Bump CACHE when you change any file so players get the update.
const CACHE = 'articleguessr-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'days.js', 'logo-mark.svg', 'logo-mark-light.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// days.js is network-first, so new days appear as soon as the player is online. Everything else: cache at once, refresh in the background.
self.addEventListener('fetch', e => { const r = e.request; if (r.method !== 'GET') return;
  if (/\/days\.js(\?|$)/.test(r.url)) { e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; }).catch(() => caches.match(r, { ignoreSearch: true }))); return; }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => hit);
    return hit || net; })); });
