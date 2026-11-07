import { useSyncExternalStore } from 'react'
import { Style } from '@dicebear/core'

/**
 * A választható avatar-készletek (DiceBear stílusok, CC0).
 *
 * Minden készlet **külön csomag**: a `LOADERS` dinamikus importjai miatt a
 * böngésző csak azt a ~5 kB-os definíciót tölti le, amit az oktató kiválasztott
 * — a tanuló telefonja sem kapja meg a többit.
 */

export type AvatarStyleId =
  | 'critters'
  | 'bottts'
  | 'fun-emoji'
  | 'personas'
  | 'miniavs'
  | 'pixel-art'

/** A felület sorrendje: a legbarátságosabb elöl. A felirat szótárazott. */
/**
 * Csak a könnyű készletek: a nehéz stílusok (notionists ~112 kB, open-peeps
 * ~93 kB, adventurer ~98 kB gzippel) egy telefonra már sokak egy díszítésért.
 * A legnagyobb itt a bottts, ~26 kB gzip.
 */
export const AVATAR_STYLES: { id: AvatarStyleId; label: string }[] = [
  { id: 'critters', label: 'game.avatar.style.critters' },
  { id: 'pixel-art', label: 'game.avatar.style.pixelArt' },
  { id: 'miniavs', label: 'game.avatar.style.miniavs' },
  { id: 'personas', label: 'game.avatar.style.personas' },
  { id: 'fun-emoji', label: 'game.avatar.style.funEmoji' },
  { id: 'bottts', label: 'game.avatar.style.bottts' },
]

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'critters'

const LOADERS: Record<AvatarStyleId, () => Promise<{ default: unknown }>> = {
  critters: () => import('@dicebear/styles/critters.json'),
  bottts: () => import('@dicebear/styles/bottts.json'),
  'fun-emoji': () => import('@dicebear/styles/fun-emoji.json'),
  personas: () => import('@dicebear/styles/personas.json'),
  miniavs: () => import('@dicebear/styles/miniavs.json'),
  'pixel-art': () => import('@dicebear/styles/pixel-art.json'),
}

export function isAvatarStyleId(value: string): value is AvatarStyleId {
  return Object.hasOwn(LOADERS, value)
}

let activeId: AvatarStyleId = DEFAULT_AVATAR_STYLE
/** A betöltött stílus; `null`, amíg a definíció meg nem érkezik. */
let active: Style | null = null
/** Verziószám: a `useSyncExternalStore` ezt figyeli (a stílus nem stabil referencia). */
let version = 0
const listeners = new Set<() => void>()
const cache = new Map<AvatarStyleId, Style>()

function bump(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A kiválasztott készlet betöltése. Ha már megvan, azonnal kész; ha épp tölt,
 * ugyanazt a kérést várja mindenki (egy hálózat, egy csomag).
 */
export async function loadAvatarStyle(id: string): Promise<Style> {
  const wanted = isAvatarStyleId(id) ? id : DEFAULT_AVATAR_STYLE
  const already = cache.get(wanted)
  if (already) return already
  const definition = await LOADERS[wanted]()
  const style = new Style(definition.default as never)
  cache.set(wanted, style)
  return style
}

/** Beállítja az aktív készletet; betöltés után minden avatar újrarajzolódik. */
export function applyAvatarStyle(id: string): void {
  const wanted = isAvatarStyleId(id) ? id : DEFAULT_AVATAR_STYLE
  if (wanted === activeId && active) return
  const ready = cache.get(wanted)
  if (ready) {
    activeId = wanted
    active = ready
    bump()
    return
  }
  activeId = wanted
  void loadAvatarStyle(wanted).then((style) => {
    // Közben mást választottak: a későbbi kérés az erősebb.
    if (activeId !== wanted) return
    active = style
    bump()
  })
}

// Az első készlet (az alapértelmezett) már az induláskor betöltődik: a diák
// belépő kártyáján is álljon figura, mielőtt a tanár nézete megérkezik. Ez
// ~5 kB, és utána a választott készlet váltja le.
void loadAvatarStyle(DEFAULT_AVATAR_STYLE).then((style) => {
  if (active || activeId !== DEFAULT_AVATAR_STYLE) return
  active = style
  bump()
})

/** A jelenleg aktív stílus (lehet `null`, amíg tölt). */
export function currentAvatarStyle(): Style | null {
  return active
}

export function activeAvatarStyleId(): AvatarStyleId {
  return activeId
}

/**
 * Hook: újrarajzol, ha a készlet betöltődött vagy megváltozott.
 * A visszaadott érték nem stabil referencia — csak rajzolásra való.
 */
export function useAvatarStyle(): Style | null {
  useSyncExternalStore(subscribe, () => version, () => version)
  return active
}
