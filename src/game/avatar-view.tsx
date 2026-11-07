import { useMemo } from 'react'
import { playerAvatarSvg } from './avatar'

/**
 * A játékos figurája a név mellett. Csak rajzol — a képet a `avatar.ts`
 * állítja elő (helyben, hálózat nélkül).
 */
export function PlayerAvatar({
  nickname,
  size = 32,
  className,
}: {
  nickname: string
  /** Megjelenített élméret px-ben; a rajz 2×-es, hogy éles maradjon. */
  size?: number
  className?: string
}) {
  const svg = useMemo(() => playerAvatarSvg(nickname, size * 2), [nickname, size])
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
