import { useState } from 'react'

/**
 * Kérdés-szintű tapasztalat: hányszor kérdeztük, és hányszor találta el az
 * osztály.
 *
 * A játék a tanár gépén fut, tehát a mérés is ott marad: a böngésző tárolójában,
 * kérdés-azonosító szerint, név nélkül. A bank listája ebből mutat egy jelzést
 * („62%”), hogy a tanár lássa, melyik kérdést érdemes újratanítani — ez a
 * legrövidebb út a játék és a következő óra között.
 *
 * Csak ott számolunk, ahol az osztály tényleg válaszolt: kivetítésnél nincs
 * rögzített válasz, tehát ott nem keletkezik adat (és nem is hazudunk).
 */

export type QuestionStat = { asked: number; right: number; updatedAt: number }
export type QuestionStats = Record<string, QuestionStat>

const KEY = 'tesztpapagaj:question-stats'
/** Ennyi kérdés tárolt adata fér el; a legrégebben frissültek esnek ki. */
const LIMIT = 4000

/** A tároló: a böngészőben a localStorage, tesztekben a pótlása. */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function loadQuestionStats(): QuestionStats {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const stats: QuestionStats = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as QuestionStat
      if (typeof entry?.asked === 'number' && typeof entry?.right === 'number') {
        stats[id] = { asked: entry.asked, right: entry.right, updatedAt: entry.updatedAt ?? 0 }
      }
    }
    return stats
  } catch {
    return {}
  }
}

function save(stats: QuestionStats): void {
  try {
    const entries = Object.entries(stats)
    if (entries.length > LIMIT) {
      entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      stats = Object.fromEntries(entries.slice(0, LIMIT))
    }
    storage()?.setItem(KEY, JSON.stringify(stats))
  } catch {
    // A tárhely tele lehet: a játék ilyenkor is folytatódik, csak nem mér.
  }
}

/**
 * Egy kérdés kimenetele: hányan válaszoltak, és közülük hányan találták el.
 * Nulla válasznál nem írunk semmit (kivetítésnél ez a helyzet).
 */
export function recordQuestionResult(questionId: string, asked: number, right: number): void {
  if (!questionId || asked <= 0) return
  const stats = loadQuestionStats()
  const previous = stats[questionId] ?? { asked: 0, right: 0, updatedAt: 0 }
  stats[questionId] = {
    asked: previous.asked + asked,
    right: previous.right + Math.max(0, Math.min(right, asked)),
    updatedAt: Date.now(),
  }
  save(stats)
}

/** A megoszlásból: hányan válaszoltak, és hányan a helyes választ. */
export function recordRevealCounts(questionId: string, counts: readonly number[] | null, correct: number | null): void {
  if (!counts || correct === null) return
  const asked = counts.reduce((sum, value) => sum + value, 0)
  recordQuestionResult(questionId, asked, counts[correct] ?? 0)
}

/** Az eltalálási arány százalékban, vagy null, ha még nincs adat. */
export function rightPercent(stat: QuestionStat | undefined): number | null {
  if (!stat || stat.asked <= 0) return null
  return Math.round((stat.right / stat.asked) * 100)
}

/** A statisztika betöltése egy felülethez (a bank listája ezt használja). */
export function useQuestionStats(): QuestionStats {
  const [stats] = useState<QuestionStats>(() => loadQuestionStats())
  return stats
}
