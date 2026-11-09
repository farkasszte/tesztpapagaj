import { describe, expect, test } from 'bun:test'
import type { Question } from '../types'
import { ClassicEngine, createClassicSession } from './engine'
import type { ClassicSettings } from './types'
import { buildClassicView } from './views'

/**
 * Távirányító: a tanár telefonja **játékosként** lép be, aztán magát
 * távirányítónak jelöli. A motor innentől nem vár rá: nem tartja nyitva a
 * kört, nem kerül a táblára, és nem kap pontot — a kattintásai viszont
 * ugyanazok, mint a színpad gombjai.
 */

const questions: Question[] = [
  { id: 'q1', prompt: '7 × 8?', choices: ['54', '56', '64'], correct: 1 },
  { id: 'q2', prompt: 'Közelebbi bolygó?', choices: ['Vénusz', 'Merkúr'], correct: 1 },
]

function setup(names: string[], settings: Partial<ClassicSettings> = {}) {
  let now = 1_000_000
  let seed = 7
  const clock = { now: () => now, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }
  const engine = new ClassicEngine(
    createClassicSession({ code: '123456', title: 'Facts', questions, settings, clock }),
    clock,
  )
  const ids = names.map((nickname) => {
    const joined = engine.join({ nickname })
    if (!joined.ok) throw new Error(joined.message)
    return joined.player.id
  })
  return { engine, ids, advance: (ms: number) => (now += ms) }
}

describe('távirányító', () => {
  test('a távirányító nem jelenik meg a táblán, és nem kap pontot', () => {
    const { engine, ids } = setup(['Anna', 'Tanár'], { roundResults: true })
    const [anna, teacher] = ids
    engine.setRemote(teacher, true)

    expect(engine.start().ok).toBe(true)
    engine.answer(anna, 1)

    // Egy diák válaszolt, a távirányító nem számít: a kör lezárul.
    expect(engine.session.phase).toBe('REVEAL')
    expect(engine.player(teacher)?.points).toBe(0)

    const view = buildClassicView(engine.session, { now: 1_000_500, viewerId: null })
    expect(view.roster.map((one) => one.nickname)).toEqual(['Anna'])
    expect(view.roundTop?.map((one) => one.nickname)).toEqual(['Anna'])
  })

  test('csak távirányítóval nem indul a játék', () => {
    const { engine, ids } = setup(['Tanár'])
    engine.setRemote(ids[0]!, true)
    const started = engine.start()
    expect(started.ok).toBe(false)
  })

  test('egyszerre egy távirányító van: a tanár új döntése az előzőt visszateszi', () => {
    const { engine, ids } = setup(['Anna', 'Tanár telefon', 'Tartalék telefon'])
    const [, teacher, spare] = ids
    engine.setRemote(teacher, true)
    expect(engine.remotePlayer()?.id).toBe(teacher)

    engine.setRemote(spare, true)
    expect(engine.remotePlayer()?.id).toBe(spare)
    // Az előző telefon újra játékos: nem marad két távirányító.
    expect(engine.player(teacher)?.remote).toBeUndefined()

    engine.setRemote(spare, false)
    expect(engine.remotePlayer()).toBeUndefined()
  })

  test('a távirányító visszavonható: újra játékos lesz', () => {
    const { engine, ids } = setup(['Anna', 'Tanár'])
    const [, teacher] = ids
    engine.setRemote(teacher, true)
    engine.setRemote(teacher, false)

    engine.start()
    engine.answer(ids[0]!, 1)
    // A „visszatért" játékos még nem válaszolt: a kör nyitva marad.
    expect(engine.session.phase).toBe('QUESTION')
    expect(buildClassicView(engine.session, { now: 1_000_500, viewerId: null }).roster).toHaveLength(2)
  })
})
