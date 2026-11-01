import { describe, expect, test } from 'bun:test'
import { ClassicEngine, createClassicSession, answerIsRight, reportOf } from './engine'
import type { Question } from '../types'

/**
 * A több helyes válasz szabálya: minden helyes válasz, és semmi más.
 *
 * A játék eddig egyetlen választ ismert; ez a típus akkor helyes, ha a diák
 * pontosan a helyeseket jelölte meg. A félmegoldás hibás — nem ad pontot, és a
 * jelentésben sem számít helyesnek.
 */

const questions: Question[] = [
  {
    id: 'q1',
    prompt: 'Melyek fővárosok?',
    choices: ['Párizs', 'Lyon', 'Róma', 'Nizza'],
    correct: 0,
    correctChoices: [0, 2],
  },
]

function setup(scoring = true) {
  const now = 1_000_000
  const clock = { now: () => now, random: () => 0.5 }
  const engine = new ClassicEngine(
    createClassicSession({
      code: 'ABC123',
      title: 'Több helyes',
      questions,
      settings: { timerSeconds: 30, scoring, shuffleQuestions: false },
      clock,
    }),
    clock,
  )
  const joined = engine.join({ nickname: 'Panni' })
  if (!joined.ok) throw new Error(joined.message)
  engine.start()
  return { engine, playerId: joined.player.id }
}

describe('több helyes válasz', () => {
  test('csak a pontosan helyes jelölés számít helyesnek', () => {
    const one = questions[0]!
    expect(answerIsRight(one, [0, 2])).toBe(true)
    expect(answerIsRight(one, [2, 0])).toBe(true)
    expect(answerIsRight(one, [0])).toBe(false)
    expect(answerIsRight(one, [0, 1, 2])).toBe(false)
    expect(answerIsRight(one, [1])).toBe(false)
    expect(answerIsRight(one, [])).toBe(false)
  })

  test('a pontot a teljes jelölés adja, a félmegoldás nem', () => {
    const right = setup()
    expect(right.engine.answerMany(right.playerId, [0, 2]).ok).toBe(true)
    expect(right.engine.session.players[0]!.points).toBeGreaterThan(500)

    const half = setup()
    expect(half.engine.answerMany(half.playerId, [0]).ok).toBe(true)
    expect(half.engine.session.players[0]!.points).toBe(0)
  })

  test('a válasz minden megjelölt választ megőriz, az elsővel együtt', () => {
    const { engine, playerId } = setup()
    engine.answerMany(playerId, [2, 0])
    const answer = engine.session.answers[0]![0]!
    expect(answer.choice).toBe(0)
    expect(answer.choices).toEqual([0, 2])
  })

  test('a jelentés válaszonként számolja a jelöléseket, és a helyest csak teljes jelölésnél', () => {
    const { engine, playerId } = setup()
    engine.answerMany(playerId, [0, 2])
    engine.lock()
    const report = reportOf(engine.session)
    expect(report.questions[0]!.counts).toEqual([1, 0, 1, 0])
    expect(report.questions[0]!.correct).toBe(1)
    expect(report.students[0]).toMatchObject({ nickname: 'Panni', correct: 1, answered: 1 })
  })

  test('az egyetlen válaszos kérdés változatlanul működik', () => {
    const single: Question[] = [
      { id: 's1', prompt: 'Melyik a legnagyobb tó?', choices: ['Balaton', 'Bajkál'], correct: 1 },
    ]
    expect(answerIsRight(single[0]!, [1])).toBe(true)
    expect(answerIsRight(single[0]!, [1, 0])).toBe(false)
  })
})
