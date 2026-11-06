import { useEffect, useRef, useState } from 'react'
import { clearSavedGame, saveGame, type SavedGame } from './store'
import type { PlayableWords } from './projection'

/**
 * A színpad közös adatai és horgai (a rajzoló darabok a `parts.tsx`-ben).
 * A Class Gauntlet nyelvét követik, hogy minden játékmód kivetítése ugyanúgy
 * nézzen ki.
 */

/** A válaszok színei: vörös sarok, kék sarok, mély arany, szilva. */
export const TINCTURES = ['var(--gules)', 'var(--azure)', 'var(--or-card)', 'var(--plum)'] as const

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
/**
 * Fókuszcsapda a színpadhoz.
 *
 * A színpad `role="dialog" aria-modal="true"`, de a böngésző nem zárja be a
 * fókuszt magától: Tab-bal a tanár kimehetne a háttérbe, és vetítés közben azt
 * sem látná, hol áll. A horg a nyitáskor az első fogható elemre áll, majd a
 * Tabot és a Shift+Tabot a színpadon belül forgatja.
 *
 * A láthatatlan vagy letiltott elemek kimaradnak, tehát a fókusz mindig olyan
 * helyre lép, amit a tanár lát is.
 */
export function useStageFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const focusable = () =>
      [...root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((node) => node.offsetParent !== null || node === document.activeElement)

    // Nyitáskor a színpad első fogható eleme kapja a fókuszt; ha nincs ilyen,
    // maga a színpad, hogy az Esc és a nyilak azonnal működjenek.
    if (!root.contains(document.activeElement)) {
      const first = focusable()[0] ?? root
      if (first === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      first.focus({ preventScroll: true })
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !root.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      }
    }

    root.addEventListener('keydown', onKey)
    return () => root.removeEventListener('keydown', onKey)
  }, [])
  return ref
}

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
  /**
   * A játék lezárásakor **egyszer** lefutó visszahívás: itt menti a színpad a
   * játék eredményét. A mentés nem a szerkezet része — a Bajnoknak és a
   * Veszély!-nek más a játékállapota —, ezért a színpad dönti el, mit ír ki.
   */
  onFinished?: () => void
}) {
  const { mode, title, session, words, finished, enabled = true, onFinished } = options
  const sequence = session.seq
  const closed = useRef(false)
  // A visszahívás referenciában él: egy soron belül írt nyíl minden rajzoláskor
  // új lenne, és a mentés a függőségek miatt újraindulna.
  const finish = useRef(onFinished)
  finish.current = onFinished
  useEffect(() => {
    if (!enabled) return
    if (finished) {
      void clearSavedGame()
      if (!closed.current) {
        closed.current = true
        finish.current?.()
      }
      return
    }
    closed.current = false
    void saveGame({ mode, title, savedAt: Date.now(), session, words: [...words.entries()] })
  }, [mode, title, session, words, finished, enabled, sequence])
}
