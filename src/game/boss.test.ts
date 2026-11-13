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

function session(answers: ClassicSession['answers'], count = 2, bossTier?: 'peaceful' | 'fierce' | 'legendary'): ClassicSession {
  return {
    mode: 'classic',
    version: 1,
    code: '123456',
    createdAt: 0,
    title: 'Sárkányok völgye',
    settings: { timerSeconds: 20, shuffle: false, scoring: true, roundTop: false, bossTier } as never,
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

describe('Sárkányok völgye: kategóriák és harci logika', () => {
  test('a nehézségi kategóriák szerint skálázódik a sárkány életereje', () => {
    // 10 kérdés esetén:
    // Békés: 40% -> 4 találat kell -> 40 HP
    const peaceful = bossAfter('peaceful', [], 10)
    expect(peaceful.tier).toBe('peaceful')
    expect(peaceful.maxHp).toBe(40)
    expect(peaceful.hp).toBe(40)

    // Harcias: 60% -> 6 találat kell -> 60 HP
    const fierce = bossAfter('fierce', [], 10)
    expect(fierce.tier).toBe('fierce')
    expect(fierce.maxHp).toBe(60)
    expect(fierce.hp).toBe(60)

    // Legendás: 80% -> 8 találat kell -> 80 HP
    const legendary = bossAfter('legendary', [], 10)
    expect(legendary.tier).toBe('legendary')
    expect(legendary.maxHp).toBe(80)
    expect(legendary.hp).toBe(80)
  })

  test('a többség helyes válasza 10 HP-val sebzi a sárkányt', () => {
    const state = bossAfter('legendary', [{ right: 2, wrong: 1 }], 10)
    expect(state.hits).toBe(1)
    expect(state.hp).toBe(70) // 80 - 10
    expect(state.shield).toBe(30)
    expect(state.bites).toBe(0)
  })

  test('pajzs csak akkor veszik el, ha senki nem nyom a jóra', () => {
    // 1 jó, 2 rossz: valaki eltalálta, így a pajzs MEGMARAD!
    const savedByOne = bossAfter('legendary', [{ right: 1, wrong: 2 }], 10)
    expect(savedByOne.shield).toBe(30)
    expect(savedByOne.bites).toBe(0)
    expect(savedByOne.hits).toBe(0) // nincs többség sem

    // 0 jó, 3 rossz: senki nem nyomott a jóra -> a pajzs veszít egy védelmi pontot
    const bitten = bossAfter('legendary', [{ right: 0, wrong: 3 }], 10)
    expect(bitten.shield).toBe(20)
    expect(bitten.bites).toBe(1)
  })

  test('holtverseny és üres kérdés: nem történik semmi', () => {
    const state = bossAfter('legendary', [{ right: 1, wrong: 1 }, { right: 0, wrong: 0 }], 10)
    expect(state.hp).toBe(80)
    expect(state.shield).toBe(30)
    expect(state.hits).toBe(0)
    expect(state.bites).toBe(0)
  })

  test('a sárkány eleste azonnali győzelem; későbbi rossz válaszok nem sebzik a pajzsot', () => {
    // Harcias sárkány (60 HP) 6 jó válasz után elbukik
    const answers = [
      ...Array.from({ length: 6 }, () => ({ right: 3, wrong: 0 })),
      // A harc vége után jövő válaszok:
      { right: 0, wrong: 3 },
      { right: 0, wrong: 3 },
    ]
    const won = bossAfter('fierce', answers, 10)
    expect(won.hp).toBe(0)
    expect(won.outcome).toBe('win')
    // A pajzs nem sérült, mert a sárkány már elpusztult:
    expect(won.shield).toBe(30)
    expect(won.bites).toBe(0)
  })

  test('a pajzs eltörése azonnali vereség; későbbi jó válaszok nem sebzik a sárkányt', () => {
    const answers = [
      { right: 0, wrong: 3 },
      { right: 0, wrong: 3 },
      { right: 0, wrong: 3 },
      // Vereség után:
      { right: 3, wrong: 0 },
    ]
    const lost = bossAfter('legendary', answers, 10)
    expect(lost.shield).toBe(0)
    expect(lost.outcome).toBe('lose')
    expect(lost.hp).toBe(80) // nem kapott találatot a vereség után
  })

  test('a dühöngés akkor kapcsol be, ha az életerő a harmadára vagy az alá esik', () => {
    // 60 HP esetén harmad = 20 HP -> 3 találat (30 HP maradt) még nem dühöng, 4 találat (20 HP maradt) már dühöng
    expect(bossAfter('fierce', Array.from({ length: 3 }, () => ({ right: 2, wrong: 0 })), 10).enraged).toBe(false)
    expect(bossAfter('fierce', Array.from({ length: 4 }, () => ({ right: 2, wrong: 0 })), 10).enraged).toBe(true)
  })

  test('a munkamenetből számol, figyelembe véve a kérdésszámot és a választott kategóriát', () => {
    // 2 kérdés, békés sárkány (40% -> 1 találat = 10 HP)
    const state = bossOf(
      session(
        [
          [
            { playerId: 'p1', choice: 1, ms: 100 },
            { playerId: 'p2', choice: 1, ms: 100 },
            { playerId: 'p3', choice: 0, ms: 100 },
          ],
          [
            { playerId: 'p1', choice: 0, ms: 100 },
            { playerId: 'p2', choice: 0, ms: 100 },
            { playerId: 'p3', choice: 0, ms: 100 },
          ],
        ],
        2,
        'peaceful',
      ),
    )
    expect(state.tier).toBe('peaceful')
    expect(state.maxHp).toBe(10)
    expect(state.hp).toBe(0) // 1 találat elég volt a legyőzéséhez
    expect(state.outcome).toBe('win')
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

    const holdShield = session(
      [
        [
          { playerId: 'p1', choice: 1, ms: 100 },
          { playerId: 'p2', choice: 0, ms: 100 },
        ],
      ],
      1,
    )
    expect(lastBite(holdShield)).toBeNull() // nincs többség, de volt jó válasz

    const bite = session(
      [
        [
          { playerId: 'p1', choice: 0, ms: 100 },
          { playerId: 'p2', choice: 0, ms: 100 },
        ],
      ],
      1,
    )
    expect(lastBite(bite)).toBe('bite')
  })

  test('nyitott kérdésnél a beküldött válaszok csak a kör végén (REVEAL) értékelődnek ki', () => {
    const base = session(
      [
        [
          { playerId: 'p1', choice: 1, ms: 100 },
          { playerId: 'p2', choice: 0, ms: 100 },
          { playerId: 'p3', choice: 0, ms: 100 },
        ],
      ],
      2,
      'peaceful',
    )
    const openFirst = { ...base, phase: 'QUESTION' as const, index: 0 }
    const duringFirst = bossOf(openFirst)
    expect(duringFirst.hp).toBe(10)
    expect(duringFirst.shield).toBe(30)
    expect(duringFirst.hits).toBe(0)
    expect(duringFirst.bites).toBe(0)
    expect(duringFirst.outcome).toBeNull()
    expect(lastBite(openFirst)).toBeNull()

    const revealedFirst = { ...base, phase: 'REVEAL' as const, index: 0 }
    expect(bossOf(revealedFirst).outcome).toBeNull()

    const openSecond = {
      ...base,
      phase: 'QUESTION' as const,
      index: 1,
      answers: [
        [
          { playerId: 'p1', choice: 0, ms: 100 },
          { playerId: 'p2', choice: 0, ms: 100 },
        ],
        [
          { playerId: 'p1', choice: 1, ms: 100 },
          { playerId: 'p2', choice: 1, ms: 100 },
        ],
      ],
    }
    const duringSecond = bossOf(openSecond)
    // Az első kör harapása már él, de a nyitott 2. kör még nem sebzi a sárkányt és nem zárja le a harcot.
    expect(duringSecond.bites).toBe(1)
    expect(duringSecond.shield).toBe(20)
    expect(duringSecond.hits).toBe(0)
    expect(duringSecond.hp).toBe(10)
    expect(duringSecond.outcome).toBeNull()
    expect(lastBite(openSecond)).toBeNull()

    const revealedSecond = { ...openSecond, phase: 'REVEAL' as const, index: 1 }
    const afterSecond = bossOf(revealedSecond)
    expect(afterSecond.hits).toBe(1)
    expect(afterSecond.hp).toBe(0)
    expect(afterSecond.outcome).toBe('win')
    expect(lastBite(revealedSecond)).toBe('hit')
  })
})
