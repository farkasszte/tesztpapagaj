import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'bun:test'
import { IDBFactory } from 'fake-indexeddb'
import { clearResults, deleteResult, listResults, loadResult, MAX_RESULTS, saveResult } from './results-store'
import type { GameResult } from './results'

/**
 * Az eredmények tárolója a játék saját adatbázisában él. A tesztek a valódi
 * IndexedDB-t hajtják (fake-indexeddb), tehát a kulcs, a sorrend és a takarítás
 * ugyanúgy működik, mint a böngészőben.
 */

const result = (index: number): GameResult => ({
  id: `classic-${index}`,
  mode: 'classic',
  title: `Játék ${index}`,
  startedAt: 1_000 + index,
  endedAt: 2_000 + index,
  players: [{ nickname: 'Anna', points: 10, correct: 1, answered: 1, cells: ['right'] }],
  questions: [{ id: 'q1', prompt: 'Kérdés', correct: 1, answered: 1 }],
})

beforeEach(() => {
  // Minden teszt friss adatbázissal indul.
  globalThis.indexedDB = new IDBFactory()
})

describe('játékeredmények tárolója', () => {
  test('mentés és visszaolvasás: a legutóbbi játék elöl', async () => {
    await saveResult(result(1))
    await saveResult(result(2))
    const all = await listResults()
    expect(all.map((entry) => entry.id)).toEqual(['classic-2', 'classic-1'])
    expect(await loadResult('classic-1')).toMatchObject({ title: 'Játék 1' })
  })

  test('ugyanaz az azonosító felülír, nem duplikál', async () => {
    await saveResult(result(1))
    await saveResult({ ...result(1), title: 'Javított' })
    const all = await listResults()
    expect(all).toHaveLength(1)
    expect(all[0]?.title).toBe('Javított')
  })

  test('egy eredmény törölhető, a többi marad', async () => {
    await saveResult(result(1))
    await saveResult(result(2))
    await deleteResult('classic-1')
    expect((await listResults()).map((entry) => entry.id)).toEqual(['classic-2'])
  })

  test('a régi játékok kiesnek, a legutóbbi száz megmarad', async () => {
    for (let index = 0; index < MAX_RESULTS + 5; index += 1) await saveResult(result(index))
    const all = await listResults()
    expect(all).toHaveLength(MAX_RESULTS)
    // A legrégebbi öt esett ki; a legfrissebb elöl van.
    expect(all.at(-1)?.id).toBe('classic-5')
    expect(all[0]?.id).toBe(`classic-${MAX_RESULTS + 4}`)
  })

  test('minden eredmény törölhető', async () => {
    await saveResult(result(1))
    await saveResult(result(2))
    await clearResults()
    expect(await listResults()).toEqual([])
  })
})
