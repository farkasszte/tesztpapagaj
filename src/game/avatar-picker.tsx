import { PlayerAvatar } from './avatar-view'
import { useT } from '../i18n/index'

/**
 * A diák figurája, és mellette a kocka: a várakozás alatt bármikor másikat
 * kérhet magának. A mag (seed) a telefonon marad, a tanár gépe csak azt tudja
 * meg, hogy melyik figura kell — a képet mindkét helyen helyben rajzoljuk.
 */
export function AvatarPicker({
  seed,
  size = 44,
  onRoll,
  inHeader = false,
}: {
  seed: string
  size?: number
  onRoll: () => void
  /** A fejlécben kisebb, a kártyán nagyobb: a felirat csak a kártyán kell. */
  inHeader?: boolean
}) {
  const t = useT()
  return (
    <span className={inHeader ? 'gq-avatar-pick is-header' : 'gq-avatar-pick'}>
      <PlayerAvatar seed={seed} size={size} />
      <button
        type="button"
        className="gq-avatar-roll"
        onClick={onRoll}
        title={t('game.avatar.roll')}
        aria-label={t('game.avatar.roll')}
      >
        <svg viewBox="0 0 24 24" width={inHeader ? 14 : 18} height={inHeader ? 14 : 18} aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="8.6" cy="8.6" r="1.5" fill="currentColor" />
          <circle cx="15.4" cy="15.4" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        {inHeader ? null : <span>{t('game.avatar.rollShort')}</span>}
      </button>
    </span>
  )
}
