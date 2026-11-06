import { useSyncExternalStore } from 'react'

/**
 * A játék szövegének mérete (tp#47): a vetítés és a diák telefonja is
 * állíthatja. A lépcső szűk — a tanárnak nem csúszkálnia kell, hanem egy-két
 * koppintással nagyobbat vagy kisebbet kérnie.
 *
 * A méret a `--gq-text` változóba kerül, és csak a kérdés és a válaszok
 * szövegét szorozza: a színpad váza, a fejléc és a gombok helye nem mozdul,
 * tehát a kivetítés és a telefon elrendezése nem borul fel.
 */

export const TEXT_STEPS = [0.85, 1, 1.15, 1.3] as const
export const DEFAULT_STEP = 1

const KEY = 'tesztpapagaj:game-text'

let cached = DEFAULT_STEP
const listeners = new Set<() => void>()

function parse(raw: string | null): number {
  const parsed = Number(raw)
  const found = TEXT_STEPS.find((step) => Math.abs(step - parsed) < 0.001)
  return found ?? DEFAULT_STEP
}

function read(): number {
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_STEP
  }
}

function ensure(): number {
  cached = read()
  return cached
}

export function textScale(): number {
  return cached
}

export function setTextScale(step: number): void {
  const next = parse(String(step))
  if (next === cached) return
  cached = next
  try {
    // A böngésző tárolója a készülékhez tartozik: a tanár laptopja és a diák
    // telefonja külön méretet jegyez meg, és a következő játékra is megmarad.
    localStorage.setItem(KEY, String(next))
  } catch {
    // Tiltott tároló mellett is működik, csak nem marad meg a következő körre.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTextScale(): number {
  return useSyncExternalStore(subscribe, ensure, () => DEFAULT_STEP)
}

/** Egy lépéssel kisebb vagy nagyobb, a lépcső végén megállva. */
export function stepTextScale(direction: -1 | 1): void {
  const index = TEXT_STEPS.findIndex((step) => Math.abs(step - textScale()) < 0.001)
  const next = TEXT_STEPS[Math.min(TEXT_STEPS.length - 1, Math.max(0, index + direction))]
  if (next !== undefined) setTextScale(next)
}

/** A böngésző tárolójában maradt méret betöltése az első rajzolás előtt. */
export function refreshTextScale(): void {
  if (read() !== cached) {
    cached = read()
    for (const listener of listeners) listener()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) refreshTextScale()
  })
}
