const CACHE='ai-daw-shell-v2';
const ASSETS=['./','./index.html','./style.css','./data.js','./audio.js','./app.js','./manifest.webmanifest','./icon.jpeg','./AI_FORMAT.md'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ai-daw-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
   return response;
 }).catch(()=>caches.match(event.request).then(result=>result||caches.match('./index.html'))));
});
