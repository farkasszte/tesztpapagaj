import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, FileText, ImageIcon, Library, UploadCloud, type LucideIcon } from 'lucide-react'
import {
  RECORD_PART_TYPE_LABELS,
  RECORD_TYPE_LABELS,
  RECORD_TYPE_ORDER,
  holdsSubparts,
  recordDocumentToEditorNodes,
  wordBankLettersOf,
  type QuestionBankRecordChoice,
  type QuestionBankRecordPart,
  type QuestionBankRecordQuestion,
  type SemanticDocument,
} from '../export/question-bank-export'
import { TopicBadge } from '../editor/badges'
import { blankAnswerBlocks } from '../editor/blank'
import type { Question } from '../exam/exam'
import { QuestionReading } from '../editor/question-reading'
import {
  SUBPARTS_LABEL,
  type QuestionReadingContent,
  type QuestionReadingPart,
} from '../editor/question-reading-content'
import { pendingImageOf, plainTextOf, type ProseMirrorJSON } from '../editor/question-doc'
import { isLocked } from '../editor/locked-answers'
import type { ImportProposal, ProposedBank, ProposedExam } from './package-import'
import {
  deniedBanksOf,
  hasAllowedItems,
  importSentence,
  importCounts,
  initialSelection,
  setBankAllowed,
  setBankTarget,
  setExamAllowed,
  type ImportSelection,
} from './import-selection'
import { subpartLabelAt, type LayoutPlan } from '../export/export-plan'
import { domMeasure, imageSourcesOfDocuments } from '../export/dom-measure'
import { ExportPreview } from '../exam/exam-page'
import { ImportError } from './import-error'
import { inspectQuestionFile, inspectUploadedFile, isRecordFile, needsConversion as fileNeedsConversion } from './question-bank-upload'
import { QuestionFileReport } from './question-file-report'
import { supportMailto } from '../support-email'
import { SupportedSources, TextOnlyChoices } from './import-choices'
import {
  checkAgainstSourceDocument,
  pendingImagesOf,
  pendingKeyOf,
  withPendingKeys,
  type PendingImageOccurrence,
  type PendingImageResolution,
  type SourceDocumentCheck,
} from '../editor/pending-images'
import { PageCropper, PictureChoices } from '../editor/resolve-images'
import { namedPage, usePictureChoice } from '../editor/picture-choice'
import {
  carriedResolutions,
  cropChoice,
  estimatedSize,
  originName,
  pictureSource,
  placeName,
  prefilledPictures,
  resolutionOf,
  type ResolvedPicture,
  type Resolutions,
  type ResolvingSource,
} from '../editor/resolved-pictures'
import { PictureSlotContext, type PictureSlot } from '../editor/picture-slot'
import { discardWaitingImport, readWaitingImport, type ImportFileKind, type WaitingImport } from './import-history'
import { bestWaitingImport } from './import-file-route'
import { SourceDocumentSteps } from './source-document-steps'
import { TEST_FILE_TYPES, kindOfFile, readSourceDocument, startWaitingImport } from './source-file'
import { useModalScrollLock } from '../use-modal-scroll-lock'
import { countOf, t } from '../i18n/index'
import { KahootLinkField } from './kahoot-link-field'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


/**
 * The two kinds of thing a file can bring in, each with one icon and one
 * colour used wherever the dialog names it — its Import List section, the
 * rail's heading, a link to it — so an entry is recognisably a bank or a Test
 * before it is read. An Exam is called a Test here: it is the word for the
 * file in a teacher's hand. The icons are the ones the sidebar gives each
 * section.
 */
const KINDS = {
  bank: { Icon: Library, get noun() { return t('import.kindBankOne') } },
  exam: { Icon: FileText, get noun() { return t('import.kindTestOne') } },
} satisfies Record<string, { Icon: LucideIcon; noun: string }>
type Kind = keyof typeof KINDS

/** Which item the rail is describing, and — since its checkbox lives in the
 *  Import List — whether it is coming. */
function RailHead({ kind, name, allowed }: { kind: Kind; name: string; allowed: boolean }) {
  const { Icon, noun } = KINDS[kind]
  return <header className="bank-import-rail-head" data-kind={kind}>
    <p><Icon aria-hidden="true" />{noun}</p>
    <h3>{name}</h3>
    {!allowed && <p className="bank-import-left-out">{t('import.notImported')}</p>}
  </header>
}

/** A picture the preview draws in a Pending Image's place. */
type PreviewPicture = { src: string; size?: number }

/**
 * Point a preview document's images at the bytes the file carries, and each
 * Pending Image at the picture chosen for it.
 *
 * `recordDocumentToEditorNodes` addresses an image as `/local-images/<hash>`,
 * which resolves only for media that already lives here. Nothing has been
 * imported yet, so the preview would draw every image broken; the file's own
 * Media Assets are the only copy that exists, so each is drawn from its bytes.
 * A Pending Image carries its key (`withPendingKeys`), which the preview keeps
 * as `pictureKey` so that clicking it opens that picture's choices.
 */
function resolveMedia(
  node: ProseMirrorJSON,
  sources: ReadonlyMap<string, string>,
  pictures: ReadonlyMap<string, PreviewPicture>,
): ProseMirrorJSON {
  const attrs = node.attrs as Record<string, unknown> | null | undefined
  const key = pendingKeyOf(node)
  if (key) {
    const picture = pictures.get(key)
    const { pending: _pending, ...rest } = attrs ?? {}
    void _pending
    return {
      ...node,
      attrs: picture
        ? { ...rest, src: picture.src, ...(picture.size !== undefined ? { size: picture.size } : {}), pictureKey: key }
        : { ...rest, pending: pendingImageOf(node), pictureKey: key },
    }
  }
  const resolved =
    attrs && typeof attrs.src === 'string' ? sources.get(attrs.src) : undefined
  return {
    ...node,
    ...(resolved ? { attrs: { ...attrs, src: resolved } } : {}),
    ...(Array.isArray(node.content)
      ? {
          content: (node.content as ProseMirrorJSON[]).map((child) =>
            resolveMedia(child, sources, pictures),
          ),
        }
      : {}),
  }
}

function mediaSources(proposal: ImportProposal): Map<string, string> {
  const sources = new Map<string, string>()
  for (const bank of proposal.banks) {
    for (const asset of bank.record.media) {
      sources.set(
        `/local-images/${asset.id.slice('sha256:'.length)}`,
        pictureSource(asset),
      )
    }
  }
  return sources
}

/**
 * The student test an Exam would print, laid out by the same Layout Plan the
 * export uses. It is built the way the import will build the Exam
 * (`import-preview.ts`), so what is previewed is what arrives — Work Space and
 * the lines a Paper Style rules included.
 */
