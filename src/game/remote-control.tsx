import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/index'
import type { ClassicView } from './classic/views'

/**
 * Távirányító a tanár telefonján.
 *
 * A telefon **játékosként** lép be (kód + becenév), és a **tanár jelöli ki**
 * a saját gépén, a névsorban: egyszerre egy eszköz lehet távirányító. A telefon
 * magától nem tud távirányítóvá válni — így egy diák sem tudja kiszorítani a
 * tanárt, és nem kell külön kód, QR vagy kulcs.
 *
 * Kijelölés után a tanár gépe nem vár rá válaszra, nem teszi a táblára és nem
 * ad neki pontot; a gombjai viszont pontosan azt teszik, mintha a laptopon
 * nyomták volna meg őket. A telefon a „Vissza a játékhoz" gombbal kérheti,
 * hogy tegyék vissza játékosnak.
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

  // Véletlen kattintás elleni védelem:
  // 1) Képernyőzár (zsebre tehető telefonnál),
  // 2) Felfedés után rövid (650 ms) védelmi szünet a „Következő kérdés” gomb előtt,
  // 3) Kétlépcsős megerősítés a végleges („Játék vége”, „Vissza a játékhoz”) gombokra.
  const [locked, setLocked] = useState(false)
  const [revealGuard, setRevealGuard] = useState(false)
  const [armed, setArmed] = useState<'finish' | 'close' | null>(null)
  const lastTap = useRef<{ cmd: RemoteCommand; at: number } | null>(null)
  const guardTimer = useRef<number | null>(null)
  const armedTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (guardTimer.current !== null) window.clearTimeout(guardTimer.current)
      if (armedTimer.current !== null) window.clearTimeout(armedTimer.current)
    }
  }, [])

  const clearArm = () => {
    setArmed(null)
    if (armedTimer.current !== null) {
      window.clearTimeout(armedTimer.current)
      armedTimer.current = null
    }
  }

  const arm = (target: 'finish' | 'close') => {
    setArmed(target)
    if (armedTimer.current !== null) window.clearTimeout(armedTimer.current)
    armedTimer.current = window.setTimeout(() => {
      setArmed(null)
      armedTimer.current = null
    }, 3500)
  }

  const sendSafe = (command: RemoteCommand) => {
    if (locked) return
    const now = Date.now()
    if (lastTap.current && lastTap.current.cmd === command && now - lastTap.current.at < 350) return
    lastTap.current = { cmd: command, at: now }
    clearArm()
    if (command === 'reveal') {
      setRevealGuard(true)
      if (guardTimer.current !== null) window.clearTimeout(guardTimer.current)
      guardTimer.current = window.setTimeout(() => {
        setRevealGuard(false)
        guardTimer.current = null
      }, 650)
    }
    onCommand(command)
  }

  const handleFinish = () => {
    if (locked || !view) return
    if (armed === 'finish') {
      clearArm()
      onCommand('finish')
      return
    }
    arm('finish')
  }

  const handleClose = () => {
    if (locked) return
    if (armed === 'close') {
      clearArm()
      onClose()
      return
    }
    arm('close')
  }

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

      <div className="gq-remote-guard-bar">
        <p className="gq-remote-hint">{t('game.remote.hint')}</p>
        <button
          type="button"
          className="gq-remote-lock"
          data-locked={locked ? 'yes' : 'no'}
          aria-pressed={locked}
          onClick={() => {
            clearArm()
            setLocked((prev) => !prev)
          }}
        >
          {locked ? t('game.remote.unlock') : t('game.remote.lock')}
        </button>
      </div>

      <div className="gq-remote-actions">
        {paused ? (
          <button
            type="button"
            className="gq-remote-action"
            data-tone="go"
            onClick={() => sendSafe('resume')}
            disabled={locked}
          >
            {t('game.remote.resume')}
          </button>
        ) : (
          <button
            type="button"
            className="gq-remote-action"
            data-tone="pause"
            onClick={() => sendSafe('pause')}
            disabled={locked || !view}
          >
            {t('game.remote.pause')}
          </button>
        )}
        <button
          type="button"
          className="gq-remote-action"
          data-tone="reveal"
          onClick={() => sendSafe('reveal')}
          disabled={locked || !question || revealed || paused}
        >
          {t('game.remote.reveal')}
        </button>
        <button
          type="button"
          className="gq-remote-action"
          data-tone="next"
          onClick={() => sendSafe('next')}
          disabled={locked || !question || !revealed || paused || revealGuard}
        >
          {t('game.remote.next')}
        </button>
        <button
          type="button"
          className="gq-remote-action"
          data-tone="end"
          data-armed={armed === 'finish' ? 'yes' : 'no'}
          onClick={handleFinish}
          disabled={locked || !view}
        >
          {armed === 'finish' ? t('game.remote.finishConfirm') : t('game.remote.finish')}
        </button>
      </div>

      <button
        type="button"
        className="gq-remote-close"
        data-armed={armed === 'close' ? 'yes' : 'no'}
        onClick={handleClose}
        disabled={locked}
      >
        {armed === 'close' ? t('game.remote.closeConfirm') : t('game.remote.close')}
      </button>
    </div>
  )
}
