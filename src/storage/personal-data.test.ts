import { beforeEach, describe, expect, it } from 'bun:test'
import { PRACTICE_RESULTS_KEY } from '../practice/practice-results'
import { REVIEW_STORAGE_KEY } from '../game/review-deck'
import { AVATAR_KEY_PREFIX, avatarKeys, clearPersonalData, hasPersonalData, readPersonalData } from './personal-data'

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

const store = new Memory()
Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })

const practice = (name: string) => ({
  bankId: 'b1',
  name,
  total: 3,
  right: 2,
  at: 1,
})

const deck = (id: string) => ({
  id,
  title: 'Hibalista',
  createdAt: 1,
  expiresAt: Date.now() + 60_000,
  cards: [{ id: 'c1', question: 'Kérdés', answer: 'Válasz' }],
})

beforeEach(() => {
  store.clear()
})

describe('személyes adatok', () => {
  it('megszámolja, mi van a telefonon', () => {
    store.setItem(PRACTICE_RESULTS_KEY, JSON.stringify([practice('Első'), practice('Második')]))
    store.setItem(REVIEW_STORAGE_KEY, JSON.stringify([deck('d1')]))
    store.setItem(`${AVATAR_KEY_PREFIX}ABC123`, 'anna')
    store.setItem(`${AVATAR_KEY_PREFIX}XYZ789`, 'bela')
    // Idegen kulcs nem számít bele.
    store.setItem('tesztpapagaj:language', 'hu')

    expect(readPersonalData()).toEqual({ practice: 2, reviews: 1, avatars: 2 })
    expect(avatarKeys()).toEqual([`${AVATAR_KEY_PREFIX}ABC123`, `${AVATAR_KEY_PREFIX}XYZ789`])
    expect(hasPersonalData(readPersonalData())).toBe(true)
  })

  it('részben töröl: a többi a helyén marad', () => {
    store.setItem(PRACTICE_RESULTS_KEY, JSON.stringify([practice('Első')]))
    store.setItem(REVIEW_STORAGE_KEY, JSON.stringify([deck('d1')]))
    store.setItem(`${AVATAR_KEY_PREFIX}ABC123`, 'anna')

    const after = clearPersonalData(['practice'])

    expect(after).toEqual({ practice: 0, reviews: 1, avatars: 1 })
    expect(store.getItem(PRACTICE_RESULTS_KEY)).toBeNull()
    expect(store.getItem(REVIEW_STORAGE_KEY)).not.toBeNull()
  })

  it('mindent töröl, a figurákkal együtt, de a nyelvet nem', () => {
    store.setItem(PRACTICE_RESULTS_KEY, JSON.stringify([practice('Első')]))
    store.setItem(REVIEW_STORAGE_KEY, JSON.stringify([deck('d1')]))
    store.setItem(`${AVATAR_KEY_PREFIX}ABC123`, 'anna')
    store.setItem('tesztpapagaj:language', 'hu')

    const after = clearPersonalData()

    expect(after).toEqual({ practice: 0, reviews: 0, avatars: 0 })
    expect(hasPersonalData(after)).toBe(false)
    expect(avatarKeys()).toEqual([])
    // A felület nyelve nem személyes adat: marad.
    expect(store.getItem('tesztpapagaj:language')).toBe('hu')
  })

  it('üres tárolón is működik', () => {
    expect(readPersonalData()).toEqual({ practice: 0, reviews: 0, avatars: 0 })
    expect(clearPersonalData()).toEqual({ practice: 0, reviews: 0, avatars: 0 })
    expect(hasPersonalData({ practice: 0, reviews: 0, avatars: 0 })).toBe(false)
  })
})
