import { beforeEach, describe, expect, test } from 'bun:test'
import type { Flashcard } from './flashcard'
import {
  MAX_REVIEW_DECKS,
  REVIEW_STORAGE_KEY,
  REVIEW_TTL_MS,
  loadReviewDecks,
  removeReviewDeck,
  saveReviewDeck,
} from './review-deck'

const card = (id: string): Flashcard => ({
  id,
  prompt: `Kérdés ${id}`,
  answers: ['Helyes'],
  explanation: null,
})

/** Egyszerű tároló a teszthez: ugyanaz a felület, mint a `localStorage`. */
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

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  // A teljes futásban egy másik teszt getterrel tehette rá a tárolót: a
  // `defineProperty` mindkét esetben felülírja, a sima értékadás nem.
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Memory(),
    configurable: true,
    writable: true,
  })
})

describe('hibalista: tárolás', () => {
  test('mentés és visszaolvasás, a legújabb elöl', () => {
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q1')] }, 1000)
    saveReviewDeck({ id: 'b', title: 'Második', cards: [card('q2'), card('q3')] }, 2000)
    const decks = loadReviewDecks(2500)
    expect(decks.map((deck) => deck.id)).toEqual(['b', 'a'])
    expect(decks[0].cards).toHaveLength(2)
    expect(decks[0].expiresAt).toBe(2000 + REVIEW_TTL_MS)
  })

  test('ugyanaz az azonosító felülírja a régit, nem szaporítja a listát', () => {
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q1')] }, 1000)
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q2')] }, 3000)
    const decks = loadReviewDecks(3500)
    expect(decks).toHaveLength(1)
    expect(decks[0].cards[0].id).toBe('q2')
    expect(decks[0].createdAt).toBe(3000)
  })

  test('üres pakli nem keletkezik, és a régi is eltűnik', () => {
    expect(saveReviewDeck({ id: 'a', title: 'Első', cards: [] }, 1000)).toBeNull()
    expect(loadReviewDecks(1500)).toEqual([])
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q1')] }, 2000)
    saveReviewDeck({ id: 'a', title: 'Első', cards: [] }, 3000)
    expect(loadReviewDecks(3500)).toEqual([])
  })

  test('a hét nap után lejárt pakli nem jön vissza', () => {
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q1')] }, 1000)
    expect(loadReviewDecks(1000 + REVIEW_TTL_MS - 1)).toHaveLength(1)
    expect(loadReviewDecks(1000 + REVIEW_TTL_MS + 1)).toEqual([])
    // A lejárt bejegyzés a tárolóból is kikerül.
    expect(JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) ?? '[]')).toEqual([])
  })

  test('legfeljebb tíz pakli marad meg', () => {
    // Ugyanabban a pillanatban mentve: a legrégebben mentett esik ki.
    for (let index = 0; index < MAX_REVIEW_DECKS + 4; index += 1) {
      saveReviewDeck({ id: `d${index}`, title: `Pakli ${index}`, cards: [card(`q${index}`)] }, DAY)
    }
    const decks = loadReviewDecks(DAY + DAY)
    expect(decks).toHaveLength(MAX_REVIEW_DECKS)
    expect(decks[0].id).toBe(`d${MAX_REVIEW_DECKS + 3}`)
    expect(decks.at(-1)?.id).toBe('d4')
  })

  test('a törlés és a hibás tárolt tartalom sem töri el a listát', () => {
    saveReviewDeck({ id: 'a', title: 'Első', cards: [card('q1')] }, 1000)
    saveReviewDeck({ id: 'b', title: 'Második', cards: [card('q2')] }, 2000)
    expect(removeReviewDeck('a', 2500).map((deck) => deck.id)).toEqual(['b'])

    localStorage.setItem(REVIEW_STORAGE_KEY, '{ nem json')
    expect(loadReviewDecks(3000)).toEqual([])
    localStorage.setItem(REVIEW_STORAGE_KEY, '{"nem":"lista"}')
    expect(loadReviewDecks(3000)).toEqual([])
  })
})
