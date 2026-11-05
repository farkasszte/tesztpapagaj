import { describe, expect, test } from 'bun:test'
import { averagePercentOf, buildGameResult, studentPercentOf, successPercentOf } from './results'
import type { ClassicSession } from './classic/types'

/**
 * A játék eredménye: a session válaszaiból kérdésenkénti mátrix.
 *
 * A mátrix a tanár egyetlen igazi kérdésére válaszol — ki mit tudott, melyik
 * kérdés ment rosszul —, ezért a cellák és az arányok a tesztek tárgya, nem a
 * megjelenítés.
 */

/**
 * A session kérdései már a **játszható** alak (a `playableQuestions` bontotta ki
 * a dokumentumból): a helyes válasz indexe `correct`, a szövegek a `choices`-ban.
 */
const question = (id: string) => ({
  id,
  prompt: `Kérdés ${id}`,
  choices: ['Jó', 'Rossz'],
  correct: 0,
})

const session = (answers: ClassicSession['answers']): ClassicSession => ({
  mode: 'classic',
  version: 1,
  code: '123456',
  createdAt: 1_700_000_000_000,
  title: 'Biológia',
  settings: { timerSeconds: 20, scoring: true },
  questions: [question('q1'), question('q2'), question('q3')] as ClassicSession['questions'],
  players: [
    { id: 'p1', nickname: 'Anna', points: 20, joinedAt: 1, connected: true },
    { id: 'p2', nickname: 'Bence', points: 10, joinedAt: 2, connected: true },
  ],
  phase: 'REPORT',
  index: 2,
  answers,
  openedAt: null,
  deadline: null,
  seq: 12,
})

const right = (playerId: string) => ({ playerId, choice: 0, ms: 1200 })
const wrong = (playerId: string) => ({ playerId, choice: 1, ms: 1500 })

describe('játék eredménye', () => {
  test('diákonként és kérdésenként: helyes, hibás, kihagyott', () => {
    const result = buildGameResult(session([
      [right('p1'), wrong('p2')],
      [right('p1')],
      [],
    ]), { mode: 'classic', title: 'Biológia', now: 1_700_000_100_000 })

    expect(result).not.toBeNull()
    if (!result) return
    const anna = result.players.find((player) => player.nickname === 'Anna')
    const bence = result.players.find((player) => player.nickname === 'Bence')
    expect(anna?.cells).toEqual(['right', 'right', 'skipped'])
    expect(anna?.correct).toBe(2)
    expect(bence?.cells).toEqual(['wrong', 'skipped', 'skipped'])
    expect(bence?.correct).toBe(0)
    // A mátrix oszlopai a feltett kérdések, nem a válaszok.
    expect(result.questions.map((entry) => entry.id)).toEqual(['q1', 'q2', 'q3'])
  })

  test('kérdésenkénti sikeresség és csoportátlag', () => {
    const result = buildGameResult(session([
      [right('p1'), wrong('p2')],
      [right('p1')],
      [],
    ]), { mode: 'classic', title: 'Biológia' })
    if (!result) throw new Error('nincs eredmény')

    // q1: 1 helyes a 2 válaszból; q2: 1 az 1-ből; q3: senki nem válaszolt.
    expect(result.questions.map(successPercentOf)).toEqual([50, 100, 0])
    expect(result.questions.map((entry) => entry.answered)).toEqual([2, 1, 0])
    // Csoportátlag: 2 helyes válasz (Anna kettőt tudott) / (2 diák × 3 kérdés) = 33%.
    expect(averagePercentOf(result)).toBe(33)
    expect(studentPercentOf(result.players[0]!, result.questions.length)).toBe(67)
  })

  test('a kivetítés (válaszok nélkül) nem hoz létre eredményt', () => {
    expect(buildGameResult(session([]), { mode: 'classic', title: 'Biológia' })).toBeNull()
    const empty = session([])
    expect(buildGameResult({ ...empty, players: [] }, { mode: 'classic', title: 'Biológia' })).toBeNull()
  })

  test('az azonosító a játék kezdetéből jön, tehát az újramentés felülír', () => {
    const first = buildGameResult(session([[right('p1')]]), { mode: 'classic', title: 'Biológia' })
    const again = buildGameResult(session([[right('p1')]]), { mode: 'classic', title: 'Biológia', now: 42 })
    expect(first?.id).toBe(again?.id)
    expect(first?.id).toBe('classic-1700000000000-123456')
  })
})
