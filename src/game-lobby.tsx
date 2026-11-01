import { useState } from 'react'
import { joinUrl, spacedRoomCode, type RoomCode } from './game/room-protocol'
import { QrCode } from './game-qr'
import { useT } from './i18n'

/**
 * A tanári lobbi: a szobakód, a QR, a bent lévők és az indítás.
 *
 * Minden játékmód ugyanezt használja, mert a belépés mindenhol ugyanaz — csak a
 * játék más. A kódot és a linket is kiírja, hogy a QR mellett kézzel is
 * beírható legyen, ha a kamera nem működik.
 */
export type LobbyPlayer = { id: string; nickname: string; connected: boolean }

export function GameLobby({
  code,
  players,
  status,
  problem,
  startDisabled,
  onStart,
  onExit,
  onKick,
}: {
  code: RoomCode
  players: LobbyPlayer[]
  status: 'connecting' | 'open' | 'closed' | 'denied'
  problem?: string | null
  startDisabled?: boolean
  onStart: () => void
  onExit: () => void
  /** A tanár eltávolíthat valakit a szobából. */
  onKick?: (playerId: string) => void
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const url = joinUrl(window.location.origin, code)
  const connected = players.filter((player) => player.connected).length

  return (
    <div className="gq-lobby">
      <div className="gq-lobby-card">
        <p className="gq-lobby-kicker">{t('game.devices.kicker')}</p>
        <h1 className="gq-lobby-code">{spacedRoomCode(code)}</h1>
        <p className="gq-lobby-hint">{t('game.devices.hint')}</p>
        <div className="gq-lobby-join">
          {status === 'open' ? (
            <QrCode text={url} size={196} />
          ) : (
            <p className="gq-lobby-status">{t(`game.devices.status.${status}` as never)}</p>
          )}
        </div>
        <p className="gq-lobby-url">{url.replace(/^https?:\/\//, '')}</p>
        <button
          type="button"
          className="gq-lobby-copy"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2200)
              })
              .catch(() => setCopied(false))
          }}
        >
          {copied ? t('game.devices.copied') : t('game.devices.copy')}
        </button>
        {problem ? <p className="gq-lobby-problem">{problem}</p> : null}
      </div>

      <div className="gq-lobby-side">
        <h2 className="gq-lobby-count">{t('game.devices.joined', { count: connected })}</h2>
        {players.length === 0 ? (
          <p className="gq-hint">{t('game.devices.waiting')}</p>
        ) : (
          <ul className="gq-roster">
            {players.map((player) => (
              <li key={player.id} className={player.connected ? undefined : 'gq-roster-gone'}>
                {player.nickname}
                {onKick ? (
                  <button
                    type="button"
                    className="gq-roster-kick"
                    aria-label={t('game.devices.kick', { name: player.nickname })}
                    onClick={() => onKick(player.id)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="gq-lobby-actions">
          <button
            type="button"
            className="primary-button"
            disabled={startDisabled ?? connected === 0}
            onClick={onStart}
          >
            {t('game.devices.start')}
          </button>
          <button type="button" className="gq-later" onClick={onExit}>
            {t('game.devices.back')}
          </button>
        </div>
        <p className="gq-hint">{t('game.devices.startHint')}</p>
      </div>
    </div>
  )
}
