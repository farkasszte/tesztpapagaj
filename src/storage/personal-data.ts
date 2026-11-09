import { PRACTICE_RESULTS_KEY, readPracticeResults } from '../practice/practice-results'
import { loadReviewDecks } from '../game/review-deck'

/**
 * A diák saját adatai a telefonon.
 *
 * Három dolog él a böngésző tárolójában, és mind a diákhoz tartozik, nem a
 * tanár anyagához: a gyakorló eredményei, a hibalistái (ismétlő paklik) és a
 * választott figura. A bankok, a kérdések és a játékeredmények nem ide
 * tartoznak — azok a tanár munkája, és saját törléssel mennek.
 *
 * Törlés után a gyakorló „legutóbbi eredmény" és a figura is eltűnik, tehát a
 * művelet visszafordíthatatlan; ezért megerősítést kér.
 */

export const AVATAR_KEY_PREFIX = 'testparrot.game-avatar.'

export type PersonalDataPart = 'practice' | 'reviews' | 'avatars'

export type PersonalDataSummary = {
  practice: number
  reviews: number
  avatars: number
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** A választott figurák kulcsai (szobakódonként egy). */
export function avatarKeys(store: Storage | null = storage()): string[] {
  if (!store) return []
  const keys: string[] = []
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index)
    if (key?.startsWith(AVATAR_KEY_PREFIX)) keys.push(key)
  }
  return keys
}

/** Mi van most a telefonon — a felület ebből írja a számokat. */
export function readPersonalData(): PersonalDataSummary {
  return {
    practice: readPracticeResults().length,
    reviews: loadReviewDecks().length,
    avatars: avatarKeys().length,
  }
}

/**
 * Törlés. Részben is hívható (egy sor gombja), és egészben is („mindent").
 * Visszaadja a törlés utáni állapotot, hogy a felület ne számolgasson.
 */
export function clearPersonalData(parts: readonly PersonalDataPart[] = ['practice', 'reviews', 'avatars']): PersonalDataSummary {
  const store = storage()
  if (!store) return { practice: 0, reviews: 0, avatars: 0 }
  if (parts.includes('practice')) store.removeItem(PRACTICE_RESULTS_KEY)
  if (parts.includes('reviews')) store.removeItem('tesztpapagaj:review-decks')
  if (parts.includes('avatars')) for (const key of avatarKeys(store)) store.removeItem(key)
  return readPersonalData()
}

/** Igaz, ha van mit törölni — a gomb ekkor aktív. */
export function hasPersonalData(summary: PersonalDataSummary): boolean {
  return summary.practice > 0 || summary.reviews > 0 || summary.avatars > 0
}
