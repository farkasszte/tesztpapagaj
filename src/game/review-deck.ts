import type { Flashcard } from './flashcard'

/**
 * Hibalista — a diák saját ismétlő paklija a telefonján.
 *
 * A játék végén a tanár gépe mindenkinek elküldi a maga elrontott kérdéseit
 * (`ReviewView`), a telefon pedig eltárolja: hét napig megmarad, és a
 * tanulókártya-nézővel átnézhető. Se szerver, se fiók, se név — a pakli a
 * böngésző tárolójában él, ahogy a kérdés-statisztika is.
 */

export type ReviewDeck = {
  /** A pakli azonosítója: szobakód + játékos, hogy egy játék egy pakli legyen. */
  id: string
  title: string
  createdAt: number
  expiresAt: number
  cards: Flashcard[]
}

/** A tanár üzenete a játék végén: ebből lesz a pakli a telefonon. */
export type ReviewView = {
  mode: 'review'
  deckId: string
  title: string
  cards: Flashcard[]
}

export const REVIEW_STORAGE_KEY = 'tesztpapagaj:review-decks'
/** Hét nap, mint a Zsírkréta ismétlő paklijainál. */
export const REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Ennyi pakli fér el a telefonon; a legrégebbi esik ki. */
export const MAX_REVIEW_DECKS = 10

/** A tároló, ha van (tesztekben és privát böngészésben nincs). */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** A tárolt paklik és hogy esett-e ki közülük lejárt (akkor vissza kell írni). */
function readDecks(now: number): { decks: ReviewDeck[]; pruned: boolean } {
  const store = storage()
  if (!store) return { decks: [], pruned: false }
  try {
    const raw = store.getItem(REVIEW_STORAGE_KEY)
    if (!raw) return { decks: [], pruned: false }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { decks: [], pruned: true }
    const decks = parsed.filter((deck): deck is ReviewDeck => {
      if (!deck || typeof deck !== 'object') return false
      const candidate = deck as Partial<ReviewDeck>
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.expiresAt === 'number' &&
        Array.isArray(candidate.cards)
      )
    })
    const live = decks.filter((deck) => deck.expiresAt > now)
    return { decks: live, pruned: live.length !== parsed.length }
  } catch {
    return { decks: [], pruned: false }
  }
}

function write(decks: ReviewDeck[]): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(REVIEW_STORAGE_KEY, JSON.stringify(decks.slice(0, MAX_REVIEW_DECKS)))
  } catch {
    // Betelt tároló: a játék megy tovább, csak a pakli nem marad meg.
  }
}

/** A megőrzött paklik, a legújabb elöl; a lejártak kimúlnak. */
export function loadReviewDecks(now: number = Date.now()): ReviewDeck[] {
  const { decks, pruned } = readDecks(now)
  const live = decks.sort((a, b) => b.createdAt - a.createdAt)
  if (pruned) write(live)
  return live
}

/**
 * Egy pakli eltárolása. Ugyanaz az azonosító **felülírja** a régit (egy játék
 * egy pakli), így az újrajátszás nem szaporítja a listát. Üres pakli esetén a
 * régi törlődik: ha mindent eltalált, nincs mit ismételni.
 */
export function saveReviewDeck(
  deck: { id: string; title: string; cards: Flashcard[] },
  now: number = Date.now(),
): ReviewDeck | null {
  const others = readDecks(now).decks.filter((entry) => entry.id !== deck.id)
  if (deck.cards.length === 0) {
    write(others)
    return null
  }
  const saved: ReviewDeck = {
    id: deck.id,
    title: deck.title,
    createdAt: now,
    expiresAt: now + REVIEW_TTL_MS,
    cards: deck.cards,
  }
  write([saved, ...others])
  return saved
}

/** Egy pakli törlése a telefonról. */
export function removeReviewDeck(id: string, now: number = Date.now()): ReviewDeck[] {
  const left = readDecks(now).decks.filter((deck) => deck.id !== id)
  write(left)
  return left.sort((a, b) => b.createdAt - a.createdAt)
}
