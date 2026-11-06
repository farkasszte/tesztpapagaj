import { describe, expect, test } from 'bun:test'
import type { Question } from '../types'
import { mergeRanks, pairQuestions, sharedTimer } from './pair'

const question = (id: string): Question => ({ id, type: 'multiple-choice', choices: ['a', 'b'] }) as Question

describe('a két oldal kérdéspárja', () => {
  test('egyforma hossznál mindkettő teljes', () => {
    const paired = pairQuestions([question('a1'), question('a2')], [question('b1'), question('b2')])
    expect(paired.length).toBe(2)
    expect(paired.a.map((one) => one.id)).toEqual(['a1', 'a2'])
    expect(paired.b.map((one) => one.id)).toEqual(['b1', 'b2'])
  })

  test('a hosszabb oldalt a rövidebbre vágja', () => {
    const paired = pairQuestions(
      [question('a1'), question('a2'), question('a3')],
      [question('b1')],
    )
    expect(paired.length).toBe(1)
    expect(paired.a.map((one) => one.id)).toEqual(['a1'])
    expect(paired.b.map((one) => one.id)).toEqual(['b1'])
  })

  test('üres oldal mellett nincs játszható kör', () => {
    expect(pairQuestions([], [question('b1')]).length).toBe(0)
  })
})

describe('a közös idő', () => {
  test('a rövidebb beállítás érvényes, de legalább egy másodperc', () => {
    expect(sharedTimer(20, 15)).toBe(15)
    expect(sharedTimer(20, 30)).toBe(20)
    expect(sharedTimer(0, 0)).toBe(1)
  })
})

describe('a közös ranglista', () => {
  test('pont szerint csökken, holtversenynél név szerint', () => {
    const ranked = mergeRanks([
      { nickname: 'Bence', points: 10, side: 'a' as const },
      { nickname: 'Anna', points: 10, side: 'b' as const },
      { nickname: 'Cili', points: 12, side: 'a' as const },
    ])
    expect(ranked.map((one) => one.nickname)).toEqual(['Cili', 'Anna', 'Bence'])
  })
})
