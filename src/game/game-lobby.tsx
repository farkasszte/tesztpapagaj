import { useEffect, useState } from 'react'
import { joinUrl, spacedRoomCode, type RoomCode } from './room-protocol'
import { QrCode } from './game-qr'
import { useT } from '../i18n/index'

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
  onEditBoard,
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
  /** Vissza a tábla beosztásához (a szoba közben nyitva marad). */
  onEditBoard?: () => void
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  /** A QR teljes képernyőn: a hátsó sorból is beolvasható legyen. */
  const [fullQr, setFullQr] = useState(false)
  const url = joinUrl(window.location.origin, code)

  // A nagyított QR-t Esc-pel (és koppintással) be lehet zárni.
  useEffect(() => {
    if (!fullQr) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullQr(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullQr])
  const connected = players.filter((player) => player.connected).length

  return (
    <div className="gq-lobby">
      <div className="gq-lobby-card">
        <p className="gq-lobby-kicker">{t('game.devices.kicker')}</p>
        <h1 className="gq-lobby-code">{spacedRoomCode(code)}</h1>
        <p className="gq-lobby-hint">{t('game.devices.hint')}</p>
        <div className="gq-lobby-join">
          {status === 'open' ? (
            <>
              <button
                type="button"
                className="gq-qr-button"
                aria-label={t('game.devices.qrFull')}
                onClick={() => setFullQr(true)}
              >
                <QrCode text={url} size={320} />
              </button>
              <p className="gq-hint">{t('game.devices.qrFullHint')}</p>
            </>
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
          {onEditBoard ? (
            <button type="button" className="gq-later" onClick={onEditBoard}>
              {t('game.peril.editBoard')}
            </button>
          ) : null}
          <button type="button" className="gq-later" onClick={onExit}>
            {t('game.devices.back')}
          </button>
        </div>
        <p className="gq-hint">{t('game.devices.startHint')}</p>
      </div>

      {fullQr ? (
        <div
          className="gq-qr-full"
          role="dialog"
          aria-modal="true"
          aria-label={t('game.devices.qrFull')}
          onClick={() => setFullQr(false)}
        >
          <QrCode text={url} size={720} />
          <p className="gq-qr-full-code">{spacedRoomCode(code)}</p>
          <p className="gq-qr-full-hint">{t('game.devices.qrFullClose')}</p>
        </div>
      ) : null}
    </div>
  )
}
