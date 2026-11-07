const registryDatabaseName = 'test-parrot-exams-v1'
const databaseVersion = 8
const mediaStore = 'media-assets'

// A héj gyorsítótára (`A2`): a kivetítéses játék akkor is induljon, ha az
// iskolai hálózat éppen nem ad hálózatot. Csak **éles buildben** él: a
// regisztráció `?offline=1`-gyel történik, a fejlesztői szerveren (és így a
// tesztekben) nem cache-elünk, hogy ne kapjunk elavult shellt.
const offline = new URL(self.location.href).searchParams.get('offline') === '1'
// A build azonosítója a pluginból (`service-worker.ts`): minden build más
// cache-nevet kap, ezért a deploy után nem maradhat elavult héj a böngészőben.
const BUILD = '__BUILD__'
const SHELL_CACHE = `test-parrot-shell-${BUILD}`
const SHELL_ENTRIES = ['/', '/icon-256.png', '/favicon.ico']
// A build asset-jegyzéke: ebből tudjuk, mely hashelt fájlok tartoznak a héjhoz.
const MANIFEST_URL = '/assets-manifest.json'
const STATIC_FILE = /\.(?:js|css|mjs|woff2?|ttf|otf|png|svg|ico|json|md)$/

/**
 * Az egész készlet előre a cache-be: a játék oldala lustán tölti a saját
 * csomagjait, azokat offline már nem lehet letölteni. A jegyzék a build
 * kimenete (`assets-manifest.json`), ezért mindig a valódi, hashelt fájlneveket
 * tartalmazza.
 */
async function precache(cache) {
  const collected = new Set(SHELL_ENTRIES)
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (response.ok) {
      const manifest = await response.json()
      for (const entry of Object.values(manifest)) {
        if (!entry || typeof entry !== 'object') continue
        for (const candidate of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
          if (typeof candidate === 'string' && candidate && !candidate.endsWith('.map')) {
            collected.add(`/${candidate}`)
          }
        }
      }
    }
  } catch {
    // jegyzék nélkül is működik: a futásidejű cache majd pótolja
  }
  // Egy hiányzó fájl ne akassza meg a telepítést.
  await Promise.all([...collected].map((entry) => cache.add(entry).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (offline) await precache(await caches.open(SHELL_CACHE))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (offline) {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('test-parrot-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      )
    }
    await self.clients.claim()
  })())
})

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, databaseVersion)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function recordFrom(databaseName, storeName, key) {
  const database = await openDatabase(databaseName)
  try {
    if (!database.objectStoreNames.contains(storeName)) return null
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const get = transaction.objectStore(storeName).get(key)
      get.onsuccess = () => resolve(get.result ?? null)
      get.onerror = () => reject(get.error)
    })
  } finally {
    database.close()
  }
}

async function assetFor(hash) {
  return recordFrom(registryDatabaseName, mediaStore, hash)
}

/** A héj: navigációnál hálózat előbb, hálózat nélkül a cache-elt index.html. */
async function shellFor(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const fresh = await fetch(request)
    if (fresh.ok) cache.put('/', fresh.clone()).catch(() => undefined)
    return fresh
  } catch {
    const cached = (await cache.match('/')) ?? (await cache.match('/index.html'))
    return cached ?? Response.error()
  }
}

/** Készlet: cache előbb (a hashelt fájlnevek miatt ez mindig helyes), utána hálózat. */
async function fileFor(request) {
  const cache = await caches.open(SHELL_CACHE)
  // URL-re illesztünk, `Vary` megkötés nélkül: a telepítéskor `fetch`-csel
  // tárolt válasz `Vary: Accept-Encoding`-et hozhat, és a `<link rel=stylesheet>`
  // kérése e nélkül nem találná meg a cache-t.
  const cached = await cache.match(request.url, { ignoreVary: true })
  if (cached) return cached
  try {
    const fresh = await fetch(request)
    if (fresh.ok) cache.put(request.url, fresh.clone()).catch(() => undefined)
    return fresh
  } catch {
    return cached ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.origin === self.location.origin && url.pathname.startsWith('/local-images/')) {
    const hash = url.pathname.slice('/local-images/'.length)
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      event.respondWith(new Response('Image not found', { status: 404 }))
      return
    }
    event.respondWith(assetFor(hash).then(
      (asset) => asset
        ? new Response(asset.bytes, { headers: { 'Content-Type': asset.mimeType } })
        : new Response('Image not found', { status: 404 }),
      () => new Response('Image not found', { status: 404 }),
    ))
    return
  }

  if (!offline || event.request.method !== 'GET' || url.origin !== self.location.origin) return
  // A vendégoldalak (Google Drive, jutalom) nem a héj részei.
  if (url.pathname.startsWith('/api/')) return

  if (event.request.mode === 'navigate') {
    event.respondWith(shellFor(event.request))
    return
  }
  if (STATIC_FILE.test(url.pathname)) event.respondWith(fileFor(event.request))
})
