import type { ClassicAnswer, ClassicSession } from './classic/types'
import { answerWasRight } from './classic/misses'

/**
 * Grand Prix — a Klasszikus kérdés-válasz körére épülő futam.
 *
 * Nem új állapotgép: ugyanaz a napló (kérdés, válasz, felfedés, következő) fut,
 * csak a **jelentése** más. A pont helyett megtett táv van, és a táv a válasz
 * sebességével arányos: a gyors válasz nitrót ad. A rossz válasz kipördülés —
 * nem veszít semmit, csak nem halad.
 *
 * A Zsírkréta `GameModes/GrandPrix/raceUtils.ts` szabálya, a mi naplónkra mérve.
 */

export type Racer = {
  id: string
  nickname: string
  /** A megtett táv a pálya százalékában (0–100). */
  distance: number
  /** Az utolsó helyezés (1 = vezet); holtversenynél a korábbi idő számít. */
  place: number
  /** Hány nitró (gyors, helyes válasz). */
  nitro: number
  /** Hány kipördülés (rossz válasz). */
  spunOut: number
  answered: number
  right: number
  /** A legutóbb mért sebesség km/h-ban, csak kijelzésre. */
  speed: number
}

/** A pálya: ennyi kérdés alatt lehet végigérni. */
export const RACE_LENGTH = 100

/**
 * Egy válasz távja a pálya százalékában.
 *
 * A lassú helyes válasz is visz előre (a lépés 65%-át), a gyors rátét: a maradék
 * 35% a válaszidő arányában. A rossz válasz nulla — a futam nem büntet, csak áll.
 */
export function distanceOf(correct: boolean, ms: number, limitMs: number, questions: number): number {
  if (!correct) return 0
  const limit = Math.max(1, limitMs)
  const ratio = Math.max(0, Math.min(1, 1 - ms / limit))
  const step = RACE_LENGTH / Math.max(1, questions)
  return step * (0.65 + 0.35 * ratio)
}

/** A futam állása a naplóból, a táv szerint csökkenő sorrendben. */
export function raceOf(session: ClassicSession): Racer[] {
  const limitMs = session.settings.timerSeconds * 1000
  const total = session.questions.length
  const racers = session.players.map((player) => {
    let distance = 0
    let nitro = 0
    let spunOut = 0
    let answered = 0
    let right = 0
    let speed = 0
    session.questions.forEach((question, index) => {
      const answer = findAnswer(session.answers[index], player.id)
      if (!answer) return
      answered += 1
      const ok = answerWasRight(question, answer)
      const gain = distanceOf(ok, answer.ms, limitMs, total)
      distance += gain
      if (ok) {
        right += 1
        const ratio = Math.max(0, Math.min(1, 1 - answer.ms / Math.max(1, limitMs)))
        speed = Math.round(90 + ratio * 130)
        if (ratio > 0.5) nitro += 1
      } else {
        spunOut += 1
        speed = 0
      }
    })
    return {
      id: player.id,
      nickname: player.nickname,
      distance: Math.min(RACE_LENGTH, Math.round(distance * 10) / 10),
      place: 0,
      nitro,
      spunOut,
      answered,
      right,
      speed,
    }
  })

  return racers
    .sort((a, b) => b.distance - a.distance || b.right - a.right || a.nickname.localeCompare(b.nickname))
    .map((racer, index) => ({ ...racer, place: index + 1 }))
}

function findAnswer(list: ClassicAnswer[] | undefined, playerId: string): ClassicAnswer | undefined {
  return (list ?? []).find((entry) => entry.playerId === playerId)
}

/** Végigért-e a mezőny: a futam ott ér véget, ahol minden kérdés elhangzott. */
export function raceFinished(session: ClassicSession): boolean {
  return session.phase === 'REPORT' || session.phase === 'ENDED'
}
