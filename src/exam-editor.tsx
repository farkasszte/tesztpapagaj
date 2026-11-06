import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Question, SectionTarget } from './exam'
import { withPartPoints, withQuestionPoints } from './points'
import { bankQuestionById } from './question-bank'
import { type ExamStore } from './exam-store'
import { ExamPage } from './exam-page'
import { topicOptions } from './question-bank-view'
import { useSelection } from './use-selection'
import { useWorkspaceDrag } from './use-workspace-drag'
import { WorkspaceSplit } from './workspace-split'
import { DEFAULT_EXPORT_CONFIGURATION, PicturesNeededError, prepareExport, prepareHistoricalExport, readExportPreferences, readShufflePreferences, writeExportPreferences, writeShufflePreferences, type ExportConfiguration, type PreparationProgress, type PreparedExport } from './export-preparation'
import { ExportDialog, ReExportDialog } from './export-dialog'
import { DEFAULT_VERSION_COUNT, maxVersionCount, NO_SHUFFLE, seededRandom } from './export-versions'
import { domMeasure, imageSourcesOfDocuments } from './dom-measure'
import { FileType2, FolderOpen, Heading, History, ListOrdered, Redo2, RefreshCw, Save, SaveAll, Trash2, Type as TypeIcon, Undo2 } from 'lucide-react'
import { ContextMenu, type MenuPoint } from './context-menu'
import { MarginsPanel } from './margins-panel'
import { DEFAULT_HEADING_SIZE, DEFAULT_TEXT_SIZE, HEADING_SIZES, HEADING_SIZE_LABELS, TEXT_SIZES } from './section-headings'
import { DEFAULT_PAPER_STYLE, PAPER_STYLES, PAPER_STYLE_LABELS } from './paper-style'
import { BEFORE_NAVIGATE_EVENT } from './use-route'
import { Footer } from './site-chrome'
import type { ExamWorkspaceService, QuestionUsage, RecentExam } from './exam-workspaces'
import { type QuestionBankResource, type QuestionBankWorkspaceService } from './question-bank-workspaces'
import { ExportHistoryDrawer } from './export-history'
import { requestPersistentStorage } from './storage/durable-storage'
import { MarginsIcon, PaperStylePreview } from './format-icons'
import { pastedSummary, questionsToAdd } from './question-clipboard'
import { t, useT } from './i18n'
import { QuestionDialog } from './question-editor'
import { QuestionBankTabsPane, ResourcePicker } from './question-bank-page'
import { workingCopyStates } from './working-copy-states'
import { QuestionDeletionConfirmation } from './confirmations'


/** The Exam's menu bar, in the order a document's menus are read. */
/** Mennyi ideig látszik a tárhely-figyelmeztetés. */
const STORAGE_NOTICE_DURATION = 8_000

/** The Exam's menu bar, in the order a document's menus are read. */
const DOCUMENT_MENUS = ['file', 'edit', 'format'] as const
type DocumentMenuKind = (typeof DOCUMENT_MENUS)[number]
// Getterek, nem betöltéskori értékek: a címke a mindenkori nyelvet követi,
// különben a menü a betöltés nyelvén marad (a nyelvváltást nem követi).
const DOCUMENT_MENU_LABELS: Record<DocumentMenuKind, string> = {
  get file() { return t('menu.file') },
  get edit() { return t('menu.edit') },
  get format() { return t('menu.format') },
}

function WorkingCopyStatus({ dirty, backupStatus }: {
  dirty: boolean
  backupStatus: 'pending' | 'failed' | 'ready'
}) {
  const t = useT()
  const state = backupStatus === 'pending' ? 'pending'
    : backupStatus === 'failed' ? 'failed'
      : dirty ? 'dirty' : 'saved'
  const { Icon, label, detail } = workingCopyStates()[state]
  return (
    <div className="working-copy-badge" data-state={state}>
      <button type="button" className="working-copy-badge-button" aria-label={label} aria-describedby="working-copy-tip">
        <Icon aria-hidden="true" />
      </button>
      {/* The words are still here for anyone who needs them: on hover, on
          focus, and — because this is what changed — announced. */}
      <div className="storage-tip working-copy-tip" id="working-copy-tip" role="tooltip">
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-label={t('exam.workingCopyStatus')}>{label}</span>
    </div>
  )
}

