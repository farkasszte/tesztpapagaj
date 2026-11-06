import { useId, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { SUPPORTED_SOURCES } from './question-formats/catalog'
import { t } from './i18n/index'

/** What an AI assistant converts, named first because most tests arrive as
 *  one of these. */
const convertedSources = () => ['PDFs', t('imports.wordDocs'), 'Photos']

/**
 * What sits under every drop zone that starts an import: what it takes,
 * converted or read straight in, and, for questions a teacher has only as text, a
 * box to paste them into — read the way a dropped text file is.
 */

export function SupportedSources() {
  return <div className="import-sources" aria-label={t('imports.supportedFiles')}>
    <span>{t('import.supports')}</span>
    <ul>{[...convertedSources(), ...SUPPORTED_SOURCES].map((source) => <li key={source}>{source}</li>)}</ul>
  </div>
}

export function TextOnlyChoices({ busy, onPaste }: {
  busy: boolean
  /** The pasted questions, as the text file they would have been saved as. */
  onPaste: (file: File) => void
}) {
  const textId = useId()
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  return pasting ? (
      <form
        className="import-paste"
        onSubmit={(event) => {
          event.preventDefault()
          if (pasted.trim()) onPaste(new File([pasted], t('imports.pastedName'), { type: 'text/plain' }))
        }}
      >
        <label htmlFor={textId}>{t('imports.pasteTitle')}</label>
        <textarea
          id={textId}
          value={pasted}
          rows={10}
          spellCheck={false}
          autoFocus
          placeholder={t('conv.samplePlaceholder')}
          onChange={(event) => setPasted(event.target.value)}
        />
        <p>
          {t('imports.pasteHint')}
        </p>
        <div className="import-paste-actions">
          <button type="button" className="secondary-button" onClick={() => setPasting(false)}>{t('common.cancel')}</button>
          <button type="submit" className="primary-button" disabled={busy || !pasted.trim()}>
            {t('imports.readQuestions')}
          </button>
        </div>
      </form>
    ) : (
      <p className="convert-text-only">
        {t('imports.textOnly')}{' '}
        <button type="button" className="link-button" disabled={busy} onClick={() => setPasting(true)}>
          <ClipboardPaste aria-hidden="true" /> {t('import.pasteQuestions')}
        </button>
      </p>
    )
}
