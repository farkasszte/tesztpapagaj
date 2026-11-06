import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Download, FileText, ImageIcon, UploadCloud } from 'lucide-react'
import extractInstructions from './extract.md?raw'
import { fillImageTags } from './image-tag-list'
import type { WaitingImport } from './import-history'
import { downloadInstructions } from './instructions-file'
import { supportMailto } from '../support-email'
import { t } from '../i18n/index'

/**
 * What to do with the test a teacher just dropped, while its import waits for
 * the AI. Only one of three paths is ever shown, the one the file needs:
 *
 * - a PDF or Word document with pictures goes to the AI as a labeled copy,
 *   with a number on each picture, so it can say which picture goes where;
 * - one without pictures goes as it is, with the plain instructions;
 * - a photo goes as it is, and each picture in it is cropped after importing.
 *
 * In every path the AI never estimates where a picture is; Test Parrot takes
 * the pictures from the file itself. Each step is one button, the whole row.
 */

const ASSISTANTS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
] as const

/** One step: its number, what it is, and — on the right — what clicking it does. */
function StepButton({
  number,
  title,
  text,
  icon,
  disabled,
  onClick,
  expanded,
}: {
  number: number
  title: string
  text: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
  /** Set for a step that opens a menu: whether it is open. */
  expanded?: boolean
}) {
  return <button
    type="button"
    className="source-step"
    aria-label={title}
    aria-expanded={expanded}
    aria-haspopup={expanded === undefined ? undefined : 'menu'}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="source-step-number" aria-hidden="true">{number}</span>
    <span className="source-step-text">
      <strong>{title}</strong>
      <span>{text}</span>
    </span>
    <span className="source-step-icon" aria-hidden="true">{icon}</span>
  </button>
}

