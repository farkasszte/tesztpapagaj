import { describe, expect, it } from 'bun:test'
import {
  AVATAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  applyAvatarStyle,
  isAvatarStyleId,
  loadAvatarStyle,
} from './avatar-styles'
import { playerAvatarSvg, randomAvatarSeed } from './avatar'

describe('avatar-készletek', () => {
  it('csak a listázott azonosítókat fogadja el', () => {
    expect(isAvatarStyleId('critters')).toBe(true)
    expect(isAvatarStyleId('bottts')).toBe(true)
    expect(isAvatarStyleId('nem-letezik')).toBe(false)
    expect(isAvatarStyleId('')).toBe(false)
  })

  it('a lista minden azonosítója betölthető, és a felirata szótárazott', async () => {
    for (const style of AVATAR_STYLES) {
      expect(style.label.startsWith('game.avatar.style.')).toBe(true)
      const loaded = await loadAvatarStyle(style.id)
      expect(loaded).toBeTruthy()
    }
  })

  it('ismeretlen azonosító esetén az alapértelmezett készlet töltődik', async () => {
    const fallback = await loadAvatarStyle('nincs-ilyen')
    const base = await loadAvatarStyle(DEFAULT_AVATAR_STYLE)
    expect(fallback).toBe(base)
  })

  it('a váltás másik figurát rajzol ugyanarra a magra', async () => {
    applyAvatarStyle('critters')
    await loadAvatarStyle('critters')
    applyAvatarStyle('critters')
    const first = playerAvatarSvg('k7m3p9', 96)

    applyAvatarStyle('bottts')
    await loadAvatarStyle('bottts')
    // A betöltés aszinkron: a rajzoló a kész készletet használja.
    await Promise.resolve()
    applyAvatarStyle('bottts')
    const second = playerAvatarSvg('k7m3p9', 96)

    expect(first.startsWith('<svg')).toBe(true)
    expect(second.startsWith('<svg')).toBe(true)
    expect(second).not.toBe(first)
  })

  it('a véletlen mag rövid, és nem tartalmaz összetéveszthető karaktert', () => {
    const seed = randomAvatarSeed()
    expect(seed).toHaveLength(8)
    expect(seed).not.toMatch(/[01lo]/)
    expect(randomAvatarSeed()).not.toBe(seed)
  })
})
