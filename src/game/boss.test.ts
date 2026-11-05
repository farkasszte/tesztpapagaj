import { describe, expect, test } from 'bun:test'
import { bossAfter, bossOf, lastBite } from './boss'
import type { ClassicSession } from './classic/types'
import type { Question } from './types'

const question = (id: string, correct: number): Question => ({
  id,
  prompt: `Kérdés ${id}`,
  choices: ['A', 'B', 'C'],
  correct,
})

function session(answers: ClassicSession['answers'], count = 2): ClassicSession {
  return {
    mode: 'classic',
    version: 1,
    code: '123456',
    createdAt: 0,
    title: 'Szörny',
    settings: { timerSeconds: 20, shuffle: false, scoring: true, roundTop: false } as never,
    questions: Array.from({ length: count }, (_, index) => question(`q${index + 1}`, 1)),
    players: [
      { id: 'p1', nickname: 'Anna', connected: true, points: 0, secret: 's1' },
      { id: 'p2', nickname: 'Bence', connected: true, points: 0, secret: 's2' },
      { id: 'p3', nickname: 'Cili', connected: true, points: 0, secret: 's3' },
    ],
    phase: 'ENDED',
    index: count - 1,
    answers,
    openedAt: null,
    deadline: null,
    seq: 1,
  } as ClassicSession
}

describe('Szörnytámadás: közös életerő és pajzs', () => {
  test('a többség helyes válasza sebzi a szörnyet', () => {
    const state = bossAfter('dragon', [{ right: 2, wrong: 1 }])
    expect(state.hp).toBe(90)
    expect(state.hits).toBe(1)
    expect(state.shield).toBe(30)
    expect(state.bites).toBe(0)
  })

  test('a többség rossz válasza a pajzsot rágja', () => {
    const state = bossAfter('dragon', [{ right: 1, wrong: 2 }])
    expect(state.hp).toBe(100)
    expect(state.bites).toBe(1)
    expect(state.shield).toBe(20)
  })

  test('holtverseny és üres kérdés: nem történik semmi', () => {
    const state = bossAfter('dragon', [{ right: 1, wrong: 1 }, { right: 0, wrong: 0 }])
    expect(state.hp).toBe(100)
    expect(state.shield).toBe(30)
    expect(state.hits).toBe(0)
    expect(state.bites).toBe(0)
  })

  test('tíz találat elsöpri a sárkányt, tíz harapás eltöri a pajzsot', () => {
    const won = bossAfter('dragon', Array.from({ length: 10 }, () => ({ right: 3, wrong: 0 })))
    expect(won.hp).toBe(0)
    expect(won.outcome).toBe('win')
    const lost = bossAfter('dragon', Array.from({ length: 3 }, () => ({ right: 0, wrong: 3 })))
    expect(lost.shield).toBe(0)
    expect(lost.outcome).toBe('lose')
  })

  test('a dühöngés a harmad alatt kapcsol be', () => {
    expect(bossAfter('dragon', Array.from({ length: 6 }, () => ({ right: 2, wrong: 0 }))).enraged).toBe(false)
    expect(bossAfter('dragon', Array.from({ length: 7 }, () => ({ right: 2, wrong: 0 }))).enraged).toBe(true)
  })

  test('a naplóból számol: mindenki válasza számít, a helyesség az engine szabálya', () => {
    const state = bossOf(
      session([
        [
          { playerId: 'p1', choice: 1, ms: 100 },
          { playerId: 'p2', choice: 1, ms: 100 },
          { playerId: 'p3', choice: 0, ms: 100 },
        ],
        [
          { playerId: 'p1', choice: 0, ms: 100 },
          { playerId: 'p2', choice: 0, ms: 100 },
          { playerId: 'p3', choice: 1, ms: 100 },
        ],
      ]),
    )
    expect(state.hits).toBe(1)
    expect(state.bites).toBe(1)
    expect(state.hp).toBe(90)
    expect(state.shield).toBe(20)
  })

  test('az utolsó kérdés kimenetele a színpad jelzéséhez', () => {
    const hit = session([
      [
        { playerId: 'p1', choice: 1, ms: 100 },
        { playerId: 'p2', choice: 1, ms: 100 },
      ],
      [
        { playerId: 'p1', choice: 1, ms: 100 },
        { playerId: 'p2', choice: 1, ms: 100 },
      ],
    ])
    expect(lastBite(hit)).toBe('hit')
    const tie = session([[]])
    expect(lastBite(tie)).toBeNull()
  })
})
