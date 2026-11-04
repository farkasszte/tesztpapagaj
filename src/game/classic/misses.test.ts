import { describe, expect, test } from 'bun:test'
import { missedBy, missedQuestions } from './misses'
import type { ClassicSession } from './types'
import type { Question } from '../types'

const question = (id: string, correct: number): Question => ({
  id,
  prompt: `Kérdés ${id}`,
  choices: ['A', 'B', 'C'],
  correct,
})

function session(partial: Partial<ClassicSession> = {}): ClassicSession {
  return {
    mode: 'classic',
    version: 1,
    code: '123456',
    createdAt: 0,
    title: 'Biológia',
    settings: { seconds: 20, shuffle: true, scoring: true, roundTop: false } as never,
    questions: [question('q1', 1), question('q2', 2), question('q3', 0)],
    players: [
      { id: 'p1', nickname: 'Anna', connected: true, points: 0, secret: 's1' },
      { id: 'p2', nickname: 'Bence', connected: true, points: 0, secret: 's2' },
    ],
    phase: 'ENDED',
    index: 2,
    answers: [
      // q1: Anna jó, Bence rossz
      [
        { playerId: 'p1', choice: 1, ms: 1000 },
        { playerId: 'p2', choice: 0, ms: 1200 },
      ],
      // q2: Anna rossz, Bence nem válaszolt
      [{ playerId: 'p1', choice: 0, ms: 900 }],
      // q3: mindketten jók
      [
        { playerId: 'p1', choice: 0, ms: 700 },
        { playerId: 'p2', choice: 0, ms: 800 },
      ],
    ],
    openedAt: null,
    deadline: null,
    seq: 1,
    ...partial,
  } as ClassicSession
}

describe('hivalista: ki mit rontott el', () => {
  test('csak a megválaszolt és rossz kérdés kerül a listára', () => {
    expect(missedQuestions(session(), 'p1').map((q) => q.id)).toEqual(['q2'])
    expect(missedQuestions(session(), 'p2').map((q) => q.id)).toEqual(['q1'])
  })

  test('a kihagyott kérdés nem hiba', () => {
    const answered = session()
    answered.answers[1] = []
    expect(missedQuestions(answered, 'p1').map((q) => q.id)).toEqual([])
  })

  test('mindenkihez saját lista, a hibátlan diák kimarad', () => {
    const oneWrong = session()
    oneWrong.answers = [
      [
        { playerId: 'p1', choice: 0, ms: 500 },
        { playerId: 'p2', choice: 1, ms: 500 },
      ],
      [
        { playerId: 'p1', choice: 0, ms: 500 },
        { playerId: 'p2', choice: 2, ms: 500 },
      ],
      [{ playerId: 'p2', choice: 0, ms: 500 }],
    ]
    const byPlayer = missedBy(oneWrong)
    // Bence mindent eltalált (és a harmadikat Anna ki is hagyta): csak Anna kap paklit.
    expect([...byPlayer.keys()]).toEqual(['p1'])
  })

  test('több helyes válasznál a hiányos jelölés is hiba', () => {
    const multi = session()
    multi.questions = [{ ...question('m1', 0), correctChoices: [0, 2] } as Question]
    multi.answers = [
      [
        { playerId: 'p1', choice: 0, choices: [0], ms: 100 },
        { playerId: 'p2', choice: 0, choices: [0, 2], ms: 100 },
      ],
    ]
    expect(missedQuestions(multi, 'p1').map((q) => q.id)).toEqual(['m1'])
    expect(missedQuestions(multi, 'p2')).toEqual([])
  })

  test('kiegészítésnél a beírt szöveg számít', () => {
    const blanks = session()
    blanks.questions = [{ ...question('b1', 0), blanks: ['fotoszintézis'] } as Question]
    blanks.answers = [
      [
        { playerId: 'p1', choice: 0, texts: ['fotoszintezis'], ms: 100 },
        { playerId: 'p2', choice: 0, texts: ['légzés'], ms: 100 },
      ],
    ]
    expect(missedQuestions(blanks, 'p1')).toEqual([])
    expect(missedQuestions(blanks, 'p2').map((q) => q.id)).toEqual(['b1'])
  })
})
