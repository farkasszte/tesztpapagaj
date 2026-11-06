import { useId, useState, type FormEvent } from 'react'
import type { ImportProposal } from './package-import'
import { t } from './i18n/index'

/**
 * A Kahoot, brought in from its share link: the one import that starts from a
 * link rather than a file, because a teacher who has the link has the quiz.
 *
 * It stands wherever an import starts — the Imports page, and the Import
 * dialog's own empty state — so a teacher who opened the dialog with a file in
 * mind can paste a link instead without backing out. The reading happens
 * behind `api/kahoot`; what comes back is the proposal the dialog already
 * shows for a dropped file.
 */
export function KahootLinkField({ onProposal, compact = false }: {
  onProposal: (proposal: ImportProposal) => void
  /** Inside the dialog the card's own heading is left to the dialog. */
  compact?: boolean
}) {
  const inputId = useId()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bring = async (event: FormEvent) => {
    event.preventDefault()
    if (!link.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { inspectKahootLink } = await import('./kahoot-link')
      onProposal(await inspectKahootLink(link))
      setLink('')
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t('imports.unreadable'))
    } finally {
      setBusy(false)
    }
  }

  return <form className={compact ? 'kahoot-link kahoot-link--compact' : 'site-card kahoot-link'} onSubmit={bring}>
    {compact ? null : <h2>{t('imports.kahootTitle')}</h2>}
    <p>{t('imports.kahootHint')}</p>
    <label htmlFor={inputId} className="sr-only">{t('imports.kahootTitle')}</label>
    <input
      id={inputId}
      type="url"
      inputMode="url"
      className="kahoot-link-input"
      placeholder={t('imports.kahootPlaceholder')}
      value={link}
      onChange={(event) => setLink(event.target.value)}
      disabled={busy}
    />
    <button type="submit" className="secondary-button" disabled={busy || !link.trim()}>
      {busy ? t('imports.kahootBusy') : t('imports.kahootButton')}
    </button>
    {error && <p className="home-error" role="alert">{error}</p>}
  </form>
}
