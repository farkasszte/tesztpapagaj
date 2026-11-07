import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

/**
 * A service worker (`src/service-worker.js`) egy helyen él, és a build adja ki
 * `/service-worker.js` néven.
 *
 * Két dolgot ez a plugin tud, amit egy `public/` fájl nem:
 *
 * - **build-azonosítót** ír a cache nevébe (`__BUILD__`), így minden deploy új
 *   héj-cache-t hoz létre, és a régi nem maradhat elavult tartalommal a
 *   böngészőben;
 * - **fejlesztői módban is kiszolgálja** ugyanazt a fájlt (middleware-rel), így
 *   a dev és az éles ugyanazt a szkriptet futtatja — csak a dev nem cache-el
 *   (`?offline=1` nélkül regisztrálódik).
 */
const SOURCE = 'src/service-worker.js'
const EMITTED = 'service-worker.js'

export function serviceWorker(): Plugin {
  let source = SOURCE
  let stamp = 'dev'

  const script = () =>
    fs.readFileSync(source, 'utf8').replaceAll("'__BUILD__'", JSON.stringify(stamp))

  const serve: Connect.NextHandleFunction = (request, response, next) => {
    if ((request.url ?? '').split('?')[0] !== `/${EMITTED}`) {
      next()
      return
    }
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache')
    response.end(script())
  }

  return {
    name: 'service-worker',
    configResolved(config) {
      source = path.resolve(config.root, SOURCE)
    },
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (file) => file.type === 'chunk' && file.isEntry,
      )
      stamp = entry && entry.type === 'chunk' ? entry.fileName : String(Date.now())
      this.emitFile({ type: 'asset', fileName: EMITTED, source: script() })
    },
  }
}
