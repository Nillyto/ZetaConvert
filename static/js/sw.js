const CACHE = 'zc-v7';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // No cachear CSS en dev
  if (url.pathname.endsWith('/static/css/styles.css')) return;
  // resto de tu estrategia…
});

const ASSETS=['/','/routes','/privacy','/terms','/static/css/styles.css','/static/css/theme.css','/static/js/main.js','/static/icons/icon-192.png','/static/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)); return resp;}).catch(()=>caches.match('/'))));
});