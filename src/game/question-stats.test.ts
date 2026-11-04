import { beforeEach, describe, expect, test } from 'bun:test'
import {
  loadQuestionStats,
  recordQuestionResult,
  recordRevealCounts,
  rightPercent,
} from './question-stats'

// A modul a böngésző tárolójára épül; a teszt egy memóriabeli pótlást tesz a
// helyére, hogy a mérés ne a környezettől függjön.
class MemoryStorage {
  private readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
  removeItem(key: string) { this.map.delete(key) }
  clear() { this.map.clear() }
}

beforeEach(() => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
})

describe('kérdés-statisztika', () => {
  test('a felfedés megoszlásából számol: hányan válaszoltak, hányan találták el', () => {
    recordRevealCounts('q1', [2, 6, 2], 1)
    const stat = loadQuestionStats().q1
    expect(stat.asked).toBe(10)
    expect(stat.right).toBe(6)
    expect(rightPercent(stat)).toBe(60)
  })

  test('a játékok összeadódnak, és a helyes válasz nem lehet több a válaszoknál', () => {
    recordRevealCounts('q1', [1, 3], 1)
    recordRevealCounts('q1', [0, 4], 1)
    // Az első körben hárman, a másodikban négyen válaszoltak jól.
    const stat = loadQuestionStats().q1
    expect(stat.asked).toBe(8)
    expect(stat.right).toBe(7)

    recordQuestionResult('q2', 4, 9)
    expect(loadQuestionStats().q2.right).toBe(4)
  })

  test('válasz nélkül nem keletkezik adat, és adat híján nincs százalék', () => {
    recordRevealCounts('q3', [0, 0], 0)
    recordQuestionResult('q4', 0, 0)
    expect(loadQuestionStats().q3).toBeUndefined()
    expect(loadQuestionStats().q4).toBeUndefined()
    expect(rightPercent(undefined)).toBeNull()
    expect(rightPercent({ asked: 0, right: 0, updatedAt: 0 })).toBeNull()
  })
})