export function ExamEditor({
  store,
  examId,
  bankWorkspaces,
  workspaces,
  exams,
  onHome,
  onOpenExam,
  onSaveAs,
  onDelete,
  launchError,
  bankLibraryRevision = 0,
  onImportBank,
}: {
  store: ExamStore
  examId: string
  bankWorkspaces: QuestionBankWorkspaceService
  workspaces: ExamWorkspaceService
  exams: readonly RecentExam[]
  onHome: () => void
  onOpenExam: (id: string) => void
  onSaveAs: () => Promise<void>
  /** Asks to delete this Exam (ADR-0047); the confirmation is the app's. */
  onDelete: () => void
  launchError: string | null
  /** Bumped when something outside the bank pane — an import from the
   *  page-wide file drop — has opened a tab in this Exam's workspace, so the
   *  pane reads its tabs back rather than showing a strip that is now stale. */
  bankLibraryRevision?: number
  onImportBank?: (file?: File) => void
}) {
  const t = useT()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const backupStatus = useSyncExternalStore(store.subscribe, store.backupStatus)
  useEffect(() => {
    if (state.workingCopy.title === 'Untitled Exam' && state.workingCopy.questionIds.length === 0) return
    let current = true
    void store.whenSettled().then(() => {
      if (current && store.backupStatus() === 'ready') void requestPersistentStorage()
    })
    return () => { current = false }
  }, [state.workingCopy.questionIds.length, state.workingCopy.title, store])
  // What the page renders and what an export publishes: the Question Bank
  // records the Working Copy references, in Working Copy order, and nothing else.
  // The store derives it once per change, so it is a stable dependency.
  const { exam, arrangement } = useSyncExternalStore(store.subscribe, store.selectedExam)
  const workingCopyIds = new Set(state.workingCopy.questionIds)
  // A Question being edited. Creation is owned by the active Question Bank;
  // the Exam only opens existing canonical Questions for editing.
  const [editing, setEditing] = useState<{
    question: Question
    destination: 'question-bank'
    after: string | null
    owner?: QuestionBankResource
    usage?: QuestionUsage[]
  } | null>(null)
  // The export dialog owns no Exam state. Its globally remembered preferences
  // survive between Exams without dirtying or saving either Working Copy.
  const [exportDialog, setExportDialog] = useState<{
    configuration: ExportConfiguration
    error: string | null
    /** Drawn once per opening, so the Export Preview and the export shuffle
     *  alike: what the teacher sees is what downloads. */
    seed: number
  } | null>(null)
  const exportButton = useRef<HTMLButtonElement>(null)
  // Export can be opened by its visible button or Cmd/Ctrl+P. Remember the
  // actual focusable opener so dismissing it returns a keyboard user to where
  // they started, rather than always moving them to the toolbar.
  const exportTrigger = useRef<HTMLElement | null>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  // Opening an Export Record from History shows it in the Re-export dialog,
  // from its stored Layout Plans alone. Current authoring is never rebuilt.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reExporting, setReExporting] = useState<{ recordId: string; number: number } | null>(null)
  const reExportTrigger = useRef<HTMLElement | null>(null)
  const [confirmingQuestionDeletion, setConfirmingQuestionDeletion] = useState(false)
  const exportHistory = store.exportHistory()
  const reExportRecord = exportHistory.records.find(
    (candidate) => candidate.id === reExporting?.recordId,
  ) ?? null
  const isHistoricalBrowsing = historyOpen
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  // Pages of an exported PDF that run past their bottom margin (ADR-0046):
  // the export went ahead, and this stays until the teacher dismisses it.
  const [exportWarning, setExportWarning] = useState<string | null>(null)
  const [choosingExam, setChoosingExam] = useState(false)
  const [documentMenu, setDocumentMenu] = useState<{
    kind: DocumentMenuKind
    point: MenuPoint
  } | null>(null)
  // Where the Margins panel opened from the Format menu stands, while it is open.
  const [marginsPanel, setMarginsPanel] = useState<MenuPoint | null>(null)
  const closeMarginsPanel = useCallback(() => setMarginsPanel(null), [])
  const closeExportHistory = useCallback(() => {
    setHistoryOpen(false)
    requestAnimationFrame(() => historyButton.current?.focus())
  }, [])
  const closeReExport = useCallback(() => {
    const trigger = reExportTrigger.current
    reExportTrigger.current = null
    setReExporting(null)
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
    })
  }, [])
  // Selection lives here, alongside the store, so page interactions and
  // selection-wide context-menu actions share one source of truth.
  const selection = useSelection()
  const clearSelection = selection.clear
  const selectOnWorkingCopy = selection.select
  const [bankPercent, setBankPercent] = useState(33)
  const [bankRevision, setBankRevision] = useState(0)
  useEffect(() => {
    let current = true
    void bankWorkspaces.workspace({ examId }).then((workspace) => {
      if (current) setBankPercent(workspace.pane.bankPercent)
    })
    return () => { current = false }
  }, [bankWorkspaces, examId])
  // A question an authoring action has just put on the Working Copy, waiting to be
  // revealed. `ExamPage` clears it once repagination has actually put it on a
  // page, which — for a change of content — is not the same moment.
  const [revealQuestionId, setRevealQuestionId] = useState<string | null>(null)
  const clearReveal = useCallback(() => setRevealQuestionId(null), [])
  // The outcome of the latest Vary command stays visible and is announced to
  // assistive technology. It is transient UI feedback, not authoring state.
  const [varySummary, setVarySummary] = useState<string | null>(null)
  useEffect(() => {
    if (!varySummary) return
    const timer = window.setTimeout(() => setVarySummary(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [varySummary])
  // Storage durability is useful feedback immediately after first
  // publication, not a permanent obstruction over the workspace. It can be
  // dismissed sooner, and otherwise leaves on the same short-lived cadence as
  // the other notices.
  useEffect(() => {
    if (!storageNotice) return
    const timer = window.setTimeout(
      () => setStorageNotice(null),
      STORAGE_NOTICE_DURATION,
    )
    return () => window.clearTimeout(timer)
  }, [storageNotice])
  // One composition, however it was asked for.
  //
  // A pointer gesture and the row's Add button are two ways of saying the same
  // thing, so they say it here: exactly one call to the authoring boundary,
  // then the incoming
  // question becomes the selected one and is queued to be revealed. That is
  // what makes the paths yield the same Question Bank and Working Copy state
  // rather than merely similar ones — and what stops a question composed one
  // way being findable while the same question composed another way is not.
  const selectAndReveal = (questionId: string) => {
    selectOnWorkingCopy(questionId)
    setRevealQuestionId(questionId)
  }
  const addToWorkingCopy = (question: Question) => {
    store.addToWorkingCopy(question)
    selectAndReveal(question.id)
  }
  const addManyToWorkingCopy = (
    questions: readonly Question[],
    target: SectionTarget | null = null,
  ) => {
    if (questions.length === 0) return
    store.addManyToWorkingCopy(questions, target)
    selectAndReveal(questions.at(-1)!.id)
  }
  // A paste onto the sheet adds the copied Questions themselves, as a bank's
  // Add does, after the last selected question or at the end; one already on
  // the Exam is skipped. Their banks open as tabs, so they can be found again.
  const pasteQuestions = async (questionIds: string[], after: string | null) => {
    const located = await bankWorkspaces.locateQuestions(questionIds)
    const adding = questionsToAdd(located.map(({ question }) => question), new Set(workingCopyIds))
    const skipped = located.length - adding.length
    if (adding.length > 0) {
      const banks = [...new Set(located.filter(({ question }) => adding.includes(question)).map(({ bankId }) => bankId))]
      for (const bankId of banks) await bankWorkspaces.openTab({ examId }, bankId)
      if (banks.length > 0) setBankRevision((revision) => revision + 1)
      addManyToWorkingCopy(adding, after ? { kind: 'question', questionId: after, placement: 'after' } : null)
    }
    setVarySummary(pastedSummary(adding.length, skipped, questionIds.length))
  }
  const shuffleSelectedQuestions = (questionIds: readonly string[]) => {
    store.shuffleSelectedQuestions(questionIds)
    setVarySummary(t('exam.shuffledQuestions'))
  }

  const shuffleSelectedAnswers = (questionIds: readonly string[]) => {
    store.shuffleSelectedAnswers(questionIds)
    setVarySummary(t('exam.shuffledAnswers'))
  }

  // Points belong to the Question, not to this Exam (ADR-0042): set on the
  // sheet, they are a bank edit, committed through the owning Question Bank
  // and saved at once like a save from the question editor, never an
  // undoable change to the Working Copy. `partId` names a Part or Subpart of
  // a Multipart question; `null` the question itself.
  const setPoints = (questionId: string, partId: string | null, points: number | null) => {
    void (async () => {
      const question = bankQuestionById(store.getState().questionBank, questionId)
      if (!question) return
      const saved = partId === null
        ? withQuestionPoints(question, points)
        : withPartPoints(question, partId, points)
      if (JSON.stringify(saved) === JSON.stringify(question)) return
      try {
        const owner = await bankWorkspaces.ownerOfQuestion(questionId)
        if (!owner) throw new Error(t('exam.bankUnavailable'))
        await store.whenSettled()
        await bankWorkspaces.commitCanonicalQuestion(
          owner.id,
          saved,
          (canonical) => workspaces.propagateCanonicalQuestion(canonical),
        )
        store.syncCanonicalQuestions([saved])
        setBankRevision((revision) => revision + 1)
      } catch (error) {
        setStorageNotice(
          error instanceof Error && error.message
            ? t('errors.pointsNotSavedWhy', { reason: error.message })
            : t('errors.pointsNotSaved'),
        )
      }
    })()
  }

  // Where a released gesture goes. Each branch is one store call, so one drag
  // is one dirty flag, one mirrored write and one undo step — and the store
  // itself refuses a cross-section or duplicating drop, so the geometry above
  // only ever has to decide *where*, never *whether*.
  const drag = useWorkspaceDrag((source, intent) => {
    const target: SectionTarget =
      intent.kind === 'insert'
        ? { kind: 'question', questionId: intent.targetQuestionId, placement: intent.placement }
        : intent.kind === 'section-end'
          ? { kind: 'section-end', sectionId: intent.sectionId }
          : { kind: 'new-section', afterSectionId: intent.afterSectionId }
    if (source.pane === 'exam-draft') {
      // Dragging inside the Working Copy moves and nothing else: the pane a
      // gesture starts in is what gives it its meaning.
      store.moveInWorkingCopy(source.questionIds, target)
      return
    }
    const questions = source.questionIds.flatMap((questionId) => {
      const question = bankQuestionById(store.getState().questionBank, questionId)
      return question ? [question] : []
    })
    addManyToWorkingCopy(questions, target)
  })

  const openExport = useCallback(() => {
    // A command may start with focus on the document body. That is not a useful
    // restoration target, so fall back to the visible Export button in that
    // case. A real control, such as the Exam name field, retains its own focus.
    const active = document.activeElement
    exportTrigger.current =
      active instanceof HTMLElement && active !== document.body
        ? active
        : exportButton.current
    setExportDialog({
      configuration: { ...readExportPreferences(), ...readShufflePreferences(examId) },
      error: null,
      seed: Math.floor(Math.random() * 2 ** 32),
    })
  }, [examId])

  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 's'
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
      ) {
        event.preventDefault()
        if (editing || exportDialog || isHistoricalBrowsing) return
        if (event.shiftKey) void onSaveAs()
        else void store.save()
      }
    }
    document.addEventListener('keydown', onSaveShortcut)
    return () => document.removeEventListener('keydown', onSaveShortcut)
  }, [editing, exportDialog, isHistoricalBrowsing, onSaveAs, store])

  useEffect(() => {
    const backupNeedsWarning = () => store.backupStatus() !== 'ready'
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!backupNeedsWarning()) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onBeforeNavigate = (event: Event) => {
      if (!backupNeedsWarning()) return
      // The browser-native beforeunload prompt is unavailable to pushState.
      // Make the same choice explicit for in-app routes.
      if (!window.confirm(t('exam.leaveUnsaved'))) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener(BEFORE_NAVIGATE_EVENT, onBeforeNavigate)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener(BEFORE_NAVIGATE_EVENT, onBeforeNavigate)
    }
  }, [backupStatus, store, t])

  useEffect(() => {
    const onPrintShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'p'
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
      ) {
        // There is deliberately no browser-print fallback: even while another
        // modal owns focus, Cmd/Ctrl+P must not bypass recorded export.
        event.preventDefault()
        if (editing || exportDialog || isHistoricalBrowsing || exam.questions.length === 0) return
        openExport()
      }
    }
    document.addEventListener('keydown', onPrintShortcut)
    return () => document.removeEventListener('keydown', onPrintShortcut)
  }, [editing, exam.questions.length, exportDialog, isHistoricalBrowsing, openExport])

  useEffect(() => {
    if (editing || exportDialog || reExporting) return
    const onKeyDown = (event: KeyboardEvent) => {
      const authoringShortcut =
        (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey) && !event.altKey)
        || event.key === 'Delete'
        || event.key === 'Backspace'
      if (isHistoricalBrowsing && authoringShortcut) {
        // Do not let Backspace navigate away either: during history inspection
        // these keys name no authoring action at all.
        event.preventDefault()
        return
      }
      if (
        event.key.toLowerCase() === 'z'
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
      ) {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Not while something is being typed into: the bank's search box and
        // the filter lists are on the same page, and Backspace there means
        // what it always means.
        const target = event.target as HTMLElement | null
        const typing =
          target?.isContentEditable === true
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
        if (typing || selection.selectedIds.size === 0) return
        event.preventDefault()
        // Remove, not Delete: the questions come off the Working Copy and stay in
        // the Question Bank, which is why this needs no confirmation.
        store.removeFromWorkingCopy([...selection.selectedIds])
        clearSelection()
        return
      }
      if (event.key !== 'Escape') return
      if (historyOpen) {
        event.preventDefault()
        closeExportHistory()
        return
      }
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [clearSelection, closeExportHistory, editing, exportDialog, historyOpen, isHistoricalBrowsing, reExporting, selection.selectedIds, store])

  const closeExportDialog = () => {
    const trigger = exportTrigger.current
    exportTrigger.current = null
    setExportDialog(null)
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && active !== document.documentElement) return
      if (trigger?.isConnected) trigger.focus()
      else exportButton.current?.focus()
    })
  }

  const prepareForPublication = (
    configuration: ExportConfiguration,
    onProgress?: (progress: PreparationProgress) => void,
  ) => prepareExport({
    examId,
    exam,
    arrangement,
    configuration,
    history: exportHistory,
    measure: domMeasure,
    createdAt: new Date().toISOString(),
    random: seededRandom(exportDialog?.seed ?? 0),
    onProgress,
  })

  /**
   * One export, from the Export button to the moment the browser takes over.
   *
   * The selected artifact is fully packaged first. Only then does one IndexedDB
   * transaction commit immutable history, required media, and the current
   * authoring state. The browser receives the download after that commit.
   */
  const runPreparedExport = async (prepared: PreparedExport) => {
    const format = prepared.record.format
    let blob: Blob
    let warning: string | null = null
    try {
      if (format === 'pdf') {
        const pdf = await import('./pdf-export')
        const created = await pdf.createPublicationPdf(
          prepared.documents,
          undefined,
          undefined,
          prepared.record.examPackage,
        )
        blob = pdf.pdfBlob(created.bytes)
        warning = pdf.pastMarginWarning(created.pagesPastMargin)
      } else {
        const docx = await import('./docx-export')
        blob = await docx.createPublicationDocx(prepared.documents)
      }
    } catch (error) {
      console.error(`Could not create the ${format.toUpperCase()} file`, error)
      const media = await import('./export-media')
      const pdf = format === 'pdf' ? await import('./pdf-export') : null
      if (
        media.isRequiredMediaError(error)
        || pdf?.isPdfUnsupportedCharacterError(error)
      ) throw error
      throw new Error(
        format === 'pdf'
          ? t('export.pdfFailed')
          : t('export.wordFailed'),
      )
    }

    let durability: 'granted' | 'denied' | null = null
    if (exportHistory.records.length === 0) {
      try {
        const storageResult = await requestPersistentStorage()
        durability = storageResult === 'unavailable' ? null : storageResult
      } catch {
        durability = 'denied'
      }
    }

    try {
      await store.publish(prepared.record)
    } catch (error) {
      console.error(t('export.commitFailed'), error)
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error(
          t('export.storageFull'),
        )
      }
      throw new Error(
        t('export.recordSaveFailed'),
      )
    }

    if (durability) {
      setStorageNotice(
        durability === 'granted'
          ? t('export.historyPersistent')
          : t('export.historyNotPersistent'),
      )
    }
    try {
      if (format === 'pdf') {
        const { savePdfFile } = await import('./pdf-export')
        savePdfFile(blob, prepared.filename)
      } else {
        const { saveDocxFile } = await import('./docx-export')
        saveDocxFile(blob, prepared.filename)
      }
    } catch (error) {
      console.error(`Could not start the ${format.toUpperCase()} download`, error)
      throw new Error(t('export.downloadFailed'))
    }
    // Told once the file is the teacher's, and only about this export.
    setExportWarning(warning)
  }

  let exportPreview: PreparedExport | null = null
  let previewError: string | null = null
  let exportBlocked: string | null = null
  if (exportDialog) {
    try {
      const hasNoSelectedContent =
        !exportDialog.configuration.selection.test
        && !exportDialog.configuration.selection.answerKey
      // Prepare the default streams for preview while the selection is invalid,
      // then deliberately show no paper until the teacher chooses content.
      const previewConfiguration = hasNoSelectedContent
        ? DEFAULT_EXPORT_CONFIGURATION
        : exportDialog.configuration
      const prepared = prepareForPublication(previewConfiguration)
      exportPreview = hasNoSelectedContent
        ? { ...prepared, documents: [] }
        : prepared
    } catch (error) {
      if (error instanceof PicturesNeededError) exportBlocked = error.message
      else previewError = error instanceof Error ? error.message : t('export.prepareFailed')
    }
  }

  return (
    <>
      {launchError && <p className="home-error editor-launch-error" role="alert">{launchError}</p>}
      {/* This bar belongs to the Exam. The mark is the way home and the name
          sits beside it, where a document's name sits — the same name that is
          printed on the page's own title line, and the same field: typing in
          either is typing the Exam's name. */}
      <div className="editor-shell">
      <header className="document-bar">
        <div className="document-identity">
          <button
            type="button"
            className="editor-home-mark"
            aria-label={t('exam.home')}
            title={t('nav.home')}
            onClick={onHome}
          >
            <img className="app-logo" src="/logo.svg" alt="" width={36} height={36} />
          </button>
          <div className="document-title-stack">
            <input
              aria-label={t('exam.name')}
              className="document-title"
              value={state.workingCopy.title}
              disabled={isHistoricalBrowsing}
              placeholder={t('exam.untitled')}
              onChange={(event) => store.setTitle(event.target.value)}
            />
            <nav className="document-menus" aria-label={t('exam.menus')}>
              {DOCUMENT_MENUS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="document-menu-button"
                  aria-haspopup="menu"
                  aria-expanded={documentMenu?.kind === kind}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setDocumentMenu((current) => current?.kind === kind
                      ? null
                      : { kind, point: { x: bounds.left, y: bounds.bottom + 4 } })
                  }}
                >
                  {DOCUMENT_MENU_LABELS[kind]}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <div className="header-actions">
          <div className="document-edit-actions" aria-label={t('exam.editingActions')}>
            <button
              type="button"
              className="toolbar-icon-button"
              aria-label={t('exam.undo')}
              title={t('ui.undo')}
              disabled={isHistoricalBrowsing || !store.canUndo()}
              onClick={() => {
                if (!isHistoricalBrowsing) store.undo()
              }}
            >
              <Undo2 />
            </button>
            <button
              type="button"
              className="toolbar-icon-button"
              aria-label={t('exam.redo')}
              title={t('ui.redo')}
              disabled={isHistoricalBrowsing || !store.canRedo()}
              onClick={() => {
                if (!isHistoricalBrowsing) store.redo()
              }}
            >
              <Redo2 />
            </button>
          </div>
          {/* A mark, not a sentence. It changes on every keystroke, and four
              different sentences in a flex row that wraps means the whole bar
              reflowing under the teacher's hands while they type. The text is
              still there — in the tooltip, and announced to a screen reader —
              but the slot it lives in never changes size. */}
          <WorkingCopyStatus dirty={state.dirty} backupStatus={backupStatus} />
          <button
            ref={historyButton}
            type="button"
            className="toolbar-icon-button"
            aria-label={t('exam.exportHistory')}
            title={t('exam.exportHistory')}
            aria-expanded={historyOpen}
            aria-controls="export-history"
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <History aria-hidden="true" />
          </button>
          {/* Save and Export stay available while a change is still being
              backed up — both wait for it — so they never flicker off and on
              with every edit; only a failed backup holds them. */}
          <button
            type="button"
            className="primary-button"
            aria-label={t('exam.save')}
            disabled={isHistoricalBrowsing || !state.dirty || backupStatus === 'failed'}
            onClick={() => void store.save()}
          >
            {t('exam.save')}
          </button>
          <button
            ref={exportButton}
            type="button"
            className="secondary-button"
            disabled={backupStatus === 'failed' || isHistoricalBrowsing}
            aria-haspopup="dialog"
            aria-expanded={exportDialog !== null}
            onClick={() => openExport()}
          >
            {t('exam.export')}
          </button>
        </div>
      </header>

      {documentMenu && <ContextMenu
        point={documentMenu.point}
        ariaLabel={`${DOCUMENT_MENU_LABELS[documentMenu.kind]} menu`}
        items={documentMenu.kind === 'format' ? [
          // How the Exam's page is set, as distinct from what is on it. Every
          // setting here is this Exam's presentation, saved and undone with it.
          {
            kind: 'submenu',
            label: t('exam.headingSize'),
            icon: <Heading />,
            items: HEADING_SIZES.map((size) => ({
              kind: 'radio' as const,
              label: HEADING_SIZE_LABELS[size],
              checked: (state.workingCopy.headingSize ?? DEFAULT_HEADING_SIZE) === size,
              onSelect: () => {
                if (!isHistoricalBrowsing) store.setHeadingSize(size)
              },
            })),
          },
          {
            kind: 'submenu',
            label: t('exam.textSize'),
            icon: <TypeIcon />,
            items: TEXT_SIZES.map((size) => ({
              kind: 'radio' as const,
              label: HEADING_SIZE_LABELS[size],
              checked: (state.workingCopy.textSize ?? DEFAULT_TEXT_SIZE) === size,
              onSelect: () => {
                if (!isHistoricalBrowsing) store.setTextSize(size)
              },
            })),
          },
          // One Paper Style for the whole Exam, never per question or
          // per type (ADR-0041). The sheet reflows as soon as it changes.
          {
            kind: 'submenu',
            label: t('exam.paperStyle'),
            icon: <ListOrdered />,
            value: PAPER_STYLE_LABELS[state.workingCopy.paperStyle ?? DEFAULT_PAPER_STYLE].label,
            items: PAPER_STYLES.map((style) => ({
              kind: 'radio' as const,
              label: PAPER_STYLE_LABELS[style].label,
              description: PAPER_STYLE_LABELS[style].description,
              preview: <PaperStylePreview style={style} />,
              checked: (state.workingCopy.paperStyle ?? DEFAULT_PAPER_STYLE) === style,
              onSelect: () => {
                if (!isHistoricalBrowsing) store.setPaperStyle(style)
              },
            })),
          },
          {
            // Opens beside the menu it came from, and stays while the sheet
            // reflows behind it.
            kind: 'action',
            label: t('exam.margins'),
            icon: <MarginsIcon />,
            disabled: isHistoricalBrowsing,
            onSelect: () => setMarginsPanel(documentMenu.point),
          },
        ] : documentMenu.kind === 'file' ? [
          {
            kind: 'action',
            label: t('exam.open'),
            icon: <FolderOpen />,
            onSelect: () => setChoosingExam(true),
          },
          { kind: 'separator' },
          {
            kind: 'action',
            label: t('exam.save'),
            icon: <Save />,
            disabled: isHistoricalBrowsing || !state.dirty || backupStatus === 'failed',
            onSelect: () => { void store.save() },
          },
          {
            kind: 'action',
            label: t('exam.saveAs'),
            icon: <SaveAll />,
            disabled: isHistoricalBrowsing,
            onSelect: () => { void onSaveAs() },
          },
          {
            kind: 'action',
            label: t('exam.discard'),
            icon: <RefreshCw />,
            disabled: !state.dirty,
            onSelect: () => { void store.discard() },
          },
          { kind: 'separator' },
          {
            kind: 'action',
            label: t('exam.export'),
            icon: <FileType2 />,
            disabled: backupStatus === 'failed' || isHistoricalBrowsing,
            onSelect: openExport,
          },
          {
            kind: 'action',
            label: t('exam.exportHistory'),
            icon: <History />,
            onSelect: () => setHistoryOpen(true),
          },
          { kind: 'separator' },
          {
            kind: 'action',
            label: t('exam.delete'),
            icon: <Trash2 />,
            destructive: true,
            onSelect: onDelete,
          },
        ] : [
          {
            kind: 'action',
            label: t('menu.undo'),
            icon: <Undo2 />,
            disabled: isHistoricalBrowsing || !store.canUndo(),
            onSelect: () => store.undo(),
          },
          {
            kind: 'action',
            label: t('menu.redo'),
            icon: <Redo2 />,
            disabled: isHistoricalBrowsing || !store.canRedo(),
            onSelect: () => store.redo(),
          },
        ]}
        onClose={() => setDocumentMenu(null)}
      />}

      {marginsPanel && <MarginsPanel
        point={marginsPanel}
        margins={state.workingCopy.margins}
        disabled={isHistoricalBrowsing}
        onChange={(sides, inches, continuing) => store.setMargins(sides, inches, { continuing })}
        onClose={closeMarginsPanel}
      />}

      {choosingExam && <ResourcePicker
        title={t('exam.open')}
        closeLabel={t('exam.closePicker')}
        emptyMessage={t('exam.noneOther')}
        resources={exams
          .filter((candidate) => candidate.id !== examId)
          .map((candidate) => ({
            id: candidate.id,
            name: candidate.title,
            questionCount: candidate.questionCount,
          }))}
        onChoose={(id) => {
          // A választás maga zárja be a választót: a dolgozat megnyílik alatta,
          // és a nyitva maradt párbeszéd a hátterével együtt elzárná a szerkesztőt.
          setChoosingExam(false)
          onOpenExam(id)
        }}
        onClose={() => setChoosingExam(false)}
      />}

      {exportDialog && (
        <ExportDialog
          configuration={exportDialog.configuration}
          onConfigurationChange={(configuration) => {
            writeExportPreferences({ format: configuration.format, selection: configuration.selection })
            writeShufflePreferences(examId, {
              shuffle: configuration.shuffle ?? NO_SHUFFLE,
              versionCount: configuration.versionCount ?? DEFAULT_VERSION_COUNT,
            })
            setExportDialog((current) => (current ? { ...current, configuration } : current))
          }}
          maxVersions={maxVersionCount(exam, arrangement, exportDialog.configuration.shuffle ?? NO_SHUFFLE)}
          previewPlans={exportPreview?.documents ?? []}
          empty={exam.questions.length === 0}
          blocked={exportBlocked}
          initialError={exportDialog.error ?? previewError}
          onSubmit={async (configuration, onProgress) => {
            const { withExamPackage } = await import('./exam-package-export')
            // Pages are planned from measured heights, and a picture still
            // loading measures as nothing.
            await domMeasure.loadImages(imageSourcesOfDocuments(
              exam.questions.flatMap((question) => [question.doc, question.suggestedAnswer]),
            ))
            await runPreparedExport(await withExamPackage(prepareForPublication(configuration, onProgress), {
              exam,
              arrangement,
              ownerOf: (questionId) => bankWorkspaces.ownerOfQuestion(questionId),
            }))
            closeExportDialog()
          }}
          onCancel={closeExportDialog}
        />
      )}

      <ExportHistoryDrawer
        records={exportHistory.records}
        selectedRecordId={reExporting?.recordId ?? null}
        open={historyOpen}
        onOpenChange={(open) => {
          if (open) setHistoryOpen(true)
          else closeExportHistory()
        }}
        onSelect={(selectedRecord, number) => {
          const active = document.activeElement
          reExportTrigger.current = active instanceof HTMLElement ? active : null
          setReExporting({ recordId: selectedRecord.id, number })
        }}
      />

      {reExportRecord && reExporting && (
        <ReExportDialog
          key={reExportRecord.id}
          number={reExporting.number}
          name={reExportRecord.capturedName}
          createdAt={reExportRecord.createdAt}
          configuration={{
            format: reExportRecord.format,
            selection: reExportRecord.selection,
            ...(reExportRecord.versions
              ? { shuffle: reExportRecord.shuffle ?? NO_SHUFFLE, versionCount: reExportRecord.versions.length }
              : { shuffle: NO_SHUFFLE, versionCount: 1 }),
          }}
          plans={reExportRecord.plans}
          onSubmit={async (versions) => {
            await runPreparedExport(prepareHistoricalExport({
              record: reExportRecord,
              ...(versions ? { versions } : {}),
              createdAt: new Date().toISOString(),
            }))
            closeReExport()
          }}
          onCancel={closeReExport}
        />
      )}

      {/* The split authoring workspace: the Question Bank beside the rendered
          Working Copy. The bank opens as the narrower pane — it is picked from
          rather than read — and the divider moves. */}
      <WorkspaceSplit
        initialBankPercent={bankPercent}
        onBankPercentChange={(percent) => {
          setBankPercent(percent)
          void bankWorkspaces.updatePane({ examId }, percent)
        }}
        bank={
          <div
            className="question-bank-authoring"
            inert={isHistoricalBrowsing || undefined}
            aria-hidden={isHistoricalBrowsing || undefined}
          >
          <QuestionBankTabsPane
            context={{ examId }}
            service={bankWorkspaces}
            onImportBank={onImportBank}
            workingCopyIds={workingCopyIds}
            onQuestionsChange={store.syncCanonicalQuestions}
            onAddToExam={addToWorkingCopy}
            onAddManyToExam={addManyToWorkingCopy}
            onRemoveFromExam={(questionId) => {
              store.removeFromWorkingCopy([questionId])
              if (selection.isSelected(questionId)) selection.toggle(questionId)
            }}
            workspaceDrag={drag}
            resourceRevision={bankRevision + bankLibraryRevision}
            examsService={workspaces}
            beforeCanonicalQuestionCommit={() => store.whenSettled()}
            onCanonicalQuestionCommitted={(question) => store.syncCanonicalQuestions([question])}
            onQuestionDeleted={(questionId) => {
              store.acceptForcedDeletion([questionId])
              clearSelection()
              drag.cancel()
              setBankRevision((revision) => revision + 1)
            }}
          />
          </div>
        }
        workingCopy={
          <>
            <div
              className="draft-document"
              // The drawer is itself historical browsing, so the exposed part
              // of the draft cannot receive pointer authoring gestures either.
              inert={isHistoricalBrowsing || undefined}
              aria-hidden={isHistoricalBrowsing || undefined}
            >
              <ExamPage
            exam={exam}
            arrangement={arrangement}
            selection={selection}
            onPasteQuestions={(questionIds, after) => void pasteQuestions(questionIds, after)}
            onSetPictureSize={(questionId, picture, size) => store.setPictureSize(questionId, picture, size)}
            drag={drag}
            revealQuestionId={revealQuestionId}
            onRevealed={clearReveal}
            onTitleChange={(title) => store.setTitle(title)}
            onSectionHeadingChange={(sectionId, change) => store.setSectionHeading(sectionId, change)}
            onMoveSection={(sectionId, direction) => store.moveSection(sectionId, direction)}
            onDeleteSection={(sectionId) => store.deleteSection(sectionId)}
            onSplitSection={(questionId) => store.splitSection(questionId)}
            onMoveToNewSection={(questionIds) => store.moveToNewSection(questionIds)}
            onInsertSection={(sectionId, placement) => store.insertSection(sectionId, placement)}
            onMergeSection={(sectionId, direction) => store.mergeSection(sectionId, direction)}
            onHeaderLineChange={(line, text) => store.setHeaderLine(line, text)}
            titleDisabled={isHistoricalBrowsing}
            onEdit={(questionId) => {
              const question = bankQuestionById(state.questionBank, questionId)
              if (!question) return
              void Promise.all([
                bankWorkspaces.ownerOfQuestion(questionId),
                workspaces.questionUsage(questionId),
              ]).then(([owner, usage]) => {
                setEditing({ question, destination: 'question-bank', after: null, owner: owner ?? undefined, usage })
              })
            }}
            onDuplicate={(questionId) => {
              void (async () => {
                const original = bankQuestionById(store.getState().questionBank, questionId)
                if (!original) return
                const owner = await bankWorkspaces.ownerOfQuestion(questionId)
                if (!owner) {
                  store.duplicateInWorkingCopy(questionId)
                  return
                }
                const before = new Set(owner.questions.map(({ id }) => id))
                const updated = await bankWorkspaces.commit(owner.id, {
                  kind: 'duplicate-question',
                  questionId,
                })
                const copy = updated.questions.find(({ id }) => !before.has(id))
                if (!copy) return
                store.duplicateInWorkingCopy(questionId, copy)
                setBankRevision((revision) => revision + 1)
              })()
            }}
            onShuffleSelected={shuffleSelectedQuestions}
            onShuffleSelectedAnswers={shuffleSelectedAnswers}
            onSetShownIncorrect={(questionIds, count) => {
              store.setShownIncorrect(questionIds, count)
              setVarySummary(count === Infinity
                ? t('errors.allIncorrectShown')
                : `Showing ${count} incorrect ${count === 1 ? 'answer' : 'answers'}.`)
            }}
            onRemove={(questionIds) => {
              store.removeFromWorkingCopy(questionIds)
              selection.clear()
            }}
            onSetColumns={(questionIds, columns) =>
              store.setQuestionColumns(questionIds, columns)
            }
            onSetWordBankLayout={(questionIds, layout) =>
              store.setWordBankLayout(questionIds, layout)
            }
            onSetWorkSpace={(questionIds, patch) =>
              store.setQuestionWorkSpace(questionIds, patch)
            }
            onSetPoints={isHistoricalBrowsing ? undefined : setPoints}
                unsavedDraft={!store.hasSavedExam()}
              />
            </div>
            <Footer />
          </>
        }
      />
      </div>

      {varySummary && (
        <p className="vary-summary" role="status" aria-live="polite">
          {varySummary}
        </p>
      )}

      {exportWarning && (
        <div className="storage-notice storage-notice--warning" role="alert">
          <p>{exportWarning}</p>
          <button
            type="button"
            className="toolbar-icon-button"
            aria-label={t('exam.dismissPdfWarning')}
            onClick={() => setExportWarning(null)}
          >
            ×
          </button>
        </div>
      )}

      {storageNotice && (
        <div className="storage-notice" role="status" aria-live="polite">
          <p>{storageNotice}</p>
          <button
            type="button"
            className="toolbar-icon-button"
            aria-label={t('exam.dismissStorageNotice')}
            onClick={() => setStorageNotice(null)}
          >
            ×
          </button>
        </div>
      )}

      {editing && (
        <QuestionDialog
          question={editing.question}
          isNew={!bankQuestionById(state.questionBank, editing.question.id)}
          topicSuggestions={topicOptions(state.questionBank)}
          ownerName={editing.owner?.name}
          onCancel={() => setEditing(null)}
          onDelete={bankQuestionById(state.questionBank, editing.question.id) ? () => {
            void (async () => {
              const [owner, usage] = await Promise.all([
                editing.owner ? Promise.resolve(editing.owner) : bankWorkspaces.ownerOfQuestion(editing.question.id),
                editing.usage ? Promise.resolve(editing.usage) : workspaces.questionUsage(editing.question.id),
              ])
              setEditing((current) => current ? { ...current, owner: owner ?? undefined, usage } : current)
              setConfirmingQuestionDeletion(true)
            })()
          } : undefined}
          onSave={async (saved) => {
            // Existing Questions are committed through their owning bank even
            // when this canonical editor was opened from an Exam. Exam state
            // changes only after that durable commit succeeds.
            if (bankQuestionById(state.questionBank, saved.id)) {
              const owner = editing.owner ?? await bankWorkspaces.ownerOfQuestion(saved.id)
              if (!owner) throw new Error(t('exam.bankUnavailable'))
              await store.whenSettled()
              await bankWorkspaces.commitCanonicalQuestion(
                owner.id,
                saved,
                (canonical) => workspaces.propagateCanonicalQuestion(canonical),
              )
              store.syncCanonicalQuestions([saved])
              setBankRevision((revision) => revision + 1)
            } else {
              store.createInQuestionBank(saved)
              await store.whenSettled()
            }
            setEditing(null)
          }}
        />
      )}

      {confirmingQuestionDeletion && editing && editing.owner && <QuestionDeletionConfirmation
        usage={editing.usage ?? []}
        onCancel={() => setConfirmingQuestionDeletion(false)}
        onConfirm={async () => {
          await store.whenSettled()
          await bankWorkspaces.permanentlyDeleteQuestion(
            editing.owner!.id,
            editing.question.id,
            (ids) => workspaces.forceDeleteQuestions(ids),
          )
          store.acceptForcedDeletion([editing.question.id])
          clearSelection()
          drag.cancel()
          setBankRevision((revision) => revision + 1)
          setConfirmingQuestionDeletion(false)
          setEditing(null)
        }}
      />}
    </>
  )
}

/**
 * The site's three pages. The editor is the app; About and Privacy are the
 * ordinary pages a public tool is expected to have, reached from the footer.
 */
