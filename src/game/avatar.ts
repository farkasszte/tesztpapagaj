import { Avatar as DiceBear } from '@dicebear/core'
import { activeAvatarStyleId, applyAvatarStyle, currentAvatarStyle, loadAvatarStyle } from './avatar-styles'

/**
 * Játékos-avatarok: a képet **helyben** rajzoljuk, nincs HTTP-hívás és nincs
 * külső forrás — a szigorú CSP marad, a kivetítés hálózat nélkül is mutatja, és
 * nincs forgalom-alapú költség.
 *
 * A készletet (stílust) az oktató választja, és csak az a ~5 kB-os definíció
 * töltődik le, amelyik kell (`avatar-styles.ts`). A seed a diák által
 * megválasztott (vagy a becenévből képzett) szöveg: ugyanaz a seed ugyanazt a
 * figurát adja a telefonon és a tanár színpadán is.
 */

/**
 * A készlet kiválasztása és betöltése egy lépésben. A komponensek és a mérések
 * ezen keresztül váltanak, így biztosan ugyanaz a modul-példány rajzol.
 */
export async function ensureAvatarStyle(id: string): Promise<void> {
  applyAvatarStyle(id)
  await loadAvatarStyle(id)
  applyAvatarStyle(id)
}

/** A rajzolt SVG-k: a tábla sűrűn újrarajzolódik, a generálás egyszer fusson. */
const drawn = new Map<string, string>()

export function avatarSeed(nickname: string): string {
  return nickname.trim().toLocaleLowerCase('hu')
}

/**
 * Egy figura SVG-je. Üres szöveg, amíg a kiválasztott készlet töltődik — a
 * hívó ilyenkor semleges karikát rajzol.
 */
export function playerAvatarSvg(seed: string, size = 96): string {
  const style = currentAvatarStyle()
  if (!style) return ''
  // A készlet is a kulcs része: váltáskor ugyanaz a mag másik figurát ad.
  const key = `${activeAvatarStyleId()}:${seed}:${size}`
  const already = drawn.get(key)
  if (already) return already
  const svg = new DiceBear(style, { seed, size }).toString()
  // Egy teremben kevés név van, de a memória ne nőjön korlátlanul.
  if (drawn.size > 400) drawn.clear()
  drawn.set(key, svg)
  return svg
}

/** Új véletlen mag a „Új figura" gombhoz. Nem személyes adat: 8 karakter. */
export function randomAvatarSeed(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}
