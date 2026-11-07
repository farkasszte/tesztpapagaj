import { Avatar as DiceBear, Style } from '@dicebear/core'
import critters from '@dicebear/styles/critters.json'

/**
 * Egyszerű játékos-avatarok (DiceBear „critters” stílus, CC0).
 *
 * A képet **helyben** rajzoljuk: nincs HTTP-hívás, nincs külső forrás, tehát a
 * szigorú CSP marad, a kivetítés hálózat nélkül is mutatja, és nincs
 * forgalom-alapú költség. A stílus-definíció a bundle része (53 kB nyersen,
 * ~5 kB gzippel), és csak a játék kódjában van benne.
 *
 * A seed a becenév: ugyanaz a diák minden képernyőn és minden játékban ugyanazt
 * a figurát kapja, a tanár gépe és a telefon is ugyanazt rajzolja — nem kell
 * azonosítót körbeküldeni.
 */

const style = new Style(critters as never)

/** A rajzolt SVG-k: a tábla sűrűn újrarajzolódik, a generálás egyszer fusson. */
const drawn = new Map<string, string>()

export function avatarSeed(nickname: string): string {
  return nickname.trim().toLocaleLowerCase('hu')
}

export function playerAvatarSvg(nickname: string, size = 96): string {
  const seed = avatarSeed(nickname)
  const key = `${seed}:${size}`
  const already = drawn.get(key)
  if (already) return already
  const svg = new DiceBear(style, { seed, size }).toString()
  // Egy teremben kevés név van, de a memória ne nőjön korlátlanul, ha sok
  // játékot nyitnak egymás után.
  if (drawn.size > 300) drawn.clear()
  drawn.set(key, svg)
  return svg
}
