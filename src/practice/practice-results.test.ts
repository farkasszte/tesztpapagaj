import { beforeEach, describe, expect, it } from 'bun:test'
import {
  MAX_PRACTICE_RESULTS,
  PRACTICE_RESULTS_KEY,
  practiceResultText,
  practiceResultsFor,
  readPracticeResults,
  savePracticeResult,
} from './practice-results'

/** Egyszerű tároló: ugyanaz a felület, mint a `localStorage` (a tesztekben nincs). */
class Memory implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Memory(),
    configurable: true,
    writable: true,
  })
})

describe('gyakorló eredmények', () => {
  it('mentés után visszaolvasható, bankonként szűrve', () => {
    savePracticeResult({ bankId: 'b1', name: 'Sejtek', right: 3, total: 5, at: 1000 })
    savePracticeResult({ bankId: 'b2', name: 'Fizika', right: 1, total: 4, at: 2000 })
    const all = readPracticeResults()
    expect(all).toHaveLength(2)
    // Legújabb elöl.
    expect(all[0].bankId).toBe('b2')
    expect(practiceResultsFor('b1')).toHaveLength(1)
    expect(practiceResultsFor('b1')[0]).toMatchObject({ right: 3, total: 5 })
  })

  it('legfeljebb a megadott számú eredményt tartja meg', () => {
    for (let index = 0; index < MAX_PRACTICE_RESULTS + 5; index += 1) {
      savePracticeResult({ bankId: 'b1', name: 'Sejtek', right: index, total: 10, at: index })
    }
    const all = readPracticeResults()
    expect(all).toHaveLength(MAX_PRACTICE_RESULTS)
    // A legfrissebb maradt meg, a legrégebbiek kiestek.
    expect(all[0].right).toBe(MAX_PRACTICE_RESULTS + 4)
  })

  it('a sérült tárolót üres listának veszi, nem dob', () => {
    localStorage.setItem(PRACTICE_RESULTS_KEY, '{ nem json')
    expect(readPracticeResults()).toEqual([])
    localStorage.setItem(PRACTICE_RESULTS_KEY, JSON.stringify([{ bankId: 1 }, null, 'x']))
    expect(readPracticeResults()).toEqual([])
  })

  it('a felirat: tört és százalék', () => {
    expect(practiceResultText({ right: 10, total: 20 })).toBe('10/20 — 50%')
    expect(practiceResultText({ right: 3, total: 3 })).toBe('3/3 — 100%')
    expect(practiceResultText({ right: 0, total: 0 })).toBe('0/0 — 0%')
  })
})