async function examPreviewPlan(
  proposal: ImportProposal,
  examKey: string,
  sources: ReadonlyMap<string, string>,
  pictures: ReadonlyMap<string, PreviewPicture>,
): Promise<LayoutPlan | null> {
  // Loaded on demand, like the importer: it brings the record parsers.
  const { importedExam, importPreviewPlan } = await import('./import-preview')
  const selected = importedExam(proposal, examKey, (question: Question): Question => ({
    ...question,
    doc: resolveMedia(question.doc, sources, pictures),
  }), domMeasure.bankAnswerWidth)
  if (!selected) return null
  // Pictures measure as nothing until their bytes arrive, so the page is not
  // planned until every one has.
  await domMeasure.loadImages(imageSourcesOfDocuments(selected.exam.questions.map((question) => question.doc)))
  return importPreviewPlan(selected, domMeasure)
}

/** A Fill in the Blank stem's answers, as the reading draws them, when any
 *  Blank has one. */
function blankAnswersReading(stem: ProseMirrorJSON[]): { blankAnswers?: ProseMirrorJSON[] } {
  const answers = blankAnswerBlocks({ type: 'doc', content: stem })
  return answers.length > 0 ? { blankAnswers: answers } : {}
}

/** A record Question, as the reading draws it. */
function readingOfRecordQuestion(
  question: QuestionBankRecordQuestion,
  previewDocument: (document: SemanticDocument) => ProseMirrorJSON[],
): QuestionReadingContent {
  const letters = wordBankLettersOf(question)
  // A Part that holds Subparts reads as its lead-in with its Subparts beneath.
  const partOf = (part: QuestionBankRecordPart, letter: string): QuestionReadingPart =>
    holdsSubparts(part)
      ? {
          id: part.id,
          letter,
          typeLabel: SUBPARTS_LABEL,
          stem: previewDocument(part.stem),
          subparts: part.subparts.map((subpart, subpartIndex) => partOf(subpart, subpartLabelAt(subpartIndex))),
        }
      : {
          id: part.id,
          letter,
          typeLabel: RECORD_PART_TYPE_LABELS[part.type],
          stem: previewDocument(part.stem),
          ...(part.choices ? {
            choices: part.choices.map((choice) => choiceOf(choice, true)),
          } : {}),
          ...(part.suggestedAnswer ? { suggestedAnswer: previewDocument(part.suggestedAnswer) } : {}),
        }
  // A choice is locked as it will be once imported: as the record says, or
  // by its wording where the record leaves it undecided. True/False never is.
  const choiceOf = (choice: QuestionBankRecordChoice, lockable: boolean) => {
    const content = previewDocument(choice.content)
    return {
      id: choice.id,
      content,
      correct: choice.correct,
      locked: lockable && isLocked(choice.locked, plainTextOf({ type: 'doc', content })),
    }
  }
  return {
    typeLabel: RECORD_TYPE_LABELS[question.type],
    difficulty: question.difficulty,
    topics: question.topics ?? [],
    stem: previewDocument(question.stem),
    ...(question.choices ? {
      choices: question.choices.map((choice) => choiceOf(choice, question.type === 'multiple-choice' || question.type === 'multiple-answer')),
    } : {}),
    ...(question.prompts && question.wordBank ? {
      matching: {
        prompts: question.prompts.map((prompt) => ({
          id: prompt.id,
          content: previewDocument(prompt.content),
          letter: letters.get(prompt.answer ?? ''),
        })),
        wordBank: question.wordBank.map((answer) => ({
          id: answer.id,
          content: previewDocument(answer.content),
        })),
      },
    } : {}),
    ...(question.suggestedAnswer ? { suggestedAnswer: previewDocument(question.suggestedAnswer) } : {}),
    ...(question.type === 'fill-in-the-blank' ? blankAnswersReading(previewDocument(question.stem)) : {}),
    ...(question.parts ? {
      parts: question.parts.map((part, index) => partOf(part, String.fromCharCode(97 + index))),
    } : {}),
  }
}

/** A bank read as a list of its questions. It has no printable page, so it
 *  is shown borderless rather than on a sheet that would suggest one. */
function BankPreview({
  bank,
  previewDocument,
}: {
  bank: ProposedBank
  previewDocument: (document: SemanticDocument) => ProseMirrorJSON[]
}) {
  const { record } = bank
  const questions = record.bank.questions
  return <div className="bank-import-reading">
    <header className="bank-import-preview-head">
      <h3>{record.bank.name || t('bank.untitledName')}</h3>
      <p>{countOf(questions.length, 'question')}</p>
      {record.bank.description && (
        <p className="bank-import-preview-description">{record.bank.description}</p>
      )}
    </header>
    {questions.map((question) => (
      <article key={question.id} className="question-reading">
        <QuestionReading content={readingOfRecordQuestion(question, previewDocument)} />
      </article>
    ))}
  </div>
}

function ExamPreview({
  proposal,
  exam,
  sources,
  pictures,
}: {
  proposal: ImportProposal
  exam: ProposedExam
  sources: ReadonlyMap<string, string>
  pictures: ReadonlyMap<string, PreviewPicture>
}) {
  const [plan, setPlan] = useState<LayoutPlan | null | 'loading'>('loading')
  // Another Test starts from nothing; a changed picture keeps the pages on
  // screen, where the teacher is looking, until they are laid out again.
  useEffect(() => setPlan('loading'), [exam.key])
  useEffect(() => {
    let current = true
    examPreviewPlan(proposal, exam.key, sources, pictures)
      .catch(() => null)
      .then((next) => { if (current) setPlan(next) })
    return () => { current = false }
  }, [proposal, exam.key, sources, pictures])
  return plan === 'loading'
    ? <p className="bank-import-empty" role="status">{t('import.layingOutPages')}</p>
    : plan
    ? <div className="bank-import-exam-pages" aria-label={`${exam.name || 'Untitled Test'} pages`}>
        <ExportPreview plan={plan} />
      </div>
    : <p className="bank-import-empty">{t('import.noQuestionsYet')}</p>
}

/** How many of a Test's positions are of each Question Type, read from the
 *  bank Question each position references — the same rows a bank's summary
 *  counts, so a Test and the banks it draws on read alike. */
function examTypeCounts(
  proposal: ImportProposal,
  exam: ProposedExam,
): Record<(typeof RECORD_TYPE_ORDER)[number], number> {
  const counts = Object.fromEntries(RECORD_TYPE_ORDER.map((type) => [type, 0])) as Record<
    (typeof RECORD_TYPE_ORDER)[number],
    number
  >
  for (const { question } of exam.positions) {
    const type = proposal.banks
      .find(({ id }) => id === question.bank)
      ?.record.bank.questions.find(({ id }) => id === question.question)?.type
    if (type) counts[type] += 1
  }
  return counts
}