export function SourceDocumentSteps({
  waiting,
  onReturnedFile,
  onStartOver,
  busy = false,
  named = false,
  noted = true,
  problem,
}: {
  waiting: WaitingImport
  /** The file the AI gave back, dropped or chosen here. */
  onReturnedFile: (file: File) => void
  /** Offered where the teacher is choosing a file, not continuing one. */
  onStartOver?: () => void
  busy?: boolean
  /** Whether to say which file is being converted, where nothing around the
   *  steps does. */
  named?: boolean
  /** Whether to say what was found in the file, where nothing around the
   *  steps does. */
  noted?: boolean
  /** What went wrong with the last file given back, shown under its drop. */
  problem?: ReactNode
}) {
  const [saved, setSaved] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const returned = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 2000)
    return () => window.clearTimeout(timer)
  }, [saved])
  // The assistant menu closes on Escape — before anything around it does — or
  // on a press anywhere outside its step.
  useEffect(() => {
    if (!choosing) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const anchor = menu.current?.parentElement
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setChoosing(false)
      anchor?.querySelector<HTMLElement>('.source-step')?.focus()
    }
    const onPress = (event: PointerEvent) => {
      if (!anchor?.contains(event.target as Node)) setChoosing(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [choosing])

  const photo = waiting.kind === 'photo'
  const word = waiting.kind === 'word'
  const pictures = !photo && waiting.tags.length > 0
  // A photo's page has nothing tagged on it; it gets the instructions for a
  // source with no labeled copy, which name every picture by page 1.
  const instructions = fillImageTags(extractInstructions, photo ? null : waiting.tags, word ? 'word' : 'pdf')
  const save = () => {
    downloadInstructions(instructions, waiting.fileName)
    setSaved(true)
  }
  /** What the teacher calls the file they dropped. */
  const file = photo ? t('conv.filePhoto') : word ? t('conv.fileDocument') : 'PDF'
  // With a labeled copy, both files to attach are the two just downloaded.
  // The instructions say what to do with the test, so nothing needs typing.
  const attach = pictures ? t('conv.attachBoth') : t('conv.attachInstructions', { file })

  const download = async () => {
    setError(null)
    try {
      let labeled: { bytes: Uint8Array; type: string; name: string }
      if (word) {
        const { labelWordDocument, labeledWordFilename, WORD_MIME_TYPE } = await import('../export/word-document')
        labeled = { bytes: await labelWordDocument(waiting.bytes), type: WORD_MIME_TYPE, name: labeledWordFilename(waiting.fileName) }
      } else {
        const [{ labelSourceDocument, labeledFilename }, { browserPdfFonts }] = await Promise.all([
          import('./source-document'),
          import('../export/pdf-export'),
        ])
        labeled = {
          bytes: await labelSourceDocument(waiting.bytes, waiting.tags, browserPdfFonts),
          type: 'application/pdf',
          name: labeledFilename(waiting.fileName),
        }
      }
      const url = URL.createObjectURL(new Blob([labeled.bytes.slice().buffer as ArrayBuffer], { type: labeled.type }))
      const link = document.createElement('a')
      link.href = url
      link.download = labeled.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('conv.labeledFailed', { file }))
    }
  }

  const open = (assistant: (typeof ASSISTANTS)[number]) => {
    setChoosing(false)
    window.open(assistant.url, '_blank', 'noopener')
  }

  let number = 0
  return <section className="source-steps" aria-label={t('conv.ariaConvert')}>
    {named && <h2 className="source-steps-title" title={waiting.fileName}>
      <span>{t('conv.converting')}</span> <span className="source-steps-name">{waiting.fileName}</span>
    </h2>}
    <p className="source-steps-intro">
      {t('conv.intro')}
    </p>
    {noted && <p className="source-steps-note" role="status">
      {pictures && <ImageIcon aria-hidden="true" />}
      {pictures
        ? t('conv.picturesDetected', { count: waiting.tags.length, file })
        : photo
          ? t('conv.photoNote')
          : t('conv.noPictures', { file })}
    </p>}

    <ol className="source-steps-list">
      {pictures && <li>
        <StepButton
          number={++number}
          title={t('conv.downloadLabeled', { file })}
          text={t('conv.downloadLabeledText', { file })}
          icon={<Download />}
          disabled={busy}
          onClick={() => void download()}
        />
      </li>}
      <li>
        <StepButton
          number={++number}
          title={saved ? t('conv.downloaded') : t('conv.downloadInstructions')}
          text={t('conv.downloadInstructionsText')}
          icon={saved ? <Check /> : <FileText />}
          disabled={busy}
          onClick={save}
        />
      </li>
      <li className="source-step-menu-anchor">
        <StepButton
          number={++number}
          title={t('conv.openAi')}
          text={t('conv.attachSend', { attach })}
          icon={<ChevronDown />}
          disabled={busy}
          expanded={choosing}
          onClick={() => setChoosing(!choosing)}
        />
        {choosing && <div ref={menu} className="source-step-menu" role="menu" aria-label={t('conv.ariaOpenAssistant')}>
          {ASSISTANTS.map((assistant) => (
            <button key={assistant.id} type="button" role="menuitem" onClick={() => open(assistant)}>
              {assistant.name}
            </button>
          ))}
        </div>}
      </li>
      <li>
        <StepButton
          number={++number}
          title={t('conv.dropBack')}
          text={t('conv.dropBackText', { andPicture: pictures || photo ? t('conv.andPicture') : '' })}
          icon={<UploadCloud />}
          disabled={busy}
          onClick={() => returned.current?.click()}
        />
      </li>
    </ol>

    <label className="bank-import-drop source-steps-drop">
      <input
        ref={returned}
        type="file"
        aria-label={t('conv.ariaFileFromAi')}
        accept="application/json,.json"
        disabled={busy}
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          event.target.value = ''
          if (chosen) onReturnedFile(chosen)
        }}
      />
      <UploadCloud aria-hidden="true" />
      <strong>{t('conv.dropParrot')}</strong>
      <span>{t('conv.orClick')}</span>
    </label>

    {problem}
    {error && <p className="home-error" role="alert">{error}</p>}
    <p className="source-steps-help">
      {t('conv.shouldConvert')}{' '}
      <a href={supportMailto(t('conv.subjectConvert'), { askForFile: true })}>{t('conv.emailFile')}</a>.
    </p>
    {onStartOver && <p className="source-steps-foot">
      <button type="button" className="link-button" disabled={busy} onClick={onStartOver}>{t('conv.startOver')}</button>
    </p>}
  </section>
}
