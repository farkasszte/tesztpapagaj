import { describe, expect, test } from 'bun:test'
import { cardAnswers, cardOf, deckOf } from './flashcard'
import type { Question } from './types'

const base = (extra: Partial<Question>): Question => ({
  id: 'q',
  prompt: 'Kérdés?',
  choices: ['A', 'B', 'C'],
  correct: 1,
  ...extra,
})

describe('tanulókártya', () => {
  test('egy helyes válasznál a betű és a szöveg kerül a hátlapra', () => {
    expect(cardAnswers(base({}))).toEqual(['B'])
  })

  test('több helyes válasznál mindegyik sorba kerül', () => {
    expect(cardAnswers(base({ correctChoices: [0, 2], correct: 0 }))).toEqual(['A', 'C'])
  })

  test('sorrendezésnél a helyes sorrend nyíllal', () => {
    expect(cardAnswers(base({ correctOrder: [2, 0, 1], correct: 2 }))).toEqual(['C → A → B'])
  })

  test('párosításnál fogalom és párja soronként', () => {
    const matching = base({ prompts: ['Fogalom 1', 'Fogalom 2'], matches: [2, 0], correct: 2 })
    expect(cardAnswers(matching)).toEqual(['Fogalom 1 — C', 'Fogalom 2 — A'])
  })

  test('kiegészítésnél a hézagok, több hézagnál sorszámozva', () => {
    expect(cardAnswers(base({ blanks: ['egy'], correct: 0 }))).toEqual(['egy'])
    expect(cardAnswers(base({ blanks: ['egy', 'kettő'], correct: 0 }))).toEqual(['1. egy', '2. kettő'])
  })

  test('rövid válasznál az elfogadható alakok', () => {
    expect(cardAnswers(base({ accepted: ['fotoszintézis', 'fotoszintezis'], correct: 0 }))).toEqual([
      'fotoszintézis',
      'fotoszintezis',
    ])
  })

  test('a pakli kihagyja azt a kártyát, aminek nincs hátlapja', () => {
    const noAnswer: Question = { id: 'empty', prompt: 'Nincs válasz', choices: [], correct: 0 }
    const deck = deckOf([base({ id: 'a' }), noAnswer])
    expect(deck.map((card) => card.id)).toEqual(['a'])
    expect(cardOf(base({ explanation: '  mert  ' })).explanation).toBe('mert')
  })
})
