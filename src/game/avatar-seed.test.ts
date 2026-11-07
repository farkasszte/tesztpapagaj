import { describe, expect, it } from 'vitest'
import { ClassicEngine, createClassicSession } from './classic/engine'
import { buildClassicView } from './classic/views'

/**
 * A figura magja a tanár gépén él: belépéskor jön, a várakozás alatt a
 * `setAvatar` állítja át. A többi nézet ugyanezt a magot kapja, tehát a telefon
 * és a színpad ugyanazt rajzolja.
 */
const make = () =>
  new ClassicEngine(
    createClassicSession({
      code: '123456',
      title: 'Teszt',
      questions: [],
      settings: { timerSeconds: 20, scoring: true, shuffleQuestions: false },
      noDevices: false,
    }),
  )

describe('a játékos figurájának magja', () => {
  it('a belépéskor kapott mag a játékosnál marad', () => {
    const engine = make()
    const result = engine.join({ nickname: 'Anna', avatar: 'k7m3p9' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.player.avatar).toBe('k7m3p9')
  })

  it('a várakozás alatt kért új mag felülírja az előzőt', () => {
    const engine = make()
    const joined = engine.join({ nickname: 'Bence', avatar: 'elso' })
    if (!joined.ok) throw new Error('nem lépett be')
    engine.setAvatar(joined.player.id, 'masodik')
    expect(engine.player(joined.player.id)?.avatar).toBe('masodik')
  })

  it('üres vagy csak szóköz magot nem fogad el', () => {
    const engine = make()
    const joined = engine.join({ nickname: 'Csilla', avatar: 'marad' })
    if (!joined.ok) throw new Error('nem lépett be')
    engine.setAvatar(joined.player.id, '   ')
    expect(engine.player(joined.player.id)?.avatar).toBe('marad')
  })

  it('újracsatlakozáskor a hozott mag frissül', () => {
    const engine = make()
    const joined = engine.join({ nickname: 'Dávid', avatar: 'regi' })
    if (!joined.ok) throw new Error('nem lépett be')
    const again = engine.join({
      nickname: 'Dávid',
      playerId: joined.player.id,
      secret: joined.player.secret,
      avatar: 'uj',
    })
    expect(again.ok).toBe(true)
    expect(engine.player(joined.player.id)?.avatar).toBe('uj')
  })

  it('a színpad nézete ugyanazt a magot hozza, mint a játékosé', () => {
    const engine = make()
    const joined = engine.join({ nickname: 'Emese', avatar: 'mag-1' })
    if (!joined.ok) throw new Error('nem lépett be')
    const roster = buildClassicView(engine.session, {
      now: Date.now(),
      viewerId: joined.player.id,
    }).roster
    expect(roster[0]?.avatar).toBe('mag-1')
  })
})
