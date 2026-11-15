const CACHE = 'passo-livre-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

// Instala o cache
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// Responde do cache se estiver offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return; // Não cachear POST/PUT
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});