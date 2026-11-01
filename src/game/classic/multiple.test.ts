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

describe('sorrendezés', () => {
  const ordered: Question = {
    id: 'o1',
    prompt: 'Tedd sorrendbe a történéseket.',
    choices: ['Elindul', 'Megérkezik', 'Visszafordul'],
    correct: 1,
    correctOrder: [1, 2, 0],
  }

  test('a sorrend számít: az elemek sorrendje a válasz, nem a halmaz', () => {
    expect(answerIsRight(ordered, [1, 2, 0])).toBe(true)
    expect(answerIsRight(ordered, [0, 2, 1])).toBe(false)
    expect(answerIsRight(ordered, [1, 2])).toBe(false)
    expect(answerIsRight(ordered, [1, 2, 0, 0])).toBe(false)
  })

  function started() {
    const now = 1_000_000
    const clock = { now: () => now, random: () => 0.5 }
    const engine = new ClassicEngine(
      createClassicSession({
        code: 'ORD123',
        title: 'Sorrend',
        questions: [ordered],
        settings: { timerSeconds: 30, scoring: true, shuffleQuestions: false },
        clock,
      }),
      clock,
    )
    const joined = engine.join({ nickname: 'Bence' })
    if (!joined.ok) throw new Error(joined.message)
    engine.start()
    return { engine, playerId: joined.player.id }
  }

  test('a beküldött sorrend változatlanul tárolódik, és pontot csak a helyes ad', () => {
    const good = started()
    expect(good.engine.answerOrder(good.playerId, [1, 2, 0]).ok).toBe(true)
    expect(good.engine.session.answers[0]![0]!.choices).toEqual([1, 2, 0])
    expect(good.engine.session.players[0]!.points).toBeGreaterThan(500)

    const bad = started()
    expect(bad.engine.answerOrder(bad.playerId, [0, 1, 2]).ok).toBe(true)
    expect(bad.engine.session.players[0]!.points).toBe(0)
  })
})