/** One bank's facts, in the rows the Question Bank import has always shown. */
function BankSummary({ bank, picturesNeeded, readAs }: {
  bank: ProposedBank
  picturesNeeded: number
  /** The format a question file from another tool was read as, which is
   *  what its version row would otherwise misstate. */
  readAs?: string
}) {
  const { record, summary } = bank
  return <>
    <dl className="bank-import-summary">
      {RECORD_TYPE_ORDER.map((type) => (
        <div key={type}>
          <dt>{RECORD_TYPE_LABELS[type]}</dt>
          <dd>{summary.questionCounts[type]}</dd>
        </div>
      ))}
      {summary.questionsWithoutCorrectAnswer > 0 && (
        <div className="is-warning">
          <dt>{t('import.noCorrectAnswer')}</dt>
          <dd>{summary.questionsWithoutCorrectAnswer}</dd>
        </div>
      )}
      {summary.pendingImages > picturesNeeded && (
        <div>
          <dt>{t('import.picturesFilled')}</dt>
          <dd>{summary.pendingImages - picturesNeeded}</dd>
        </div>
      )}
      {picturesNeeded > 0 && (
        <div className="is-warning">
          <dt>{t('import.picturesNeededTitle')}</dt>
          <dd>{picturesNeeded}</dd>
        </div>
      )}
      <div>
        <dt>{t('import.mediaAssets')}</dt>
        <dd>
          {summary.mediaAssets}
          {summary.mediaAssets > 0 && <small>{formatBytes(summary.decodedMediaBytes)}</small>}
        </dd>
      </div>
      <div>
        <dt>{t('import.externalLinks2')}</dt>
        <dd>{summary.externalLinks ? t('import.present') : t('import.none')}</dd>
      </div>
      {readAs ? (
        <div>
          <dt>{t('import.from')}</dt>
          <dd>{readAs}</dd>
        </div>
      ) : (
        <div>
          <dt>{t('import.formatVersion')}</dt>
          <dd>{summary.formatVersion}</dd>
        </div>
      )}
    </dl>
    {summary.topics.length > 0 && (
      <div className="bank-import-topics">
        <h4>{t('import.topics')}</h4>
        <div>{summary.topics.map((topic) => <TopicBadge key={topic} topic={topic} />)}</div>
      </div>
    )}
    {(record.bank.author || record.bank.license) && (
      <dl className="bank-import-provenance">
        {record.bank.author && (
          <div>
            <dt>{t('import.declaredAuthor')}</dt>
            <dd>{record.bank.author}</dd>
          </div>
        )}
        {record.bank.license && (
          <div>
            <dt>{t('import.license')}</dt>
            <dd>
              {record.bank.license.name}
              {record.bank.license.url ? ` — ${record.bank.license.url}` : ''}
            </dd>
          </div>
        )}
      </dl>
    )}
  </>
}

type Focus = { kind: 'bank'; id: string } | { kind: 'exam'; key: string }

/** A way to another item from inside the rail: a Test’s banks, a bank’s Tests. */
function TabLink({
  kind,
  name,
  detail,
  onShow,
}: {
  kind: Kind
  name: string
  detail?: string
  onShow: () => void
}) {
  const { Icon } = KINDS[kind]
  return <button type="button" className="bank-import-link" data-kind={kind} onClick={onShow}>
    <Icon aria-hidden="true" />
    <span>{name}</span>
    {detail && <small>{detail}</small>}
  </button>
}

/**
 * A Pending Image in the preview, drawn with the picture chosen for it — or
 * as “picture needed” — and a badge saying which. Clicking it opens its
 * choices in the rail. The badge sits over the picture, taking up no room, so
 * the page lays out as it will print.
 */
function PreviewPictureButton({
  occurrence,
  resolved,
  source,
  inline,
  selected,
  onPick,
  children,
}: {
  occurrence: PendingImageOccurrence
  resolved: ResolvedPicture | undefined
  source: ResolvingSource | null
  inline: boolean
  selected: boolean
  onPick: () => void
  children: ReactNode
}) {
  const badge = !resolved
    ? t('import.addPicture')
    : resolved.origin.kind === 'tag'
      ? t('import.detectedImage', { tag: resolved.origin.tag })
      : resolved.origin.kind === 'crop'
        ? t('import.croppedFrom', { page: resolved.origin.page })
        : t('import.uploaded')
  return <span
    className="preview-picture"
    data-inline={inline ? 'true' : undefined}
    data-state={resolved ? 'filled' : 'needed'}
    data-selected={selected ? 'true' : undefined}
    role="button"
    tabIndex={0}
    aria-pressed={selected}
    aria-label={`${placeName(occurrence)}: ${resolved ? originName(resolved, source) : t('import.pictureNeeded')}. ${t('import.changePicture')}`}
    onClick={(event) => {
      event.stopPropagation()
      onPick()
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onPick()
    }}
  >
    {children}
    <span className="preview-picture-badge" aria-hidden="true">{badge}</span>
  </span>
}

const focusKey = (focus: Focus) => (focus.kind === 'bank' ? `bank:${focus.id}` : `exam:${focus.key}`)

