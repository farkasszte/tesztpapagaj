/**
 * A folyamatban lévő kvízjáték mentése.
 *
 * A vetítés a tanár gépén fut, és egy F5 vagy egy bezárt laptop még nem
 * jelentheti azt, hogy elveszett a fél óra: a játék állapota minden lépés után
 * a böngésző adatbázisába kerül, és a Kvízjáték oldal felajánlja a folytatást.
 *
 * Szándékosan **saját adatbázisban** él (`test-parrot-game-v1`), nem a
 * dolgozatokéban: ez másfél óránként eldobható állapot, a dolgozatok és a
 * kérdésbankok viszont a tanár munkája — így ennek a sémája soha nem kényszerít
 * verzióemelést a fő adatbázisra, és egy „minden játék törlése" nem ér a
 * kérdésekhez.
 */

import type { PlayableWords } from './game/projection'

export type GameMode = 'classic' | 'champion' | 'peril'

export type SavedGame = {
  mode: GameMode
  /** A kérdésbank neve, hogy a tanár felismerje, mit folytat. */
  title: string
  savedAt: number
  /** A motor `session`-je, ahogy van: a szabályok belső állapota. */
  session: unknown
  /** A bank saját szavai (képekhez, matekhoz), kérdés-azonosító szerint. */
  words: [string, PlayableWords][]
}

const DATABASE = 'test-parrot-game-v1'
const STORE = 'game'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = run(transaction.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

/** Elmenti a játékot; a böngésző tárolási hibája nem állítja meg a vetítést. */
export async function saveGame(record: SavedGame): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(record, 'current'))
  } catch {
    // Privát böngészés vagy tele tároló: a játék attól még megy tovább.
  }
}

export async function readSavedGame(): Promise<SavedGame | null> {
  try {
    const saved = await withStore<SavedGame | undefined>('readonly', (store) => store.get('current'))
    return saved?.mode ? saved : null
  } catch {
    return null
  }
}

export async function clearSavedGame(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete('current'))
  } catch {
    // Nincs mit tenni: a következő játék felülírja.
  }
}
