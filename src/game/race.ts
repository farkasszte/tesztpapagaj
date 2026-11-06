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

/** Egy futó helye az ovál pályán, a pálya terének százalékában. */
export type TrackSpot = {
  id: string
  x: number
  y: number
  /** A megtett táv (0–100), csak kijelzésre. */
  at: number
  /** Melyik sávban áll (0 = a vonalon, 1–2 = keresztirányban kifelé). */
  slot: number
}

/**
 * A mezőny **egyetlen** ovál pályán: a táv a pálya hosszának százaléka.
 *
 * A startvonal a pálya tetején van, az óramutató járásával egyezően haladunk.
 * A közel azonos helyen állókat keresztirányban szétnyitjuk (legfeljebb három
 * sávban), hogy a színpadon ne takarják egymást — ezért a hely nem tisztán
 * geometriai, hanem a mezőnyhöz igazodik.
 */
export function trackPositions(racers: Racer[]): TrackSpot[] {
  let previous = Number.NEGATIVE_INFINITY
  let cluster = 0

  return racers.map((racer) => {
    if (Math.abs(racer.distance - previous) < 4) cluster += 1
    else cluster = 0
    previous = racer.distance

    const at = Math.max(0, Math.min(100, racer.distance)) / 100
    const angle = at * Math.PI * 2 - Math.PI / 2
    // Keresztirány: a pálya érintőjére merőleges egységvektor. Egyedül álló
    // futó a vonalon marad; a holtversenyesek [0, −, +] sávba nyílnak.
    const slot = cluster % 3
    const offset = [0, -7, 7][slot] ?? 0

    return {
      id: racer.id,
      x: 50 + 44 * Math.cos(angle) - Math.sin(angle) * offset,
      y: 50 + 38 * Math.sin(angle) + Math.cos(angle) * offset,
      at: racer.distance,
      slot,
    }
  })
}
