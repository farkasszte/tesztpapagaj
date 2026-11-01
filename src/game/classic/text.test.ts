import { describe, expect, test } from 'bun:test'
import { ClassicEngine, answerIsRight, createClassicSession } from './engine'
import type { Question } from '../types'

/** Egy kérdés a motorhoz: a beírt válasz típusai kártya nélkül. */
const fillIn: Question = {
  id: 'f1',
  prompt: 'A növény a _____ (1) során cukrot termel a _____ (2).',
  choices: [],
  correct: 0,
  blanks: ['fotoszintézis', 'levélben'],
}
const short: Question = { id: 's1', prompt: 'Mi a fotoszintézis terméke?', choices: [], correct: 0, accepted: ['glükóz', 'cukor'] }

function started(question: Question) {
  const clock = { now: () => 1_000_000, random: () => 0.5 }
  const engine = new ClassicEngine(
    createClassicSession({
      code: 'TXT123',
      title: 'Szöveg',
      questions: [question],
      settings: { timerSeconds: 30, scoring: true, shuffleQuestions: false },
      clock,
    }),
    clock,
  )
  const joined = engine.join({ nickname: 'Panni' })
  if (!joined.ok) throw new Error(joined.message)
  engine.start()
  return { engine, playerId: joined.player.id }
}

describe('a beírt válasz elbírálása a motorban', () => {
  test('kiegészítés: minden hézag számít, és az ékezet nem', () => {
    expect(answerIsRight(fillIn, [], ['fotoszintézis', 'levélben'])).toBe(true)
    expect(answerIsRight(fillIn, [], ['FOTOSZINTEZIS', '  Levélben. '])).toBe(true)
    expect(answerIsRight(fillIn, [], ['fotoszintézis', 'gyökérben'])).toBe(false)
    // Egy hézag kimarad → nem válasz.
    expect(answerIsRight(fillIn, [], ['fotoszintézis'])).toBe(false)
  })

  test('rövid válasz: bármelyik elfogadható alak, és a kis elütés is', () => {
    expect(answerIsRight(short, [], ['glükóz'])).toBe(true)
    expect(answerIsRight(short, [], ['cukor'])).toBe(true)
    expect(answerIsRight(short, [], ['glukoz'])).toBe(true)
    expect(answerIsRight(short, [], ['oxigén'])).toBe(false)
    expect(answerIsRight(short, [], [])).toBe(false)
  })

  test('a motor rögzíti a beírt szöveget, és pontot ad érte', () => {
    const { engine, playerId } = started(fillIn)
    const result = engine.answerTexts(playerId, ['fotoszintézis', 'levélben'])
    expect(result.ok).toBe(true)
    const stored = engine.session.answers[0]![0]!
    expect(stored.texts).toEqual(['fotoszintézis', 'levélben'])
    expect(stored.choice).toBe(-1)
    expect(engine.session.players[0]!.points).toBeGreaterThan(500)
  })

  test('hiányos vagy üres beírás nem megy be', () => {
    const { engine, playerId } = started(fillIn)
    expect(engine.answerTexts(playerId, ['fotoszintézis']).ok).toBe(false)
    expect(engine.answerTexts(playerId, ['fotoszintézis', '   ']).ok).toBe(false)
    expect(engine.session.answers[0]).toHaveLength(0)
  })

  test('a rossz beírás nem ad pontot, de rögzítve van', () => {
    const { engine, playerId } = started(fillIn)
    engine.answerTexts(playerId, ['légzés', 'levélben'])
    expect(engine.session.players[0]!.points).toBe(0)
    expect(engine.session.answers[0]).toHaveLength(1)
  })
})
