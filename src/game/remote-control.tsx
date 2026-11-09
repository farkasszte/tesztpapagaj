import { useT } from '../i18n/index'
import type { ClassicView } from './classic/views'

/**
 * Távirányító a tanár telefonján.
 *
 * A telefon **játékosként** lép be (kód + becenév), aztán egy gombbal magát
 * távirányítónak jelöli: a tanár gépe ettől fogva nem vár rá válaszra, nem
 * teszi a táblára és nem ad neki pontot — a kattintásai viszont pontosan azt
 * teszik, mintha a laptopon nyomta volna meg a gombot.
 *
 * Nincs külön kód, QR vagy kulcs: a tanár a saját telefonját jelöli ki, és
 * bármikor visszavonhatja (a `close` gombbal újra játékos nézetet kap).
 */

export type RemoteCommand = 'pause' | 'resume' | 'reveal' | 'next' | 'finish'

export function RemoteControl({
  view,
  onCommand,
  onClose,
}: {
  view: ClassicView | null
  onCommand: (command: RemoteCommand) => void
  onClose: () => void
}) {
  const t = useT()
  const question = view?.phase && view.question ? view.question : null
  const paused = view?.paused ?? false
  const revealed = view?.phase === 'REVEAL' || view?.phase === 'REPORT'

  return (
    <div className="gq-stu gq-remote">
      <header className="gq-stu-bar gq-remote-bar">
        <span className="gq-remote-badge">{t('game.remote.title')}</span>
        <span className="gq-remote-status">
          {question
            ? t('game.remote.status', {
                number: question.number,
                total: question.total,
                count: question.answering,
              })
            : t('game.remote.waiting')}
        </span>
      </header>

      <p className="gq-remote-hint">{t('game.remote.hint')}</p>

      <div className="gq-remote-actions">
        {paused ? (
          <button type="button" className="gq-remote-action" data-tone="go" onClick={() => onCommand('resume')}>
            {t('game.remote.resume')}
          </button>
        ) : (
          <button type="button" className="gq-remote-action" onClick={() => onCommand('pause')} disabled={!view}>
            {t('game.remote.pause')}
          </button>
        )}
        <button
          type="button"
          className="gq-remote-action"
          onClick={() => onCommand('reveal')}
          disabled={!question || revealed}
        >
          {t('game.remote.reveal')}
        </button>
        <button type="button" className="gq-remote-action" onClick={() => onCommand('next')} disabled={!view}>
          {t('game.remote.next')}
        </button>
        <button type="button" className="gq-remote-action" data-tone="end" onClick={() => onCommand('finish')}>
          {t('game.remote.finish')}
        </button>
      </div>

      <button type="button" className="gq-remote-close" onClick={onClose}>
        {t('game.remote.close')}
      </button>
    </div>
  )
}

/** A fejlécben ülő apró gomb: ezzel lesz a telefonból távirányító. */
export function RemoteButton({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  return (
    <button type="button" className="gq-stu-remote" onClick={onOpen} title={t('game.remote.open')}>
      <span aria-hidden="true">⏯</span>
      <span className="gq-stu-remote-text">{t('game.remote.open')}</span>
    </button>
  )
}
