import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A tesztek és a kimenet-előállítás fájlokat olvasnak: betűtípusokat, logót,
 * formátum-sémákat, próbaanyagokat. Ha ezeket az olvasó fájlhoz képest
 * relatívan nyitnánk meg, minden mozgatás csendben eltörné őket — ezért a
 * projekt gyökerétől számítunk, egyszer, itt.
 *
 * A gyökeret nem írjuk be: felfelé lépkedünk, amíg `package.json`-hoz nem
 * érünk. Így ez a fájl is mozgatható anélkül, hogy bármi elromlana.
 */
let cachedRoot: string | null = null

export function projectRoot(): string {
  if (cachedRoot) return cachedRoot
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let step = 0; step < 12; step += 1) {
    if (existsSync(join(directory, 'package.json'))) {
      cachedRoot = directory
      return directory
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('a projekt gyökere nem található (nincs package.json felfelé)')
}

/** A `public/` alatti fájl — a böngészőnek kiszolgált betűtípusok, logó, sémák. */
export const publicPath = (...parts: string[]) => join(projectRoot(), 'public', ...parts)

/** A `src/` alatti fájl — például a stíluslap, amit a tipográfia-teszt olvas. */
export const srcPath = (...parts: string[]) => join(projectRoot(), 'src', ...parts)

/**
 * A próbaanyagok a gyökér `fixtures/` mappájában élnek, nem a forrás mellett:
 * így a formátumok kódja bármikor átmozgatható anélkül, hogy a tesztek
 * útvonalai elavulnának.
 */
export const fixturePath = (...parts: string[]) => join(projectRoot(), 'fixtures', ...parts)
