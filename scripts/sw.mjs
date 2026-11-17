import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())out.push(...await walk(p));else out.push(p)}return out}
const files=(await walk('dist')).filter(f=>!f.endsWith('/sw.js'));
const hash=createHash('sha256');for(const f of files)hash.update(await readFile(f));
await writeFile('dist/sw.js',`const CACHE='sound-island-${hash.digest('hex').slice(0,12)}';
const ASSETS=${JSON.stringify(files.map(f=>'./'+f.slice(5)))};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sound-island-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data==='CHECK_READY')event.waitUntil((async()=>{const cache=await caches.open(CACHE);const ready=(await Promise.all(ASSETS.map(path=>cache.match(new URL(path,self.location.href))))).every(Boolean);event.ports[0]?.postMessage({ready})})())});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request);if(cached)return cached;try{return await fetch(event.request)}catch(error){if(event.request.mode==='navigate')return await cache.match(new URL('./index.html',self.location.href));throw error}})())});`);
console.log('Precached',files.length,'files (including offline audio engine)');
