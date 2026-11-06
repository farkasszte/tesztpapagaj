import type { Question } from '../types'

/**
 * Differenciált kvíz (tp#45): két kérdésbank megy egyszerre, a képernyő bal és
 * jobb oldalán. A két oldal **ugyanannyi kérdést** játszik — ha az egyik bank
 * hosszabb, a rövidebb oldal hosszára vágjuk, mert a kör közös: a tanár egy
 * gombbal lépteti mindkettőt, és a ponttábla is közös.
 */
export type Side = 'a' | 'b'

export const SIDES: readonly Side[] = ['a', 'b'] as const

export function pairQuestions(
  left: readonly Question[],
  right: readonly Question[],
): { a: Question[]; b: Question[]; length: number } {
  const length = Math.min(left.length, right.length)
  return { a: left.slice(0, length), b: right.slice(0, length), length }
}

/** A közös visszaszámláló: mindkét oldal ugyanabban a pillanatban indul. */
export function sharedTimer(left: number, right: number): number {
  return Math.max(1, Math.round(Math.min(left, right)))
}

/** A ponttábla a két oldal játékosait egy listába fésüli (pont, majd név). */
export function mergeRanks<T extends { nickname: string; points: number; side: Side }>(
  players: readonly T[],
): T[] {
  return [...players].sort((one, other) => {
    if (other.points !== one.points) return other.points - one.points
    return one.nickname.localeCompare(other.nickname, 'hu')
  })
}
