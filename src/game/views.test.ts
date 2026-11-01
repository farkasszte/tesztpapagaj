import { describe, expect, test } from 'bun:test'
import { createSession, Engine } from './engine'
import { buildView } from './views'
import type { Question } from './types'

/**
 * A Bajnok nézet minden fázisban épüljön meg — diákonként is.
 *
 * A tanár füle minden lépés után **minden** diáknak kiszámolja a saját nézetét;
 * ha az építés egy fázisban elszáll, a diákok csendben befagynak (a színpad
 * közben tovább megy). Ez a teszt a teljes fordulót végigjátssza, és minden
 * lépésnél kéri a nézetet az osztály és a bajnok szemével is.
 */

const questions: Question[] = Array.from({ length: 3 }, (_, index) => ({
  id: `q${index}`,
  prompt: `Question ${index}`,
  choices: ['A', 'B', 'C'],
  correct: 1,
}))

function setup(names = ['Ana', 'Ben', 'Cy']) {
  const now = 1_000_000
  let seed = 1
  const clock = {
    now: () => now,
    random: () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    },
  }
  const engine = new Engine(
    createSession({ code: 'ABC234', setTitle: 'Test', questions, noDevices: false, clock }),
    clock,
  )
  const ids = names.map((nickname) => {
    const joined = engine.join({ nickname })
    if (!joined.ok) throw new Error(joined.message)
    return joined.player.id
  })
  return { engine, ids }
}

describe('Bajnok nézet diákonként', () => {
  test('minden fázisban megépül, a kikérdezéssel együtt', () => {
    const { engine, ids } = setup()
    const [one, ben, cy] = ids
    const views = () =>
      ids.map((id) => buildView(engine.session, { now: engine.clock.now(), pauseReason: null, viewerId: id }))

    expect(engine.startGame(one).ok).toBe(true)
    views()

    expect(engine.openQuestion().ok).toBe(true)
    const phaseA = views()
    // A bajnok a kérdést még nem látja, az osztály igen.
    expect(phaseA[0]?.question?.prompt).toBeNull()
    expect(phaseA[1]?.question?.prompt).toBe('Question 0')

    const attempt = engine.session.game!.active!.id
    expect(engine.answer(ben, attempt, 1).ok).toBe(true)
    expect(engine.answer(cy, attempt, 2).ok).toBe(true)
    views()

    expect(engine.showToOne().ok).toBe(true)
    views()

    // A bajnok kikérdezi az osztályt.
    expect(engine.helpPoll(one, 1).ok).toBe(true)
    const polled = views()
    expect(polled[0]?.question?.helpResult).toEqual({ type: 'poll', choice: 1, count: 1, total: 2 })

    expect(engine.oneAnswer(one, attempt, 1).ok).toBe(true)
    views()

    expect(engine.reveal().ok).toBe(true)
    const revealed = views()
    expect(revealed[0]?.question?.reveal?.oneCorrect).toBe(true)
    expect(revealed[0]?.self?.role).toBe('one')
    expect(revealed[1]?.self?.myAnswer).toBe(1)
    expect(revealed[1]?.question?.reveal?.correct).toBe(1)
  })

  test('a következő forduló nézete is megépül, bajnokváltással', () => {
    const { engine, ids } = setup()
    const [one, ben, cy] = ids
    const views = () =>
      ids.map((id) => buildView(engine.session, { now: engine.clock.now(), pauseReason: null, viewerId: id }))

    engine.startGame(one)
    engine.openQuestion()
    const attempt = engine.session.game!.active!.id
    engine.answer(ben, attempt, 1)
    engine.answer(cy, attempt, 1)
    engine.showToOne()
    engine.oneAnswer(one, attempt, 0) // elhibázza
    engine.reveal()
    views()

    engine.next()
    views()
    expect(engine.chooseNextOne(ben).ok).toBe(true)
    views()
  })
})
