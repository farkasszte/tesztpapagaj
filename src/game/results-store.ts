import type { GameResult } from './results'

/**
 * A játékok eredményeinek tárolója.
 *
 * A **játék saját adatbázisában** él (`test-parrot-game-v1`), nem a tanár
 * dolgozatai között: ez másfél óránként keletkező futószalag-adat, a dolgozatok
 * és bankok viszont a tanár munkája. Így a takarítás (régi játékok eldobása)
 * soha nem érinti a kérdéseket, és a séma sem kényszerít verzióemelést a fő
 * adatbázisra.
 *
 * A tanár legfeljebb ennyi játékot lát vissza; a legrégebbiek automatikusan
 * kiesnek, hogy a tároló ne teljen meg némán.
 */

import { openGameDatabase, RESULT_STORE } from '../game-store'

/** Ennyi lejátszott játék marad meg; a régebbiek kiesnek. */
export const MAX_RESULTS = 100

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openGameDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(RESULT_STORE, mode)
      const request = run(transaction.objectStore(RESULT_STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

/** Az eredmény mentése; ugyanaz az azonosító felülír, nem duplikál. */
export async function saveResult(result: GameResult): Promise<void> {
  try {
    // A tárolónak nincs keyPath-ja, ezért a kulcsot külön adjuk: enélkül a
    // `put` DataError-t dob, és a mentés némán elmaradna.
    await withStore('readwrite', (store) => store.put(result, result.id))
    await trimResults()
  } catch {
    // A vetítés nem állhat meg azon, hogy a statisztika nem íródott ki.
  }
}

async function trimResults(): Promise<void> {
  const all = await listResults()
  if (all.length <= MAX_RESULTS) return
  const drop = all.slice(MAX_RESULTS)
  for (const result of drop) {
    await withStore('readwrite', (store) => store.delete(result.id)).catch(() => undefined)
  }
}

/** A játékok, legutóbbiból visszafelé. */
export async function listResults(): Promise<GameResult[]> {
  try {
    const all = await withStore('readonly', (store) => store.getAll() as IDBRequest<GameResult[]>)
    return all
      .filter((result) => Array.isArray(result?.players) && Array.isArray(result?.questions))
      .sort((left, right) => right.endedAt - left.endedAt)
  } catch {
    return []
  }
}

export async function loadResult(id: string): Promise<GameResult | null> {
  try {
    const found = await withStore('readonly', (store) => store.get(id) as IDBRequest<GameResult | undefined>)
    return found ?? null
  } catch {
    return null
  }
}

export async function deleteResult(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id))
  } catch {
    // A lista a következő megnyitáskor már nem mutatja.
  }
}

/** Minden eredmény törlése — a tanár kérésére, visszavonhatatlanul. */
export async function clearResults(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear())
  } catch {
    // Lásd fent.
  }
}