export function QuestionBankImportDialog({
  onClose,
  onImport,
  initialFile,
  initialProposal,
  targetBankId,
  loadBanks,
  waitingImportId,
  onConverting,
  dropped,
}: {
  onClose: () => void
  /** A test to convert has started an import that waits for its AI. It
   *  waits on its own page, which outlives the dialog, so the dialog hands
   *  it over there. */
  onConverting: (waiting: WaitingImport) => void
  onImport: (
    proposal: ImportProposal,
    selection: ImportSelection,
    options: {
      resolution: PendingImageResolution
      history: { fileName: string; kind: ImportFileKind; waitingImportId?: string }
    },
  ) => Promise<void>
  /** A file already chosen elsewhere — dropped onto the page — inspected as
   *  soon as the dialog opens rather than asked for again. */
  initialFile?: File
  /** A proposal handed in ready-made — a Kahoot link already read into
   *  questions — shown as if a file had been read, with no file to inspect. */
  initialProposal?: ImportProposal
  /** The bank the import was started from, which every bank in the file
   *  defaults to adding into. */
  targetBankId?: string
  /** The banks on this device, for “Add to an existing one”. */
  loadBanks: () => Promise<readonly { id: string; name: string }[]>
  /** The waiting import the file is the assistant's answer to, when the
   *  dialog was opened from that import's own page. */
  waitingImportId?: string
  /** A file dropped anywhere while the dialog is open. During a review of an
   *  assistant's file it is the corrected file, and replaces the one shown. */
  dropped?: { file: File; id: number }
}) {
  const titleId = useId()
  const listId = useId()
  const dialog = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [selection, setSelection] = useState<ImportSelection | null>(null)
  /** Each bank's name for “Create new question bank”, kept while the target
   *  is switched to an existing bank and back. */
  const [names, setNames] = useState<Record<string, string>>({})
  const [focus, setFocus] = useState<Focus | null>(null)
  const [existingBanks, setExistingBanks] = useState<readonly { id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Whether the file that failed was one an AI made, which it can fix. */
  const [aiMade, setAiMade] = useState(false)
  // A file this app cannot read at all — a scan, a screenshot, a PDF that
  // did not come from here — is not a broken import, it is a test that has
  // not been converted yet. That failure is answered with the way to convert
  // it rather than with a reading of what went wrong.
  const [needsConversion, setNeedsConversion] = useState(false)
  const [phase, setPhase] = useState<'choose' | 'inspecting' | 'analyzing' | 'saving'>('choose')
  /** The import this dialog is converting: one it started, or the one it
   *  was opened for. Every dialog is a new import otherwise — it never picks
   *  up another import that is part-way through. */
  const [waiting, setWaiting] = useState<WaitingImport | null>(null)
  /** Set when the file under review was paired with a waiting import: how
   *  well it matches the Source Document. */
  const [paired, setPaired] = useState<SourceDocumentCheck | null>(null)
  /** The file under review, as the import history will name it. */
  const [inspected, setInspected] = useState<{ fileName: string; kind: ImportFileKind } | null>(null)
  /** The file under review, kept to read it again as another format. */
  const inspectedFile = useRef<File | null>(null)
  /** The corrected file the review was last updated from, to say so. */
  const [revisedFrom, setRevisedFrom] = useState<string | null>(null)
  const revisionInput = useRef<HTMLInputElement>(null)
  const [filling, setFilling] = useState(false)
  /** The Pending Image whose choices the rail shows, picked in the preview,
   *  and whether its page is being cropped in the preview's place. */
  const [picked, setPicked] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const [resolutions, setResolutions] = useState<Resolutions>(new Map())
  /** A Source Document dropped into Resolve Images for a file that was not
   *  paired with a waiting import. Used for this import only, never kept. */
  const [suppliedSource, setSuppliedSource] = useState<ResolvingSource | null>(null)
  const busy = phase !== 'choose'
  const busyRef = useRef(busy)
  busyRef.current = busy
  const backOutRef = useRef<() => boolean>(() => false)
  backOutRef.current = () => {
    if (cropping) setCropping(false)
    else if (picked) setPicked(null)
    else return false
    return true
  }
  useModalScrollLock()

  useEffect(() => {
    let current = true
    void loadBanks().then((banks) => { if (current) setExistingBanks(banks) }, () => undefined)
    return () => { current = false }
  }, [loadBanks])


  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => input.current?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        // A picture's choices close before the dialog does.
        if (backOutRef.current()) return
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled)',
        ) ?? [],
      )
      if (!controls.length) return
      const first = controls[0]!
      const last = controls.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus()
      })
    }
  }, [onClose])

  useEffect(() => {
    if (error && phase === 'choose') input.current?.focus()
  }, [error, phase])

  // The file control has gone with the choose step, taking focus with it. It
  // goes to the shown item's entry in the Import List, not to the bank's name
  // at the foot of the rail, which would scroll the rail past its facts.
  useEffect(() => {
    if (!proposal) return
    requestAnimationFrame(() => {
      if (dialog.current?.contains(document.activeElement)) return
      dialog.current
        ?.querySelector<HTMLElement>('.bank-import-entry[aria-pressed="true"]')
        ?.focus()
    })
  }, [proposal])

  const failed = (reason: unknown, fromAi = false) => {
    setNeedsConversion(fileNeedsConversion(reason))
    setAiMade(fromAi)
    setError(
      reason instanceof Error && reason.message
        ? reason.message
        : t('import.inspectFailed'),
    )
  }

  /** A PDF that is not a Test Parrot file is a Source Document: its pictures
   *  are found and tagged, and the import waits for the assistant. */
  const startSourceDocument = async (file: File) => {
    setPhase('analyzing')
    setError(null)
    setNeedsConversion(false)
    try {
      onConverting(await startWaitingImport(file))
    } catch (reason) {
      failed(reason)
    } finally {
      setPhase('choose')
    }
  }

  /** A test to convert rather than a file to import — a photo, a Word
   *  document, or a PDF with no Test Parrot file inside — starts a new
   *  import. Any other import already waiting keeps waiting. */
  const startConverting = startSourceDocument

  /**
   * The waiting import a returned file answers, and how well it matches. The
   * one this dialog is converting is paired whatever the check says, since
   * the teacher dropped the file on it; otherwise the file is paired only
   * with a waiting import it clearly came from, the best match if several.
   */
  const pairingFor = async (next: ImportProposal) => {
    const own = waiting ?? (waitingImportId ? await readWaitingImport(waitingImportId).catch(() => null) : null)
    if (own) return { source: own, check: checkAgainstSourceDocument(next, own) }
    return bestWaitingImport(next)
  }

  /** A Word document read as questions, converted by an AI after all. */
  const convertInstead = () => {
    const file = inspectedFile.current
    if (!file) return
    setProposal(null)
    setSelection(null)
    setFocus(null)
    void startConverting(file)
  }

  const inspect = (file: File) => {
    inspectedFile.current = file
    setPhase('inspecting')
    setProposal(null)
    setPaired(null)
    setPicked(null)
    setCropping(false)
    setResolutions(new Map())
    setSuppliedSource(null)
    setError(null)
    setAiMade(false)
    setNeedsConversion(false)
    setRevisedFrom(null)
    setInspected({ fileName: file.name, kind: 'record' })
    void (async () => {
      const kind = kindOfFile(file)
      if (kind === 'photo') return startConverting(file)
      let next: ImportProposal | undefined
      if (kind === 'word') {
        // A Word document written in a question format needs no AI; any
        // other is a test to convert.
        try {
          next = await inspectQuestionFile(file)
        } catch {
          return startConverting(file)
        }
      }
      try {
        next ??= await inspectUploadedFile(file)
        if (next.reading) setInspected({ fileName: file.name, kind: 'questions' })
        // JSON is an assistant's answer to a test being converted.
        const pairing = isRecordFile(file) ? await pairingFor(next) : null
        setProposal(next)
        setSelection(initialSelection(next, targetBankId ? { targetBankId } : {}))
        setNames(Object.fromEntries(next.banks.map((bank) => [bank.id, bank.record.bank.name])))
        // A Test is what a teacher converting a test came for, so it is what
        // the preview opens on when there is one.
        setFocus(next.exams[0] ? { kind: 'exam', key: next.exams[0].key } : { kind: 'bank', id: next.banks[0]!.id })
        if (pairing) {
          setWaiting(pairing.source)
          setPaired(pairing.check)
        }
        setPhase('choose')
      } catch (reason) {
        const code = reason instanceof Error && 'code' in reason ? reason.code : null
        if (!isRecordFile(file) && code === 'missing-attachment') return startConverting(file)
        failed(reason, isRecordFile(file))
        setPhase('choose')
      }
    })()
  }

  /**
   * An assistant's corrected file, dropped on the review of the one it
   * replaces. The review stays as it was until the new file reads cleanly —
   * a file that does not is answered with its error and the old preview — and
   * then shows the new file for the same waiting import, keeping each picture
   * the teacher had in place where the new file still asks for it.
   */
  const revise = (file: File) => {
    if (!proposal || !isRecordFile(file)) return inspect(file)
    const before = pendingImagesOf(proposal)
    setPhase('inspecting')
    setError(null)
    setAiMade(false)
    setNeedsConversion(false)
    void (async () => {
      try {
        const next = await inspectUploadedFile(file)
        const pairing = await pairingFor(next)
        inspectedFile.current = file
        setInspected({ fileName: file.name, kind: 'record' })
        setProposal(next)
        setSelection(initialSelection(next, targetBankId ? { targetBankId } : {}))
        setNames((current) => Object.fromEntries(next.banks.map((bank) => [bank.id, current[bank.id] ?? bank.record.bank.name])))
        setFocus((current) =>
          current?.kind === 'exam' && next.exams.some(({ key }) => key === current.key) ? current
            : current?.kind === 'bank' && next.banks.some(({ id }) => id === current.id) ? current
              : next.exams[0] ? { kind: 'exam', key: next.exams[0].key } : { kind: 'bank', id: next.banks[0]!.id })
        setPicked(null)
        setCropping(false)
        setResolutions((current) => carriedResolutions(current, before, pendingImagesOf(next)))
        if (pairing) {
          setWaiting(pairing.source)
          setPaired(pairing.check)
        }
        setRevisedFrom(file.name)
      } catch (reason) {
        failed(reason, true)
      } finally {
        setPhase('choose')
      }
    })()
  }

  // A file dropped while the dialog is open: the corrected file during a
  // review, or the assistant's file while its import waits.
  const takenDrop = useRef(dropped?.id)
  useEffect(() => {
    if (!dropped || takenDrop.current === dropped.id || busy) return
    takenDrop.current = dropped.id
    revise(dropped.file)
  })

  const discard = async () => {
    if (waiting) await discardWaitingImport(waiting.id).catch(() => undefined)
    setWaiting(null)
  }

  /** Back from a review of the wrong file to the import that waits. */
  const chooseAnother = () => {
    setProposal(null)
    setSelection(null)
    setPaired(null)
    setPicked(null)
    setCropping(false)
    setResolutions(new Map())
    setError(null)
  }

  /** A proposal shown as a file's reading: what the dialog does with every
   *  import, whether it came from a file, a link or an AI. */
  const showProposal = (next: ImportProposal) => {
    setInspected({ fileName: next.reading?.label ?? t('import.action'), kind: 'record' })
    setProposal(next)
    setSelection(initialSelection(next, targetBankId ? { targetBankId } : {}))
    setNames(Object.fromEntries(next.banks.map((bank) => [bank.id, bank.record.bank.name])))
    setFocus(next.exams[0] ? { kind: 'exam', key: next.exams[0].key } : { kind: 'bank', id: next.banks[0]!.id })
    setPhase('choose')
  }

  const inspectOnOpen = useRef({ file: initialFile, proposal: initialProposal })
  useEffect(() => {
    const opened = inspectOnOpen.current
    inspectOnOpen.current = { file: undefined, proposal: undefined }
    // Deliberately once, for what the dialog was opened with. A later drop
    // opens the dialog again with a fresh key rather than mutating this one.
    if (opened.proposal) {
      showProposal(opened.proposal)
      return
    }
    if (opened.file) inspect(opened.file)
  }, [])

  const sources = useMemo(() => (proposal ? mediaSources(proposal) : new Map<string, string>()), [proposal])
  /** The proposal the preview draws: each Pending Image knows its key. */
  const previewProposal = useMemo(
    () => proposal && { ...proposal, banks: proposal.banks.map((bank) => ({ ...bank, record: withPendingKeys(bank.id, bank.record) })) },
    [proposal],
  )

  const bankName = (id: string) => {
    const bank = proposal?.banks.find((item) => item.id === id)
    return bank?.record.bank.name || t('bank.untitledName')
  }
  const examName = (key: string) =>
    proposal?.exams.find((item) => item.key === key)?.name || 'Untitled Test'

  const counts = proposal && selection ? importCounts(proposal, selection) : null
  const importable = selection ? hasAllowedItems(selection) : false
  const occurrences = useMemo(
    () => (proposal && selection ? pendingImagesOf(proposal, (id) => selection.banks[id]?.allowed ?? false) : []),
    [proposal, selection],
  )
  const resolvingSource: ResolvingSource | null = paired && waiting ? waiting : suppliedSource
  const mismatch = paired !== null && !paired.matches
  const choice = usePictureChoice(occurrences, resolutions, setResolutions)
  const pickedOccurrence = occurrences.find(({ key }) => key === picked)

  /** Each Pending Image's picture, at the size it will be imported at. */
  const pictures = useMemo(() => {
    const drawn = new Map<string, PreviewPicture>()
    for (const occurrence of occurrences) {
      const picture = resolutions.get(occurrence.key)
      if (!picture) continue
      const size = estimatedSize(picture, occurrence)
      drawn.set(occurrence.key, { src: pictureSource(picture.asset), ...(size !== undefined ? { size } : {}) })
    }
    return drawn
  }, [occurrences, resolutions])
  const previewDocument = useMemo(
    () => (document: SemanticDocument) =>
      recordDocumentToEditorNodes(document).map((node) => resolveMedia(node, sources, pictures)),
    [sources, pictures],
  )

  /** Take every tagged picture out of the Source Document, for each Pending
   *  Image that has none yet. */
  const fill = (source: ResolvingSource) => {
    const unfilled = occurrences.filter(({ key }) => !resolutions.has(key))
    if (unfilled.length === 0) return
    setFilling(true)
    void prefilledPictures(unfilled, source)
      .then((filled) => setResolutions((current) => new Map([...filled, ...current])))
      .finally(() => setFilling(false))
  }
  // The pictures are filled in as soon as the file is shown — unless it seems
  // to come from another test, when the teacher asks for them.
  // A beolvasás után a tanár dolga a bank nevének eldöntése: a fókusz oda
  // kerül, hogy billentyűzettel is egyenesen tovább lehessen lépni. Egyszer,
  // a review első felbukkanásakor — később a tanáré a fókusz.
  const nameInputs = useRef(new Map<string, HTMLInputElement | null>())
  const focusedReview = useRef(false)
  useEffect(() => {
    if (phase !== 'choose') {
      focusedReview.current = false
      return
    }
    if (focusedReview.current) return
    focusedReview.current = true
    const frame = requestAnimationFrame(() => {
      const first = [...nameInputs.current.values()].find((node): node is HTMLInputElement => node !== null)
      first?.focus()
      first?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const filledFor = useRef<unknown>(null)
  useEffect(() => {
    if (!proposal || !resolvingSource || mismatch || filledFor.current === proposal) return
    filledFor.current = proposal
    fill(resolvingSource)
  })

  const supplySource = async (file: File) => {
    setError(null)
    setFilling(true)
    try {
      const source = await readSourceDocument(file)
      setSuppliedSource(source)
      const filled = await prefilledPictures(occurrences.filter(({ key }) => !resolutions.has(key)), source)
      setResolutions((current) => new Map([...filled, ...current]))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('import.pdfUnreadable'))
    } finally {
      setFilling(false)
    }
  }

  const confirm = async () => {
    if (!proposal || !selection || busy || !importable) return
    setPhase('saving')
    setError(null)
    try {
      await onImport(proposal, selection, {
        resolution: resolutionOf(resolutions, occurrences),
        history: {
          ...(inspected ?? { fileName: t('import.parrotFile'), kind: 'record' }),
          ...(paired && waiting ? { waitingImportId: waiting.id } : {}),
        },
      })
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message
          ? `Nothing was imported: ${reason.message}`
          : t('import.nothingImported'),
      )
      setPhase('choose')
    }
  }

  const focusedBank = focus?.kind === 'bank' ? proposal?.banks.find(({ id }) => id === focus.id) : undefined
  const focusedExam = focus?.kind === 'exam' ? proposal?.exams.find(({ key }) => key === focus.key) : undefined

  const entryId = (item: Focus) => `${listId}-${focusKey(item)}`
  const showItem = (next: Focus, moveFocus = false) => {
    setFocus(next)
    setPicked(null)
    setCropping(false)
    if (moveFocus) requestAnimationFrame(() => document.getElementById(entryId(next))?.focus())
  }

  const pick = (key: string) => {
    setPicked(key)
    setCropping(false)
  }
  const slot: PictureSlot = (key, picture, inline) => {
    const occurrence = occurrences.find((candidate) => candidate.key === key)
    if (!occurrence) return picture
    const resolved = resolutions.get(key)
    return <PreviewPictureButton
      occurrence={occurrence}
      resolved={resolved}
      source={resolvingSource}
      inline={inline}
      selected={picked === key}
      onPick={() => pick(key)}
    >
      {picture}
    </PreviewPictureButton>
  }
  const detected = occurrences.filter(({ key }) => resolutions.has(key)).length

  /** One kind's entries in the Import List: a section that opens and closes,
   *  headed by how many of that kind are coming, with a checkbox per item for
   *  whether it comes and the rest of the row for showing it. */
  const listSection = (
    kind: Kind,
    heading: string,
    items: { focus: Focus; name: string; detail: string; allowed: boolean; onAllow: (allowed: boolean) => void }[],
    coming: number,
  ) => {
    const { Icon } = KINDS[kind]
    return <details className="bank-import-list-section" data-kind={kind} open>
      <summary>
        <ChevronRight className="bank-import-list-chevron" aria-hidden="true" />
        <Icon aria-hidden="true" />
        <span>{heading}</span>
        <span className="badge bank-import-kind">
          {coming === items.length ? coming : `${coming} of ${items.length}`}
        </span>
      </summary>
      <ul>
        {items.map((item) => {
          const selected = focus !== null && focusKey(item.focus) === focusKey(focus)
          return <li key={focusKey(item.focus)} data-selected={selected ? 'true' : undefined} data-allowed={item.allowed ? 'true' : 'false'}>
            <input
              type="checkbox"
              checked={item.allowed}
              disabled={busy}
              aria-label={`Import ${item.name}`}
              onChange={(event) => item.onAllow(event.target.checked)}
            />
            <button
              id={entryId(item.focus)}
              type="button"
              className="bank-import-entry"
              aria-pressed={selected}
              aria-label={`Preview ${item.name}`}
              onClick={() => showItem(item.focus)}
            >
              <span>{item.name}</span>
              <small>{item.detail}</small>
            </button>
          </li>
        })}
      </ul>
    </details>
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialog}
        className={[
          'bank-import-dialog',
          proposal ? 'bank-import-dialog--review' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
      >
        <header className="dialog-header">
          <div className="bank-import-title">
            <h2 id={titleId}>{t('import.action')}</h2>
            {proposal?.reading && <span className="bank-import-read-as">{t('imports.readAs', { label: proposal.reading.label })}</span>}
          </div>
          <a className="bank-import-help" href={supportMailto(t('import.troubleTitle'), { askForFile: true })}>
            {t('import.troubleLink')}
          </a>
        </header>

        {!proposal && waiting && (
          <div className="bank-import-choose">
            <SourceDocumentSteps
              waiting={waiting}
              named
              busy={busy}
              onReturnedFile={inspect}
              onStartOver={() => void discard()}
            />
          </div>
        )}

        {!proposal && !waiting && (
          <div className="bank-import-choose">
            {/* The whole dashed zone is the file control: dropping on it lands
                in the window-level drop target, clicking it opens the picker,
                and the input itself stays in the tab order under the zone. */}
            <label className="bank-import-drop">
              <input
                ref={input}
                type="file"
                aria-label={t('import.sourceLabel')}
                accept={`${TEST_FILE_TYPES},application/json,.json`}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  // Cleared so that choosing the same file after an error, or
                  // after backing out of a review, is still a change event.
                  event.target.value = ''
                  if (file) inspect(file)
                }}
              />
              <UploadCloud aria-hidden="true" />
              <strong>{t('imports.dropHere')}</strong>
              <span>{t('import.orClick')}</span>
            </label>
            {needsConversion ? (
              <div className="bank-import-assist" data-emphasis="true" role="alert">
                <span>
                  <strong>{t('import.notParrotYet')}</strong> {t('import.dropToConvert')}
                </span>
              </div>
            ) : <>
              <SupportedSources />
              <TextOnlyChoices busy={busy} onPaste={inspect} />
              <KahootLinkField onProposal={showProposal} compact />
            </>}
          </div>
        )}

        <div
          className="bank-import-announcements"
          aria-live="polite"
          aria-atomic="true"
        >
          {phase === 'inspecting' && <p role="status">{t('import.validating')}</p>}
          {phase === 'analyzing' && <p role="status">{t('import.findingPictures')}</p>}
          {phase === 'saving' && <p role="status">{t('import.saving')}</p>}
          {error && !needsConversion && <ImportError message={error} aiMade={aiMade} />}
        </div>

        {proposal && mismatch && waiting && (
          <div className="bank-import-mismatch" role="alert">
            <p>
              <strong>{t('imports.otherTest', { file: waiting.fileName })}</strong>{' '}
              {paired!.unknownTags.length > 0
                ? `It names ${paired!.unknownTags.map((tag) => `IMG ${tag}`).join(', ')}, which your test does not have. `
                : ''}
              {paired!.stemsChecked > 0 && paired!.stemsFound * 2 <= paired!.stemsChecked
                ? t('import.mostNotInTest')
                : ''}
              {t('import.importAnywayHint')}
            </p>
            <span className="bank-import-assist-actions">
              {resolvingSource && occurrences.some(({ key }) => !resolutions.has(key)) && (
                <button type="button" className="secondary-button" disabled={busy || filling} onClick={() => fill(resolvingSource)}>
                  {t('import.usePicturesAnyway')}
                </button>
              )}
              <button type="button" className="secondary-button" disabled={busy} onClick={chooseAnother}>
                {t('import.chooseAnother')}
              </button>
            </span>
          </div>
        )}

        {/* An assistant's file is a draft the teacher can send back: whatever
            the preview shows wrong, the chat that wrote it can write again. */}
        {proposal && waiting && paired && !proposal.reading && (
          <div className="bank-import-revise">
            <p>
              {revisedFrom
                ? <><strong>{t('import.reviseUpdated', { name: revisedFrom })}</strong>{' '}{t('import.reviseStill')}{' '}</>
                : <><strong>{t('import.reviseAsk')}</strong>{' '}</>}
              {t('import.reviseBody')}
            </p>
            <label className="secondary-button bank-import-revise-file">
              <input
                ref={revisionInput}
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) revise(file)
                }}
              />
              <UploadCloud aria-hidden="true" />
              {t('import.dropNewFile')}
            </label>
          </div>
        )}

        {proposal?.reading && (
          <QuestionFileReport
            reading={proposal.reading}
            busy={busy}
            onConvertInstead={proposal.reading.word ? convertInstead : undefined}
          />
        )}

        {proposal && selection && focus && (
          <section className="bank-import-body" aria-label={t('import.confirmation')}>
            <nav className="bank-import-list" aria-labelledby={`${listId}-heading`}>
              <header>
                <h3 id={`${listId}-heading`}>{t('import.listTitle')}</h3>
                <p>{t('import.listIntro')}</p>
              </header>
              {listSection(
                'bank',
                proposal.banks.length === 1 ? t('import.kindBankOne') : t('import.kindBank'),
                proposal.banks.map((bank) => ({
                  focus: { kind: 'bank', id: bank.id },
                  name: bank.record.bank.name || t('bank.untitledName'),
                  detail: countOf(bank.record.bank.questions.length, 'question'),
                  allowed: selection.banks[bank.id]!.allowed,
                  onAllow: (allowed) => setSelection(setBankAllowed(proposal, selection, bank.id, allowed)),
                })),
                counts?.banks ?? 0,
              )}
              {proposal.exams.length > 0 && listSection(
                'exam',
                proposal.exams.length === 1 ? t('import.kindTestOne') : t('import.kindTest'),
                proposal.exams.map((exam) => ({
                  focus: { kind: 'exam', key: exam.key },
                  name: exam.name || 'Untitled Test',
                  // A Test left out because a bank it needs is left out says so
                  // on its own row, where the checkbox that fixes it is.
                  detail: deniedBanksOf(proposal, selection, exam.key).length > 0
                    ? `Needs ${deniedBanksOf(proposal, selection, exam.key).map(bankName).join(' and ')}`
                    : countOf(exam.positions.length, 'question'),
                  allowed: selection.exams[exam.key]!.allowed,
                  onAllow: (allowed) => setSelection(setExamAllowed(proposal, selection, exam.key, allowed)),
                })),
                counts?.exams ?? 0,
              )}
            </nav>

            <div
              className="bank-import-preview"
              data-kind={focusedExam ? 'exam' : 'bank'}
              aria-label={focusedExam ? t('import.testPreview') : t('import.bankPreview')}
            >
              {occurrences.length > 0 && !cropping && (
                <p className="bank-import-picture-hint" role="status">
                  <ImageIcon aria-hidden="true" />
                  <span>
                    {filling
                      ? `Finding your pictures in ${resolvingSource?.fileName ?? t('import.yourTest')}…`
                      : detected > 0
                        ? `${detected === occurrences.length ? `All ${countOf(detected, 'picture')}` : `${detected} of ${countOf(occurrences.length, 'picture')}`} detected from ${resolvingSource?.fileName ?? t('import.yourTest')}. Click a picture to change it.`
                        : `${countOf(occurrences.length, 'picture')} needed. Click one to add it, or add them after importing.`}
                  </span>
                </p>
              )}
              {cropping && pickedOccurrence && resolvingSource
                ? <PageCropper
                    key={pickedOccurrence.key}
                    source={resolvingSource}
                    startPage={namedPage(pickedOccurrence, resolvingSource)}
                    onCancel={() => setCropping(false)}
                    onCrop={(page, box) =>
                      void choice
                        .run(pickedOccurrence, () => cropChoice(resolvingSource, page, box))
                        .then((done) => { if (done) setCropping(false) })}
                  />
                : <PictureSlotContext.Provider value={slot}>
                    {focusedBank && previewProposal && (
                      <BankPreview
                        bank={previewProposal.banks.find(({ id }) => id === focusedBank.id)!}
                        previewDocument={previewDocument}
                      />
                    )}
                    {focusedExam && previewProposal && (
                      <ExamPreview proposal={previewProposal} exam={focusedExam} sources={sources} pictures={pictures} />
                    )}
                  </PictureSlotContext.Provider>}
            </div>

            {pickedOccurrence && (
              <aside className="bank-import-controls bank-import-picture" aria-label={t('bankImport.pictureFor', { place: placeName(pickedOccurrence) })}>
                <header className="bank-import-rail-head" data-kind="picture">
                  <p><ImageIcon aria-hidden="true" />{t('import.picture')}</p>
                  {/* Named by what it shows: a Test numbers its Questions by
                      Section, so the bank's number would name another one. */}
                  <h3>{pickedOccurrence.caption || pickedOccurrence.alt || 'Picture'}</h3>
                </header>
                {choice.error && <p className="home-error" role="alert">{choice.error}</p>}
                <PictureChoices
                  key={pickedOccurrence.key}
                  occurrence={pickedOccurrence}
                  occurrences={occurrences}
                  source={resolvingSource}
                  resolutions={resolutions}
                  choice={choice}
                  onCrop={() => setCropping(true)}
                  described={false}
                  onSourceFile={(file) => void supplySource(file)}
                />
                <button type="button" className="primary-button bank-import-picture-done" onClick={() => { setPicked(null); setCropping(false) }}>
                  {t('common.done')}
                </button>
              </aside>
            )}

            {!pickedOccurrence && focusedBank && (() => {
              const bank = focusedBank
              const chosen = selection.banks[bank.id]!
              const name = bank.record.bank.name || t('bank.untitledName')
              const targetName = names[bank.id] ?? ''
              const fallbackExisting = targetBankId ?? existingBanks[0]?.id
              return <aside
                className="bank-import-controls"
                data-allowed={chosen.allowed ? 'true' : 'false'}
                aria-label={t('bankImport.bankNamed', { name })}
              >
                <RailHead kind="bank" name={name} allowed={chosen.allowed} />

                <BankSummary
                  readAs={proposal.reading?.label}
                  bank={bank}
                  picturesNeeded={occurrences.filter(({ bankId, key }) => bankId === bank.id && !resolutions.has(key)).length}
                />

                {proposal.exams.length > 0 && <section className="bank-import-uses">
                  <h4>{t('import.usedBy')}</h4>
                  {bank.exams.length > 0
                    ? bank.exams.map((key) => (
                        <TabLink
                          key={key}
                          kind="exam"
                          name={examName(key)}
                          onShow={() => showItem({ kind: 'exam', key }, true)}
                        />
                      ))
                    : <p>{t('import.noTestInFile')}</p>}
                </section>}

                {/* Where the bank goes is a setting of the import, not a fact
                    about the bank, so it comes after everything that is. */}
                {chosen.allowed && <fieldset className="bank-import-target" disabled={busy}>
                  <legend>{t('import.settings')}</legend>
                  <label>
                    <input
                      type="radio"
                      name={`target-${bank.id}`}
                      checked={chosen.target.kind === 'new'}
                      onChange={() => setSelection(setBankTarget(selection, bank.id, { kind: 'new', name: targetName }))}
                    />
                    <span>{t('import.createNewBank')}</span>
                  </label>
                  {chosen.target.kind === 'new' && <input
                    ref={(node) => {
                      if (node) nameInputs.current.set(bank.id, node)
                      else nameInputs.current.delete(bank.id)
                    }}
                    className="bank-import-target-name"
                    aria-label={t('ui.newBankNameFor', { name })}
                    value={targetName}
                    onChange={(event) => {
                      setNames({ ...names, [bank.id]: event.target.value })
                      setSelection(setBankTarget(selection, bank.id, { kind: 'new', name: event.target.value }))
                    }}
                  />}
                  <label>
                    <input
                      type="radio"
                      name={`target-${bank.id}`}
                      checked={chosen.target.kind === 'existing'}
                      disabled={!fallbackExisting}
                      onChange={() => fallbackExisting && setSelection(setBankTarget(selection, bank.id, { kind: 'existing', bankId: fallbackExisting }))}
                    />
                    <span>{t('import.addToExisting')}</span>
                  </label>
                  {chosen.target.kind === 'existing' && <select
                    className="bank-import-target-bank"
                    aria-label={t('bankImport.existingBank', { name })}
                    value={chosen.target.bankId}
                    onChange={(event) => setSelection(setBankTarget(selection, bank.id, { kind: 'existing', bankId: event.target.value }))}
                  >
                    {!existingBanks.some(({ id }) => id === (chosen.target as { bankId: string }).bankId) && (
                      <option value={chosen.target.bankId}>{t('import.thisBankLabel')}</option>
                    )}
                    {existingBanks.map((existing) => (
                      <option key={existing.id} value={existing.id}>{existing.name}</option>
                    ))}
                  </select>}
                </fieldset>}
              </aside>
            })()}

            {!pickedOccurrence && focusedExam && (() => {
              const exam = focusedExam
              const chosen = selection.exams[exam.key]!
              const name = exam.name || 'Untitled Test'
              const denied = deniedBanksOf(proposal, selection, exam.key)
              return <aside
                className="bank-import-controls"
                data-allowed={chosen.allowed ? 'true' : 'false'}
                aria-label={`Test ${name}`}
              >
                <RailHead kind="exam" name={name} allowed={chosen.allowed} />
                {!chosen.allowed && denied.length > 0 && <p className="bank-import-denied-reason">
                  {denied.length === 1
                    ? t('import.deniedOne', { bank: bankName(denied[0]) })
                    : t('import.deniedMany', { banks: denied.map(bankName).join(', ') })}
                </p>}

                <dl className="bank-import-summary">
                  {(() => {
                    const counts = examTypeCounts(proposal, exam)
                    return RECORD_TYPE_ORDER.map((type) => (
                      <div key={type}>
                        <dt>{RECORD_TYPE_LABELS[type]}</dt>
                        <dd>{counts[type]}</dd>
                      </div>
                    ))
                  })()}
                  <div>
                    <dt>{t('import.formatVersion')}</dt>
                    <dd>{exam.formatVersion}</dd>
                  </div>
                </dl>

                <section className="bank-import-uses">
                  <h4>{t('import.questionsFrom')}</h4>
                  {exam.banks.map((id) => (
                    <TabLink
                      key={id}
                      kind="bank"
                      onShow={() => showItem({ kind: 'bank', id }, true)}
                      name={bankName(id)}
                      detail={countOf(
                        exam.positions.filter(({ question }) => question.bank === id).length,
                        'question',
                      )}
                    />
                  ))}
                </section>
              </aside>
            })()}
          </section>
        )}

        <footer className="dialog-actions">
          {proposal && selection && (
            <p className="bank-import-outcome" id={`${listId}-outcome`}>
              {importSentence(
                proposal,
                selection,
                (id) => existingBanks.find((existing) => existing.id === id)?.name ?? t('import.thisBank'),
              )}
            </p>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            {waiting && !proposal ? t('import.close') : t('common.cancel')}
          </button>
          {proposal && selection && (
            <button
              type="button"
              className="primary-button"
              disabled={busy || !importable || filling}
              aria-describedby={`${listId}-outcome`}
              onClick={() => void confirm()}
            >
              {phase === 'saving' ? t('import.importing') : mismatch ? t('import.importAnyway') : t('import.action')}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
