import { useMemo } from 'react'
import { playerAvatarSvg } from './avatar'
import { useAvatarStyle } from './avatar-styles'

/**
 * A játékos figurája. Csak rajzol — a képet a `avatar.ts` állítja elő (helyben,
 * hálózat nélkül). Amíg a kiválasztott készlet töltődik, semleges karika áll a
 * helyén, tehát a név és a pont nem ugrik el.
 */
export function PlayerAvatar({
  seed,
  size = 32,
  className,
}: {
  /** A figura magja: a diák választott azonosítója, vagy a beceneve. */
  seed: string
  /** Megjelenített élméret px-ben; a rajz 2×-es, hogy éles maradjon. */
  size?: number
  className?: string
}) {
  const style = useAvatarStyle()
  // A stílus a függőség: amikor a készlet betöltődik vagy megváltozik, a figura
  // újrarajzolódik (a rajzoló a modul-szintű aktív stílust használja).
  const svg = useMemo(
    () => (style ? playerAvatarSvg(seed, size * 2) : ''),
    [seed, size, style],
  )
  return (
    <span
      className={className ? `gq-avatar ${className}` : 'gq-avatar'}
      style={{ width: size, height: size }}
      // Díszítés: a nevet mellette olvassa a képernyőolvasó.
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
