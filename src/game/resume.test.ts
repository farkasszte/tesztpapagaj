import { expect, test } from 'bun:test'
import { resumedClassicSession } from './resume'
import type { ClassicSession } from './classic/types'
import type { SavedGame } from './game-store'

function saved(settings: Partial<ClassicSession['settings']>): SavedGame {
  const session: ClassicSession = {
    mode: 'classic',
    version: 1,
    code: '123456',
    createdAt: 0,
    noDevices: true,
    title: 'Tegnapi játék',
    settings: { timerSeconds: 20, scoring: false, shuffleQuestions: false, ...settings },
    questions: [],
    players: [],
    phase: 'QUESTION',
    index: 0,
    answers: [],
    openedAt: 0,
    deadline: null,
    seq: 3,
  }
  return { mode: 'classic', title: session.title, savedAt: 0, session, questions: [], words: [] } as unknown as SavedGame
}

test('a folytatott játék a mostani megjelenítési beállítást veszi át', () => {
  // A mentés a beállítás előtti állapot: a körönkénti eredmény nincs benne.
  const resumed = resumedClassicSession(saved({}), { roundResults: true })
  expect(resumed.settings.roundResults).toBe(true)
  // A játék többi beállítását és menetét nem bántjuk.
  expect(resumed.settings.timerSeconds).toBe(20)
  expect(resumed.seq).toBe(3)
  expect(resumed.title).toBe('Tegnapi játék')
})

test('kikapcsolva a folytatás is kikapcsolja', () => {
  const resumed = resumedClassicSession(saved({ roundResults: true }), { roundResults: false })
  expect(resumed.settings.roundResults).toBe(false)
})

test('a mentett beállítások megmaradnak, csak a megjelenítés változik', () => {
  const resumed = resumedClassicSession(saved({ scoring: true, shuffleQuestions: true }), {
    roundResults: true,
  })
  expect(resumed.settings).toMatchObject({ scoring: true, shuffleQuestions: true, roundResults: true })
})
