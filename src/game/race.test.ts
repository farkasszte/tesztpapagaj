import { describe, expect, test } from 'bun:test'
import { RACE_LENGTH, distanceOf, raceOf } from './race'
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
