import { useEffect, useRef, useState } from 'react'
import { clearSavedGame, saveGame, type SavedGame } from './game-store'
import type { PlayableWords } from './game/projection'

/**
 * A színpad közös adatai és horgai (a rajzoló darabok a `game-parts.tsx`-ben).
 * A Class Gauntlet nyelvét követik, hogy minden játékmód kivetítése ugyanúgy
 * nézzen ki.
 */

/** A válaszok színei: vörös, kék, arany, zöld (gules, azure, or, vert). */
export const TINCTURES = ['var(--gules)', 'var(--azure)', 'var(--or)', 'var(--vert)'] as const

export const LETTERS = ['A', 'B', 'C', 'D'] as const

/** A színpad órája: 200 ms-onként újramér, hogy a gyűrű és az idő jártasson. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/** Escape: a tanár bármikor kiléphet a kivetítésből. */
export function useExitOnEscape(onExit: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])
}


/**
 * A vetítés billentyűzete: →, PageDown, a szóköz és az Enter visz tovább (mint
 * egy prezentáció-távirányító), az A–D vagy 1–4 pedig választ, ahol éppen
 * választani lehet. Beviteli mezőben gépelve egyik sem lép közbe.
 */
export function useStageKeys({ next, pick }: { next?: () => void; pick?: (index: number) => void }) {
  const latest = useRef({ next, pick })
  latest.current = { next, pick }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || target?.isContentEditable) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ' || event.key === 'Enter') {
        if (!latest.current.next) return
        event.preventDefault()
        latest.current.next()
        return
      }
      if (!latest.current.pick) return
      const letter = LETTERS.indexOf(event.key.toUpperCase() as (typeof LETTERS)[number])
      const digit = Number(event.key) - 1
      const byDigit = Number.isInteger(digit) && digit >= 0 && digit < LETTERS.length
      const index = letter >= 0 ? letter : byDigit ? digit : -1
      if (index < 0) return
      event.preventDefault()
      latest.current.pick(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * A játék mentése minden lépés után, és eltakarítása, amikor vége.
 *
 * A motor a `session`-jét helyben módosítja, ezért a `seq` a változás jele: arra
 * fut a mentés. Befejezett játéknál a mentés törlődik, hogy a Kvízjáték oldal ne
 * ajánljon folytatást egy lezárt vetítéshez.
 */
export function useGamePersistence(options: {
  mode: SavedGame['mode']
  title: string
  session: { seq: number }
  words: Map<string, PlayableWords>
  finished: boolean
  /** Hamis, amíg nincs játék (például a csapatnevek beírásánál). */
  enabled?: boolean
}) {
  const { mode, title, session, words, finished, enabled = true } = options
  const sequence = session.seq
  useEffect(() => {
    if (!enabled) return
    if (finished) {
      void clearSavedGame()
      return
    }
    void saveGame({ mode, title, savedAt: Date.now(), session, words: [...words.entries()] })
  }, [mode, title, session, words, finished, enabled, sequence])
}
