/**
 * A gyakorló eredményei a telefonon.
 *
 * A gyakorlás szoba nélkül megy, tehát nincs hova küldeni — de a diáknak meg
 * kell tudnia mutatni az iskolában. Ezért a készülék tárolójában marad az
 * utolsó húsz eredmény, bankonként visszakereshetően.
 */

export type PracticeResult = {
  bankId: string
  name: string
  /** Hányat talált el. */
  right: number
  /** Hány kérdést válaszolt meg. */
  total: number
  /** Mikor fejezte be (ms). */
  at: number
}

export const PRACTICE_RESULTS_KEY = 'testparrot.practice-results'
/** Ennyi fér el: húsz játék bőven elég visszanézésre, és nem nő a tároló. */
export const MAX_PRACTICE_RESULTS = 20

export function readPracticeResults(): PracticeResult[] {
  try {
    const raw = localStorage.getItem(PRACTICE_RESULTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is PracticeResult => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Partial<PracticeResult>
      return (
        typeof candidate.bankId === 'string' &&
        typeof candidate.name === 'string' &&
        Number.isFinite(candidate.right) &&
        Number.isFinite(candidate.total) &&
        Number.isFinite(candidate.at)
      )
    })
  } catch {
    return []
  }
}

/** Az eredmény mentése; visszaadja a mentett listát (legújabb elöl). */
export function savePracticeResult(entry: Omit<PracticeResult, 'at'> & { at?: number }): PracticeResult[] {
  const result: PracticeResult = {
    bankId: entry.bankId,
    name: entry.name,
    right: Math.max(0, Math.round(entry.right)),
    total: Math.max(0, Math.round(entry.total)),
    at: entry.at ?? Date.now(),
  }
  const all = [result, ...readPracticeResults()].slice(0, MAX_PRACTICE_RESULTS)
  try {
    localStorage.setItem(PRACTICE_RESULTS_KEY, JSON.stringify(all))
  } catch {
    // Magánböngészés: az eredmény akkor is látszik a végén, csak nem marad meg.
  }
  return all
}

/** Egy bank eredményei, legújabb elöl. */
export function practiceResultsFor(bankId: string, all = readPracticeResults()): PracticeResult[] {
  return all.filter((entry) => entry.bankId === bankId)
}

/** „3/5 — 60%" — a felület és a napló ugyanígy írja. */
export function practiceResultText(result: Pick<PracticeResult, 'right' | 'total'>): string {
  const percent = result.total === 0 ? 0 : Math.round((result.right / result.total) * 100)
  return `${result.right}/${result.total} — ${percent}%`
}
