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
  /** A legjobb helyes válasz ideje ms-ban (a körideje); nincs jó válasz → null. */
  bestMs: number | null
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
    let bestMs: number | null = null
    session.questions.forEach((question, index) => {
      const answer = findAnswer(session.answers[index], player.id)
      if (!answer) return
      answered += 1
      const ok = answerWasRight(question, answer)
      const gain = distanceOf(ok, answer.ms, limitMs, total)
      distance += gain
      if (ok) {
        right += 1
        bestMs = bestMs === null ? answer.ms : Math.min(bestMs, answer.ms)
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
      bestMs,
    }
  })

  const sorted = racers.sort(
    (a, b) => b.distance - a.distance || b.right - a.right || a.nickname.localeCompare(b.nickname),
  )

  // Holtverseny: azonos táv (és azonos jó válasz) azonos hely — a következő
  // hely kimarad, ahogy a versenyeken szokás (1, 1, 3).
  let place = 0
  return sorted.map((racer, index) => {
    const previous = sorted[index - 1]
    const tied =
      previous !== undefined && previous.distance === racer.distance && previous.right === racer.right
    if (!tied) place = index + 1
    return { ...racer, place }
  })
}

function findAnswer(list: ClassicAnswer[] | undefined, playerId: string): ClassicAnswer | undefined {
  return (list ?? []).find((entry) => entry.playerId === playerId)
}

/** Végigért-e a mezőny: a futam ott ér véget, ahol minden kérdés elhangzott. */
export function raceFinished(session: ClassicSession): boolean {
  return session.phase === 'REPORT' || session.phase === 'ENDED'
}

/**
 * A pálya aránya: a magasság a szélesség hányada. A stíluslap ugyanezt a számot
 * használja (`aspect-ratio: 1 / 0.22`), ezért a kettőt együtt kell módosítani.
 */
export const OVAL_RATIO = 0.22

/** Egy jelvény a pályán: egy futó vagy egy egy helyen álló csoport. */
export type TrackSpot = {
  id: string
  x: number
  y: number
  /** A megtett táv (0–100), csak kijelzésre. */
  at: number
  /** Melyik sávban áll (0 = a vonalon, 1–2 = keresztirányban kifelé). */
  slot: number
  /** A jelvényhez tartozó futók: egynél többnél a jelvényen létszám áll. */
  racers: Racer[]
}

/** Egy jelvényen legfeljebb ennyi futó fér el. */
const CLUSTER_SIZE = 3
/** A keresztirányú szétnyílás a pálya szélességének arányában. */
const SLOT_OFFSET = 0.03

/**
 * Pont a stadion alakú pályán, `at` = 0–1 közötti hely a teljes hosszon.
 *
 * A pálya két egyenesből és két félkörből áll (mint egy igazi ovál), a
 * rajzvonal a felső egyenes közepén van. Az egységek a szélesség arányában
 * értendők: x 0–1, y 0–`OVAL_RATIO`.
 */
function pointOnTrack(at: number): { x: number; y: number } {
  const height = OVAL_RATIO
  const radius = height / 2
  const straight = 1 - 2 * radius
  const arc = Math.PI * radius
  const lap = 2 * straight + 2 * arc
  // A start a felső egyenes közepe: ennyivel kell eltolni a körüljárást.
  const offset = (0.5 - radius) % lap
  let travelled = (((at % 1) + 1) % 1) * lap + offset
  travelled = ((travelled % lap) + lap) % lap

  if (travelled < straight) return { x: radius + travelled, y: 0 }

  travelled -= straight
  if (travelled < arc) {
    const angle = -Math.PI / 2 + travelled / radius
    return { x: 1 - radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) }
  }

  travelled -= arc
  if (travelled < straight) return { x: 1 - radius - travelled, y: height }

  travelled -= straight
  const angle = Math.PI / 2 + travelled / radius
  return { x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) }
}

/**
 * A mezőny **egyetlen** stadion pályán: a táv a pálya hosszának százaléka.
 *
 * A közel azonos helyen állókat egy jelvényre tesszük (legfeljebb hármat), a
 * csoportot a legjobb helyen álló futó távján ültetjük. A jelvény a vonalra
 * merőlegesen nyílik szét, hogy a színpadon ne takarják egymást.
 */
export function trackPositions(racers: Racer[]): TrackSpot[] {
  const groups: Racer[][] = []
  for (const racer of racers) {
    const last = groups[groups.length - 1]
    const anchor = last?.[0]
    if (last && anchor && last.length < CLUSTER_SIZE && Math.abs(racer.distance - anchor.distance) < 4) {
      last.push(racer)
    } else {
      groups.push([racer])
    }
  }

  let previous = Number.NEGATIVE_INFINITY
  return groups.map((group, index) => {
    const anchor = group[0]!
    const at = Math.max(0, Math.min(100, anchor.distance)) / 100
    const slot = Math.abs(anchor.distance - previous) < 4 ? index % 3 : 0
    previous = anchor.distance

    const point = pointOnTrack(at)
    const ahead = pointOnTrack(at + 0.004)
    const dx = ahead.x - point.x
    const dy = ahead.y - point.y
    const length = Math.hypot(dx, dy) || 1
    const offset = [0, -SLOT_OFFSET, SLOT_OFFSET][slot] ?? 0
    // A vonalra merőleges irány: a haladás irányának 90°-os elforgatása.
    const x = point.x - (dy / length) * offset
    const y = point.y + (dx / length) * offset

    return {
      id: anchor.id,
      x: x * 100,
      y: (y / OVAL_RATIO) * 100,
      at: anchor.distance,
      slot,
      racers: group,
    }
  })
}
