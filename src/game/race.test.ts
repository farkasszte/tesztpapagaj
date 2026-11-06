import { describe, expect, test } from 'bun:test'
import { RACE_LENGTH, distanceOf, raceOf, trackPositions } from './race'
import type { ClassicSession } from './classic/types'
import type { Question } from './types'

const question = (id: string, correct: number): Question => ({
  id,
  prompt: `Kérdés ${id}`,
  choices: ['A', 'B', 'C'],
  correct,
})

function session(answers: ClassicSession['answers']): ClassicSession {
  return {
    mode: 'classic',
    version: 1,
    code: '123456',
    createdAt: 0,
    title: 'Futam',
    settings: { timerSeconds: 20, shuffle: false, scoring: true, roundTop: false } as never,
    questions: [question('q1', 1), question('q2', 2)],
    players: [
      { id: 'p1', nickname: 'Anna', connected: true, points: 0, secret: 's1' },
      { id: 'p2', nickname: 'Bence', connected: true, points: 0, secret: 's2' },
    ],
    phase: 'ENDED',
    index: 1,
    answers,
    openedAt: null,
    deadline: null,
    seq: 1,
  } as ClassicSession
}

describe('Grand Prix: táv a pont helyett', () => {
  test('a lassú helyes válasz is visz előre, a gyors többet', () => {
    const slow = distanceOf(true, 19_000, 20_000, 10)
    const fast = distanceOf(true, 1_000, 20_000, 10)
    const step = RACE_LENGTH / 10
    expect(slow).toBeCloseTo(step * 0.65 + step * 0.35 * 0.05, 5)
    expect(fast).toBeGreaterThan(slow)
    expect(fast).toBeLessThanOrEqual(step)
  })

  test('a rossz válasz nem visz előre, és nem is vesz el semmit', () => {
    expect(distanceOf(false, 1_000, 20_000, 10)).toBe(0)
  })

  test('a futam állása: több táv elöl, a nitró és a kipördülés számolva', () => {
    const racers = raceOf(
      session([
        [
          { playerId: 'p1', choice: 1, ms: 1_000 },
          { playerId: 'p2', choice: 1, ms: 15_000 },
        ],
        [
          { playerId: 'p1', choice: 2, ms: 2_000 },
          { playerId: 'p2', choice: 0, ms: 3_000 },
        ],
      ]),
    )
    expect(racers.map((racer) => racer.nickname)).toEqual(['Anna', 'Bence'])
    expect(racers[0].place).toBe(1)
    expect(racers[0].nitro).toBe(2)
    expect(racers[0].right).toBe(2)
    expect(racers[0].spunOut).toBe(0)
    expect(racers[1].nitro).toBe(0)
    expect(racers[1].spunOut).toBe(1)
    expect(racers[1].right).toBe(1)
    expect(racers[0].distance).toBeGreaterThan(racers[1].distance)
    // A pálya 100%-a két kérdés alatt is legfeljebb 100%.
    expect(racers[0].distance).toBeLessThanOrEqual(RACE_LENGTH)
  })

  test('aki nem válaszolt, ott áll a rajtnál', () => {
    const racers = raceOf(session([[], []]))
    expect(racers.every((racer) => racer.distance === 0)).toBe(true)
    expect(racers.map((racer) => racer.answered)).toEqual([0, 0])
  })
})

describe('Grand Prix: egy pálya, a hely a mezőnyhöz igazodik', () => {
  const racer = (id: string, distance: number) => ({
    id,
    nickname: id,
    distance,
    place: 1,
    nitro: 0,
    spunOut: 0,
    answered: 0,
    right: 0,
    speed: 0,
  })

  test('a start a pálya tetején van, a negyedek a négy égtáj', () => {
    const [start] = trackPositions([racer('a', 0)])
    expect(start!.x).toBeCloseTo(50, 0)
    expect(start!.y).toBeCloseTo(12, 0)

    const [quarter] = trackPositions([racer('a', 25)])
    expect(quarter!.x).toBeCloseTo(94, 0)
    expect(quarter!.y).toBeCloseTo(50, 0)

    const [half] = trackPositions([racer('a', 50)])
    expect(half!.y).toBeCloseTo(88, 0)

    const [three] = trackPositions([racer('a', 75)])
    expect(three!.x).toBeCloseTo(6, 0)
  })

  test('a holtversenyben állók keresztirányban szétnyílnak', () => {
    const spots = trackPositions([racer('a', 30), racer('b', 30), racer('c', 31)])
    expect(spots).toHaveLength(3)
    const xs = new Set(spots.map((spot) => Math.round(spot.x * 10)))
    expect(xs.size).toBeGreaterThan(1)
  })

  test('minden futó a pálya terén belül marad', () => {
    const spots = trackPositions([racer('a', 0), racer('b', 33), racer('c', 66), racer('d', 100)])
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThan(0)
      expect(spot.x).toBeLessThan(100)
      expect(spot.y).toBeGreaterThan(0)
      expect(spot.y).toBeLessThan(100)
    }
  })
})
