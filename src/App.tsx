import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import type { ReactNode } from 'react'
import { SECTION_LABELS, SECTION_ORDER, createQuestion, duplicateQuestion } from './exam'
import type { Question, SectionTarget } from './exam'
import { withPartPoints, withQuestionPoints } from './points'
import { bankQuestionById } from './question-bank'
import { createExamStore, loadExamStore, type ExamStore } from './exam-store'
import { ExamPage } from './exam-page'
import { QuestionBankPane } from './question-bank-pane'
import { NO_FILTER, topicOptions, type QuestionBankFilter } from './question-bank-view'
import { useSelection } from './use-selection'
import { useWorkspaceDrag } from './use-workspace-drag'
import { WorkspaceSplit } from './workspace-split'
import { DEFAULT_EXPORT_CONFIGURATION, PicturesNeededError, prepareExport, prepareHistoricalExport, readExportPreferences, readShufflePreferences, writeExportPreferences, writeShufflePreferences, type ExportConfiguration, type PreparationProgress, type PreparedExport } from './export-preparation'
import { ExportDialog, ReExportDialog } from './export-dialog'
import { DEFAULT_VERSION_COUNT, maxVersionCount, NO_SHUFFLE, seededRandom } from './export-versions'
import { domMeasure, imageSourcesOfDocuments } from './dom-measure'
import { ResolveImagesDialog } from './resolve-images-dialog'
import { storedPicture } from './resolved-pictures'
import { pendingImagesOfQuestions, withStoredPictures, type PendingImageResolution, type StoredPicture } from './pending-images'
import { Check, CircleDot, FileType2, FolderOpen, Heading, Import, History, ListOrdered, Pencil, PictureInPicture2, Plus, Redo2, RefreshCw, Save, SaveAll, Trash2, TriangleAlert, Type as TypeIcon, Undo2, X } from 'lucide-react'
import { ContextMenu, type MenuPoint } from './context-menu'
import { MarginsPanel } from './margins-panel'
import { usePopOver } from './pop-over-context'
import { DEFAULT_HEADING_SIZE, DEFAULT_TEXT_SIZE, HEADING_SIZES, HEADING_SIZE_LABELS, TEXT_SIZES } from './section-headings'
import { DEFAULT_PAPER_STYLE, PAPER_STYLES, PAPER_STYLE_LABELS } from './paper-style'
import { BEFORE_NAVIGATE_EVENT, navigate, replaceRoute, useLocationSearch, useRoute } from './use-route'
import { Footer } from './site-chrome'
import { HomePage } from './home-page'
import { LandingPage, OnboardingPage } from './landing-page'
import { ConvertPage } from './convert-page'
import { hasBeenWelcomed } from './welcomed'
import type { ExamWorkspaceService, QuestionDeletionImpact, QuestionUsage, RecentExam } from './exam-workspaces'
import { type ExamDeletionSummary } from './exam-deletion'
import { type QuestionBankResource, type QuestionBankSummary, type QuestionBankTabsWorkspace, type BankWorkspaceContext, closeBankTab, openBankTab, type QuestionBankWorkspaceService } from './question-bank-workspaces'
import { ExportHistoryDrawer } from './export-history'
import { AppShell } from './app-shell'
import { AboutPage, PrivacyPage } from './site-pages'
import { SettingsPage } from './settings-page'
import { GamePage } from './game-page'
import { GameStudent } from './game-student'
import { useDriveAutoBackup } from './use-drive-autobackup'
import { persistentStorageStatus, requestPersistentStorage, type PersistentStorageStatus } from './durable-storage'
import { ResourceCollectionPage } from './resource-collection-page'
import { BankFileDropTarget } from './bank-file-drop'
import { ImportsPage, WaitingImportPage } from './imports-page'
import { questionBankCollection, type QuestionBankCollectionItem } from './resource-collections'
import { QuestionBankExportDialog } from './question-bank-export-dialog'
import { QuestionBankImportDialog } from './question-bank-import-dialog'
import { MarginsIcon, PaperStylePreview } from './format-icons'
import { pastedSummary, questionsToAdd } from './question-clipboard'
import { countOf, t, useT } from './i18n'
import { QUESTION_TYPE_ICONS } from './question-type-icons'
import { QuestionDialog } from './question-editor'
import { BankDeletionConfirmation, ExamDeletionConfirmation, QuestionDeletionConfirmation } from './confirmations'

/** The mark each Question Section goes by, so a type reads the same wherever
 *  it is named — the picker that chooses one, and the dialog that states it. */
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

/**
 * One line of a question's front matter: an icon and a label on the left, and
 * what has been chosen on the right — or nothing at all, because Difficulty
 * and Topics are both optional and a blank field is the normal state rather
 * than an omission to be nagged about.
 *
 * Choosing opens a list under the field with a box to type in. Typing filters
 * what is on offer and moves the highlight to the best match, so a Topic is
 * reached by typing enough of it and pressing Enter. Filtering never rewrites a
 * value: casing and spelling are the teacher's.
 *
 * A single-select field replaces what is there and closes, and choosing what is
 * already chosen clears it — which is the whole of what a Clear button was for.
 * A multi-select one toggles and stays open, because choosing several is one
 * thought rather than several visits.
 *
 * `onCreate` is what makes the Topic field different from the Difficulty one:
 * Difficulty is a closed set of three, while a Topic that does not exist yet
 * is made by typing it. Writing one is the last row of the list rather than
 * something Enter does behind the highlight's back, so typing "mol" and
 * pressing Enter reaches the "Mole Ratio" that is already there.
 */
function ResourcePicker({
  title,
  closeLabel,
  emptyMessage,
  resources,
  onChoose,
  onClose,
}: {
  title: string
  closeLabel: string
  emptyMessage: string
  resources: readonly { id: string; name: string; questionCount: number }[]
  onChoose: (id: string) => void
  onClose: () => void
}) {
  const titleId = useId()
  const dialog = useRef<HTMLElement>(null)
  const chosen = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
    requestAnimationFrame(() => focusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (controls.length === 0) return
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
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (!chosen.current) {
        requestAnimationFrame(() => { if (previous?.isConnected) previous.focus() })
      }
    }
  }, [])

  return createPortal(<div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section
      ref={dialog}
      className="resource-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="resource-picker-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="question-bank-action" aria-label={closeLabel} onClick={onClose}><X /></button>
      </header>
      {resources.length === 0 ? <p>{emptyMessage}</p> :
        <div className="resource-picker-list">
          {resources.map((resource) => <button key={resource.id} type="button" onClick={() => {
            chosen.current = true
            onChoose(resource.id)
          }}>
            <strong>{resource.name}</strong>
            <span>{resource.questionCount} {resource.questionCount === 1 ? t('editor.question') : t('editor.questions')}</span>
          </button>)}
        </div>}
    </section>
  </div>, document.body)
}

/**
 * One Question Bank, open and editable: its list, its filters, and the dialogs
 * that create, edit, delete and share the Questions in it.
 *
 * It knows nothing about where it is being shown. The Exam editor mounts it in
 * the right-hand pane under a strip of tabs; the Question Bank page mounts one
 * of them full width with no tabs at all. Mount it with `key={bank.id}` — a
 * different bank is a different workspace, and none of the selection or dialog
 * state below should survive the change.
 */
function QuestionBankWorkspace({
  bank,
  layout,
  heading,
  extraActions,
  service,
  filter,
  onFilterChange,
  onBankChange,
  onBankGone,
  workingCopyIds = new Set(),
  drag: providedDrag,
  examsService,
  onAddToExam,
  onAddManyToExam,
  onRemoveFromExam,
  beforeCanonicalQuestionCommit,
  onCanonicalQuestionCommitted,
  onQuestionDeleted,
}: {
  bank: QuestionBankResource
  layout?: 'rows' | 'page'
  /** Handed to the pane's header, where the surface this is mounted on names
   *  the bank and adds the actions that belong to the surface rather than to
   *  the bank. See `QuestionBankPane`. */
  heading?: ReactNode
  extraActions?: ReactNode
  service: QuestionBankWorkspaceService
  filter: QuestionBankFilter
  onFilterChange: (filter: QuestionBankFilter) => void
  onBankChange: (bank: QuestionBankResource) => void
  /** The bank was disposed of by the deletion that emptied it. */
  onBankGone: () => void
  workingCopyIds?: ReadonlySet<string>
  drag?: ReturnType<typeof useWorkspaceDrag>
  examsService?: ExamWorkspaceService
  onAddToExam?: (question: Question) => void
  onAddManyToExam?: (questions: readonly Question[]) => void
  onRemoveFromExam?: (questionId: string) => void
  beforeCanonicalQuestionCommit?: () => Promise<void>
  onCanonicalQuestionCommitted?: (question: Question) => void
  onQuestionDeleted?: (questionId: string) => void
}) {
  const selection = useSelection()
  const [choosingType, setChoosingType] = useState<MenuPoint | null>(null)
  const [editing, setEditing] = useState<Question | null>(null)
  const [usage, setUsage] = useState<QuestionUsage[] | undefined>()
  const [confirmingDeletion, setConfirmingDeletion] = useState(false)
  const [exporting, setExporting] = useState(false)
  const unavailableDrag = useWorkspaceDrag(() => undefined)
  const drag = providedDrag ?? unavailableDrag

  return <>
    <QuestionBankPane
      bank={{ questions: bank.questions }}
      layout={layout}
      heading={heading}
      extraActions={extraActions}
      workingCopyIds={workingCopyIds}
      filter={filter}
      onFilterChange={onFilterChange}
      selectedQuestionIds={selection.selectedIds}
      onSelect={selection.selectOne}
      onClearSelection={selection.clear}
      onSelectAll={selection.selectAll}
      drag={drag}
      onCreate={setChoosingType}
      onExport={() => setExporting(true)}
      exportBlocked={editing !== null}
      onEdit={(questionId) => {
        const question = bank.questions.find((candidate) => candidate.id === questionId)
        if (!question) return
        if (!examsService) {
          setEditing(question)
          setUsage(undefined)
          return
        }
        void examsService.questionUsage(questionId).then((questionUsage) => {
          setEditing(question)
          setUsage(questionUsage)
        })
      }}
      onAddToWorkingCopy={onAddToExam
        ? (questionId) => {
            const question = bank.questions.find(({ id }) => id === questionId)
            if (question) onAddToExam(question)
          }
        : undefined}
      onAddManyToWorkingCopy={onAddManyToExam
        ? (questionIds) => {
            const questions = questionIds.flatMap((id) => {
              const question = bank.questions.find((candidate) => candidate.id === id)
              return question ? [question] : []
            })
            onAddManyToExam(questions)
          }
        : undefined}
      onRemoveFromWorkingCopy={onRemoveFromExam}
      onPasteQuestions={(questionIds) => void (async () => {
        // A paste into a bank makes new Questions like the copied ones, as
        // Duplicate does — into their own bank or any other — and selects
        // them. Copies of Questions this browser no longer holds are skipped.
        const located = await service.locateQuestions(questionIds)
        if (located.length === 0) return
        const copies = located.map(({ question }) => duplicateQuestion(question))
        onBankChange(await service.commit(bank.id, { kind: 'create-questions', questions: copies }))
        selection.selectAll(copies.map(({ id }) => id))
      })()}
    />
    {exporting && <QuestionBankExportDialog bank={bank} onClose={() => setExporting(false)} />}
    {choosingType && <ContextMenu
      point={choosingType}
      ariaLabel={t('editor.questionType')}
      items={SECTION_ORDER.map((type) => ({
        kind: 'action' as const,
        label: SECTION_LABELS[type],
        icon: QUESTION_TYPE_ICONS[type],
        onSelect: () => {
          setEditing(createQuestion(type))
          setUsage(undefined)
        },
      }))}
      onClose={() => setChoosingType(null)}
    />}
    {editing && <QuestionDialog
      question={editing}
      isNew={!bank.questions.some((question) => question.id === editing.id)}
      topicSuggestions={topicOptions({ questions: bank.questions })}
      ownerName={bank.name}
      onCancel={() => setEditing(null)}
      onDelete={bank.questions.some(({ id }) => id === editing.id) ? () => setConfirmingDeletion(true) : undefined}
      onSave={async (question) => {
        const existing = bank.questions.some((candidate) => candidate.id === question.id)
        if (existing) await beforeCanonicalQuestionCommit?.()
        const updated = existing && examsService
          ? await service.commitCanonicalQuestion(
              bank.id,
              question,
              (canonical) => examsService.propagateCanonicalQuestion(canonical),
            )
          : await service.commit(bank.id, {
              kind: existing ? 'update-question' : 'create-question',
              question,
            })
        onBankChange(updated)
        if (existing) onCanonicalQuestionCommitted?.(question)
        setEditing(null)
      }}
    />}
    {confirmingDeletion && editing && <QuestionDeletionConfirmation
      usage={usage ?? []}
      onCancel={() => setConfirmingDeletion(false)}
      onConfirm={async () => {
        await beforeCanonicalQuestionCommit?.()
        const updated = await service.permanentlyDeleteQuestion(
          bank.id,
          editing.id,
          (ids) => examsService?.forceDeleteQuestions(ids) ?? Promise.resolve({ rollback: async () => undefined, finalize: async () => undefined }),
        )
        if (updated) onBankChange(updated)
        else onBankGone()
        onQuestionDeleted?.(editing.id)
        selection.clear()
        drag.cancel()
        setConfirmingDeletion(false)
        setEditing(null)
      }}
    />}
  </>
}

function QuestionBankTabsPane({
  context,
  service,
  onImportBank,
  workingCopyIds = new Set(),
  onQuestionsChange,
  onAddToExam,
  onAddManyToExam,
  onRemoveFromExam,
  workspaceDrag,
  resourceRevision = 0,
  examsService,
  beforeCanonicalQuestionCommit,
  onCanonicalQuestionCommitted,
  onQuestionDeleted,
}: {
  context: BankWorkspaceContext
  service: QuestionBankWorkspaceService
  /** Opens the import dialog — with a file, when one was dropped on the empty
   *  pane that the page-wide drop target did not claim. */
  onImportBank?: (file?: File) => void
  workingCopyIds?: ReadonlySet<string>
  onQuestionsChange?: (questions: readonly Question[]) => void
  onAddToExam?: (question: Question) => void
  onAddManyToExam?: (questions: readonly Question[]) => void
  onRemoveFromExam?: (questionId: string) => void
  workspaceDrag?: ReturnType<typeof useWorkspaceDrag>
  resourceRevision?: number
  examsService?: ExamWorkspaceService
  beforeCanonicalQuestionCommit?: () => Promise<void>
  onCanonicalQuestionCommitted?: (question: Question) => void
  onQuestionDeleted?: (questionId: string) => void
}) {
  const t = useT()
  const stableContext = useMemo<BankWorkspaceContext>(
    () => ({ examId: context.examId }),
    [context.examId],
  )
  const [workspace, setWorkspace] = useState<QuestionBankTabsWorkspace>(() => ({
    openBankIds: [],
    activeBankId: null,
    filters: {},
    pane: { bankPercent: 33 },
  }))
  const [resources, setResources] = useState<Record<string, QuestionBankResource>>({})
  const [pickerBanks, setPickerBanks] = useState<QuestionBankSummary[] | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [creatingBank, setCreatingBank] = useState(false)
  const [fileOver, setFileOver] = useState(false)

  useEffect(() => {
    let current = true
    void (async () => {
      const saved = await service.workspace(stableContext)
      const loaded = await Promise.all(saved.openBankIds.map((id) => service.read(id)))
      if (!current) return
      const valid = loaded.filter((bank): bank is QuestionBankResource => bank !== null)
      const validIds = valid.map((bank) => bank.id)
      const sanitized = validIds.length === saved.openBankIds.length ? saved : {
        ...saved,
        openBankIds: validIds,
        activeBankId: validIds.includes(saved.activeBankId ?? '')
          ? saved.activeBankId
          : validIds[0] ?? null,
        filters: Object.fromEntries(validIds.map((id) => [id, saved.filters[id] ?? NO_FILTER])),
      }
      setResources(Object.fromEntries(valid.map((bank) => [bank.id, bank])))
      setWorkspace(sanitized)
      if (sanitized !== saved) {
        setMessage(t('bank.unavailableInWorkspace'))
        await service.saveWorkspace(stableContext, sanitized)
      }
      setHydrated(true)
    })()
    return () => { current = false }
  }, [resourceRevision, service, stableContext, t])

  const active = workspace.activeBankId ? resources[workspace.activeBankId] : undefined
  useEffect(() => {
    if (hydrated) onQuestionsChange?.(
      Object.values(resources).flatMap((resource) => resource.questions),
    )
  }, [hydrated, onQuestionsChange, resources])
  const filter = active ? workspace.filters[active.id] ?? NO_FILTER : NO_FILTER
  const updateResource = (resource: QuestionBankResource) => {
    setResources((current) => ({ ...current, [resource.id]: resource }))
  }
  const openPicker = async () => setPickerBanks(await service.recent())
  const createBank = async () => {
    setCreatingBank(true)
    setMessage(null)
    try {
      const bank = await service.create()
      const opened = await service.openTab(stableContext, bank.id)
      if (!opened) throw new Error(t('bank.openFailed'))
      setWorkspace(opened.workspace)
      updateResource(opened.bank)
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role="tab"][data-bank-id="${CSS.escape(bank.id)}"]`)?.focus())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('bank.createFailed'))
    } finally {
      setCreatingBank(false)
    }
  }
  const chooseBank = async (id: string) => {
    const opened = await service.openTab(stableContext, id)
    if (!opened) {
      setMessage(t('errors.bankUnavailable'))
      setPickerBanks(null)
      return
    }
    setWorkspace(opened.workspace)
    updateResource(opened.bank)
    setPickerBanks(null)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role="tab"][data-bank-id="${CSS.escape(id)}"]`)?.focus())
  }
  const activate = async (id: string) => {
    const previousActiveBankId = workspace.activeBankId
    setWorkspace((current) => openBankTab(current, id))
    const opened = await service.openTab(stableContext, id)
    if (!opened) {
      setWorkspace((current) => current.activeBankId === id
        ? { ...current, activeBankId: previousActiveBankId }
        : current)
      setMessage(t('errors.bankUnavailable'))
      return
    }
    // The durable response can finish after the teacher has changed this or
    // another tab's filters. Keep the newer in-memory workspace instead of
    // replacing it with the response's earlier snapshot.
    updateResource(opened.bank)
  }
  const close = async (id: string) => {
    const next = closeBankTab(workspace, id)
    setWorkspace((current) => closeBankTab(current, id))
    setResources((current) => {
      const remaining = { ...current }
      delete remaining[id]
      return remaining
    })
    await service.closeTab(stableContext, id)
    requestAnimationFrame(() => {
      const target = next.activeBankId
        ? document.querySelector<HTMLElement>(`[role="tab"][data-bank-id="${CSS.escape(next.activeBankId)}"]`)
        : document.querySelector<HTMLElement>(`[aria-label="${t('bank.open')}"]`)
      target?.focus()
    })
  }

  return <div
    className="bank-tabs-pane"
    // A file dropped here adds into the bank on show.
    data-import-bank-id={active?.id}
    data-import-bank-name={active?.name}
  >
    {message && <p className="home-error bank-tabs-error" role="alert">{message}</p>}
    <div className="bank-tabs-bar">
      <div className="bank-tabs" role="tablist" aria-label={t('bank.openList')}>
        {workspace.openBankIds.map((id, index) => {
          const bank = resources[id]
          if (!bank) return null
          return <div className="bank-tab" key={id} data-active={id === workspace.activeBankId ? 'true' : undefined}>
            <button
              type="button"
              role="tab"
              data-bank-id={id}
              aria-selected={id === workspace.activeBankId}
              tabIndex={id === workspace.activeBankId ? 0 : -1}
              onClick={() => void activate(id)}
              // A double-click opens the bank's own page. The editor is left
              // by loading a document, so the browser's leave-page guard still
              // stands between the teacher and an unsaved Working Copy.
              onDoubleClick={() => window.location.assign(`/question-bank?id=${encodeURIComponent(id)}`)}
              title={t('bank.openPage')}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                let next = index
                if (event.key === 'ArrowLeft') next = (index - 1 + workspace.openBankIds.length) % workspace.openBankIds.length
                if (event.key === 'ArrowRight') next = (index + 1) % workspace.openBankIds.length
                if (event.key === 'Home') next = 0
                if (event.key === 'End') next = workspace.openBankIds.length - 1
                const nextId = workspace.openBankIds[next]!
                void activate(nextId).then(() => requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>(`[role="tab"][data-bank-id="${CSS.escape(nextId)}"]`)?.focus(),
                ))
              }}
            >{bank.name}</button>
            <button
              type="button"
              aria-label={t('ui.closeName', { name: bank.name })}
              onClick={() => void close(id)}
            ><X /></button>
          </div>
        })}
      </div>
      {/* Where Chrome keeps it: a plus at the end of the strip, next to the
          tab that was opened last. With no tabs, the empty state below offers
          the same action with a full label instead. */}
      {workspace.openBankIds.length > 0 && <button
        type="button"
        className="open-bank-button"
        aria-label={t('bank.open')}
        title={t('bank.open')}
        disabled={!hydrated}
        onClick={() => void openPicker()}
      ><Plus /></button>}
    </div>
    {active ? <QuestionBankWorkspace
      key={active.id}
      bank={active}
      service={service}
      filter={filter}
      onFilterChange={(nextFilter) => {
        setWorkspace((current) => ({ ...current, filters: { ...current.filters, [active.id]: nextFilter } }))
        void service.updateFilter(stableContext, active.id, nextFilter)
      }}
      onBankChange={updateResource}
      onBankGone={() => void close(active.id)}
      workingCopyIds={workingCopyIds}
      drag={workspaceDrag}
      examsService={examsService}
      onAddToExam={onAddToExam}
      onAddManyToExam={onAddManyToExam}
      onRemoveFromExam={onRemoveFromExam}
      beforeCanonicalQuestionCommit={beforeCanonicalQuestionCommit}
      onCanonicalQuestionCommitted={onCanonicalQuestionCommitted}
      onQuestionDeleted={onQuestionDeleted}
    /> : <div
      className="question-bank question-bank-no-tab"
      data-over={fileOver ? 'true' : undefined}
      onDragOver={(event) => {
        // A Question Bank file is claimed by the page-wide drop target before
        // it gets here. Anything else the pointer is carrying — a screenshot,
        // a scan — is taken by the pane so it can be told apart from an
        // import and answered with the way to convert it.
        if (!onImportBank || !Array.from(event.dataTransfer.types).includes(t('bank.files'))) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setFileOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false)
      }}
      onDrop={(event) => {
        if (!onImportBank) return
        event.preventDefault()
        setFileOver(false)
        const file = event.dataTransfer.files[0]
        if (file) onImportBank(file)
      }}
    >
      {/* The same chrome as an open bank, so the pane keeps its name while it
          is empty. What follows is the editor's Get Started page: the three
          ways a bank gets here, in the order they are reached for, on the
          dotted ground Home uses for a space a card has not been put in yet.
          The whole pane is also the drop target for a file. */}
      <div className="question-bank-toolbar">
        <header className="question-bank-header"><h2>{t('bank.title')}</h2></header>
      </div>
      <div className="bank-get-started">
        <p className="bank-get-started-title">{t('bank.getStarted')}</p>
        <div className="bank-get-started-actions">
          <button
            type="button"
            disabled={!hydrated || creatingBank}
            onClick={() => void openPicker()}
          >
            <FolderOpen aria-hidden="true" />
            <span>{t('bank.open')}</span>
          </button>
          <button
            type="button"
            disabled={!hydrated || creatingBank}
            onClick={() => void createBank()}
          >
            <Plus aria-hidden="true" />
            <span>{creatingBank ? t('common.creating') : t('bank.newTitle')}</span>
          </button>
          {onImportBank && <button
            type="button"
            disabled={!hydrated || creatingBank}
            onClick={() => onImportBank()}
          >
            <Import aria-hidden="true" />
            <span>{t('bank.import')}</span>
          </button>}
        </div>
        <p className="bank-get-started-hint">{t('bank.dropFile')}</p>
      </div>
    </div>}
    {pickerBanks && <ResourcePicker
      title={t('bank.open')}
      closeLabel={t('bank.closePicker')}
      emptyMessage={t('bank.noneAvailable')}
      resources={pickerBanks}
      onChoose={(id) => void chooseBank(id)}
      onClose={() => setPickerBanks(null)}
    />}
  </div>
}


/** The line under a bank's name: how many Questions it holds and whatever it
 *  declares about itself. A detail nobody entered is left out, not blanked. */
function BankPageFacts({
  bank,
  picturesNeeded = 0,
  onResolvePictures,
}: {
  bank: QuestionBankResource
  /** Pending Images still in the bank, offered to resolve in one sitting. */
  picturesNeeded?: number
  onResolvePictures?: () => void
}) {
  const count = bank.questions.length
  const facts: ReactNode[] = [countOf(count, 'question')]
  if (picturesNeeded > 0) {
    facts.push(<button type="button" className="link-button bank-page-pictures-needed" aria-haspopup="dialog" onClick={onResolvePictures}>
      {t('ui.picturesNeeded', { what: countOf(picturesNeeded, 'picture') })}
    </button>)
  }
  if (bank.author?.trim()) facts.push(t('bank.by', { name: bank.author.trim() }))
  if (bank.license?.name.trim()) {
    facts.push(bank.license.url
      ? <a href={bank.license.url} target="_blank" rel="noreferrer">{bank.license.name}</a>
      : bank.license.name)
  }
  return <div className="bank-page-facts">
    <p>
      {facts.map((fact, index) => <span key={index}>{fact}</span>)}
    </p>
    {bank.description?.trim() && <p className="bank-page-description">{bank.description.trim()}</p>}
  </div>
}

/**
 * The Question Bank page: one bank, full screen, in the same chrome as Home
 * and the collections.
 *
 * Opening a Question Bank is not opening the editor. The editor edits an Exam;
 * a bank is a place you go to write and organise Questions, reached by its own
 * breadcrumb trail and leaving no Exam behind it. Double-clicking a Question
 * here opens the same Question editor the Exam editor's pane opens.
 */
function QuestionBankPage({
  bank: initialBank,
  bankWorkspaces,
  workspaces,
  persistentStorage,
  launchError,
  onImportInto,
  onPlay,
  onFlashcards,
}: {
  bank: QuestionBankResource
  bankWorkspaces: QuestionBankWorkspaceService
  workspaces: ExamWorkspaceService
  persistentStorage: PersistentStorageStatus
  launchError: string | null
  /** Opens the import dialog with every bank in the file defaulting to
   *  adding into this one. */
  onImportInto: (bankId: string) => void
  /** Elindítja a kvízjátékot ezzel a bankkal. */
  onPlay: () => void
  /** Ugyanez tanulókártya-módban. */
  onFlashcards: () => void
}) {
  const t = useT()
  const [bank, setBank] = useState(initialBank)
  const popOver = usePopOver()
  const [name, setName] = useState(initialBank.name)
  const [filter, setFilter] = useState<QuestionBankFilter>(NO_FILTER)
  const [nameError, setNameError] = useState<string | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [details, setDetails] = useState({
    description: initialBank.description ?? '',
    author: initialBank.author ?? '',
    licenseName: initialBank.license?.name ?? '',
    licenseUrl: initialBank.license?.url ?? '',
  })
  const [detailsBusy, setDetailsBusy] = useState(false)
  const [resolvingPictures, setResolvingPictures] = useState(false)
  const pendingPictures = useMemo(() => pendingImagesOfQuestions(bank.questions), [bank.questions])
  const resolvePictures = async (pictures: PendingImageResolution) => {
    const sources = new Map<string, StoredPicture>()
    for (const [key, picture] of pictures) {
      sources.set(key, { src: await storedPicture(picture.asset), ...(picture.authoredSize !== undefined ? { size: picture.authoredSize } : {}) })
    }
    let updated = bank
    for (const question of bank.questions) {
      const resolved = withStoredPictures(question, sources)
      if (JSON.stringify(resolved) === JSON.stringify(question)) continue
      updated = await bankWorkspaces.commit(bank.id, { kind: 'update-question', question: resolved })
    }
    setBank(updated)
    setResolvingPictures(false)
  }
  const [importAnnouncement] = useState(() => {
    const message = window.sessionStorage.getItem('test-parrot-import-announcement')
    window.sessionStorage.removeItem('test-parrot-import-announcement')
    return message
  })

  useEffect(() => setName(bank.name), [bank.name])

  const commitName = async () => {
    if (name === bank.name) return
    setNameError(null)
    try {
      setBank(await bankWorkspaces.commit(bank.id, { kind: 'rename', name }))
    } catch (error) {
      setNameError(error instanceof Error ? error.message : t('bank.nameSaveFailed'))
    }
  }

  return <AppShell
    crumbs={[
      { label: t('nav.home'), href: '/' },
      { label: t('shell.questionBanks'), href: '/question-banks' },
      { label: bank.name },
    ]}
    persistentStorage={persistentStorage}
    actions={
      <span className="bank-page-actions">
        <button type="button" className="primary-button" onClick={onPlay}>
          {t('bank.play')}
        </button>
        <button type="button" className="secondary-button" onClick={onFlashcards}>
          {t('bank.flashcards')}
        </button>
        <span className="bank-save-status">{t('bank.savesImmediately')}</span>
      </span>
    }
  >
    {launchError && <p className="home-error" role="alert">{launchError}</p>}
    {importAnnouncement && <p className="sr-only" role="status" aria-live="polite">{importAnnouncement}</p>}
    {/* A file dropped anywhere on the page adds into this bank. */}
    <div className="bank-page" data-import-bank-id={bank.id} data-import-bank-name={bank.name}>
      <QuestionBankWorkspace
        key={bank.id}
        bank={bank}
        layout="page"
        // The bank's name is the page's title, so it is what the pane's header
        // row is built around. What the bank says about itself — who wrote it,
        // under what license — reads on the line beneath, and the pencil beside
        // the name is the one way into changing any of it.
        heading={<div className="bank-page-heading">
          <div className="bank-page-title-row">
            <input
              aria-label={t('bank.name')}
              className="bank-page-title"
              value={name}
              size={Math.max(name.length, 8)}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <button
              type="button"
              className="toolbar-icon-button bank-page-details-button"
              aria-label={t('bank.editDetails')}
              title={t('bank.editDetailsShort')}
              aria-haspopup="dialog"
              onClick={() => setEditingDetails(true)}
            >
              <Pencil aria-hidden="true" />
            </button>
          </div>
          <BankPageFacts
            bank={bank}
            picturesNeeded={pendingPictures.length}
            onResolvePictures={() => setResolvingPictures(true)}
          />
          {nameError && <p className="home-error bank-name-error" role="alert">{nameError}</p>}
        </div>}
        extraActions={<>
          {popOver.supported && <button
            type="button"
            className="secondary-button"
            title={t('bank.keepOnTop')}
            onClick={() => popOver.open(bank.id)}
          >
            <PictureInPicture2 aria-hidden="true" />
            {t('bank.popOver')}
          </button>}
          <button type="button" className="secondary-button" aria-haspopup="dialog" onClick={() => onImportInto(bank.id)}>
            <Import aria-hidden="true" />
            {t('bank.import')}
          </button>
        </>}
        service={bankWorkspaces}
        filter={filter}
        onFilterChange={setFilter}
        onBankChange={setBank}
        onBankGone={() => navigate('/question-banks')}
        examsService={workspaces}
      />
    </div>
    {resolvingPictures && <ResolveImagesDialog
      occurrences={pendingPictures}
      onClose={() => setResolvingPictures(false)}
      onResolve={resolvePictures}
    />}
    {editingDetails && <div className="dialog-backdrop" role="presentation">
      <section className="question-bank-details-dialog" role="dialog" aria-modal="true" aria-labelledby="bank-details-title">
        <h2 id="bank-details-title">{t('bank.detailsTitle')}</h2>
        <p>{t('bank.detailsHint')}</p>
        <label>{t('bank.description')}<textarea value={details.description} disabled={detailsBusy} onChange={(event) => setDetails({ ...details, description: event.target.value })} /></label>
        <label>{t('bank.declaredAuthor')}<input value={details.author} disabled={detailsBusy} onChange={(event) => setDetails({ ...details, author: event.target.value })} /></label>
        <label>{t('bank.licenseName')}<input value={details.licenseName} disabled={detailsBusy} onChange={(event) => setDetails({ ...details, licenseName: event.target.value })} /></label>
        <label>{t('bank.licenseUrl')}<input type="url" value={details.licenseUrl} disabled={detailsBusy} onChange={(event) => setDetails({ ...details, licenseUrl: event.target.value })} /></label>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={detailsBusy} onClick={() => setEditingDetails(false)}>{t('common.cancel')}</button>
          <button type="button" className="primary-button" disabled={detailsBusy} onClick={() => {
            setDetailsBusy(true)
            setNameError(null)
            void bankWorkspaces.commit(bank.id, {
              kind: 'update-provenance',
              provenance: {
                description: details.description,
                author: details.author,
                ...(details.licenseName.trim() ? { license: { name: details.licenseName, ...(details.licenseUrl.trim() ? { url: details.licenseUrl } : {}) } } : {}),
              },
            }).then((updated) => {
              setBank(updated)
              setEditingDetails(false)
            }).catch((error: unknown) => {
              setNameError(error instanceof Error ? error.message : t('bank.detailsSaveFailed'))
            }).finally(() => setDetailsBusy(false))
          }}>{detailsBusy ? t('common.saving') : t('bank.saveDetails')}</button>
        </div>
      </section>
    </div>}
  </AppShell>
}


/** What the Working Copy's state is, in a slot that never changes size.
 *  A function, not a constant: a module-level `t()` would freeze the language
 *  the app was loaded in and never follow a switch. */
const workingCopyStates = () => ({
  pending: { Icon: RefreshCw, label: t('status.backingUp'), detail: t('status.writingDetail') },
  failed: { Icon: TriangleAlert, label: t('status.backupFailed'), detail: t('status.backupFailedDetail') },
  dirty: { Icon: CircleDot, label: t('status.dirtyLabel'), detail: t('status.dirtyDetail') },
  saved: { Icon: Check, label: t('status.saved'), detail: t('status.savedDetail') },
} as const)

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

function ExamEditor({
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
export default function App({
  store,
  bank,
  workspaces,
  bankWorkspaces,
  initialExams,
  initialBankCollection,
  persistentStorage,
  initialEditorId,
  initialError,
}: {
  store: ExamStore | null
  /** The Question Bank the `/question-bank` route was entered for. */
  bank: QuestionBankResource | null
  workspaces: ExamWorkspaceService
  bankWorkspaces: QuestionBankWorkspaceService
  initialExams: readonly RecentExam[]
  initialBankCollection: readonly QuestionBankCollectionItem[]
  persistentStorage: PersistentStorageStatus
  initialEditorId: string | null
  initialError: string | null
}) {
  // A Drive-mentés a megnyitáskor: ha a tanár csatlakoztatta, és letelt a nap,
  // magától felmegy a csomag (a Google-munkamenet él, ha lehet).
  useDriveAutoBackup()
  const route = useRoute()
  const search = useLocationSearch()
  const [exams, setExams] = useState(initialExams)
  /** The bank the Question Bank page is showing and the address it was read
   *  for — at start by `main.tsx`, and after that on every arrival, so a bank
   *  edited elsewhere since is never shown as it was. */
  const [pageBank, setPageBank] = useState(() => bank ? { bank, search: window.location.search } : null)
  const [bankCollection, setBankCollection] = useState(initialBankCollection)
  const [storageStatus, setStorageStatus] = useState(persistentStorage)
  const [editorStore, setEditorStore] = useState(store)
  const [editorId, setEditorId] = useState(initialEditorId)
  const [deletingBank, setDeletingBank] = useState<{ bank: QuestionBankCollectionItem; impact: QuestionDeletionImpact[] } | null>(null)
  const [deletingExam, setDeletingExam] = useState<ExamDeletionSummary | null>(null)
  const [exportingBank, setExportingBank] = useState<QuestionBankResource | null>(null)
  const [inspectingBankFile, setInspectingBankFile] = useState(false)
  const [droppedBankFile, setDroppedBankFile] = useState<File | null>(null)
  /** A proposal handed to the dialog ready-made: a Kahoot link already read. */
  const [importProposal, setImportProposal] = useState<import('./package-import').ImportProposal | null>(null)
  const [convertDrop, setConvertDrop] = useState<{ file: File; id: number } | null>(null)
  const [homeError, setHomeError] = useState(initialError)
  const [bankLibraryRevision, setBankLibraryRevision] = useState(0)
  const [importTargetBankId, setImportTargetBankId] = useState<string | null>(null)
  /** The waiting import the dialog finishes, when it was opened on one. */
  const [importWaitingId, setImportWaitingId] = useState<string | null>(null)
  /** Bumped whenever an import may have finished, for the Imports pages. */
  const [importRevision, setImportRevision] = useState(0)
  /** A Kahoot link read into questions: the dialog shows it as a file's reading. */
  const openImportWithProposal = useCallback((proposal: import('./package-import').ImportProposal) => {
    setImportProposal(proposal)
    setDroppedBankFile(null)
    setImportTargetBankId(null)
    setImportWaitingId(null)
    setInspectingBankFile(true)
  }, [])
  const openImport = useCallback((file?: File | null, targetBankId?: string | null, waitingImportId?: string | null) => {
    setDroppedBankFile(file ?? null)
    setImportTargetBankId(targetBankId ?? null)
    setImportWaitingId(waitingImportId ?? null)
    setInspectingBankFile(true)
  }, [])
  // Starting an import used to be a page of its own; it is the Import
  // dialog now, so an old link to that page opens the dialog over Imports.
  useEffect(() => {
    if (route !== '/imports/new') return
    navigate('/imports', { replace: true })
    openImport()
  }, [route, openImport])
  /** A file dropped while the Import dialog is open belongs to it — an
   *  assistant's corrected file replaces the one under review — rather than
   *  starting the dialog over. */
  const [dialogDrop, setDialogDrop] = useState<{ file: File; id: number } | null>(null)
  const dropping = (elsewhere: (file: File, targetBankId?: string) => void) =>
    (file: File, targetBankId?: string) =>
      inspectingBankFile ? setDialogDrop({ file, id: Date.now() }) : elsewhere(file, targetBankId)
  const closeImport = useCallback(() => {
    setInspectingBankFile(false)
    setDroppedBankFile(null)
    setImportTargetBankId(null)
    setImportWaitingId(null)
    setImportRevision((revision) => revision + 1)
  }, [])
  const loadImportBanks = useCallback(
    async () => (await bankWorkspaces.recent()).map(({ id, name }) => ({ id, name })),
    [bankWorkspaces],
  )
  const importBank = useCallback(async (
    proposal: import('./package-import').ImportProposal,
    selection: import('./import-selection').ImportSelection,
    options: {
      resolution: import('./pending-images').PendingImageResolution
      history: { fileName: string; kind: import('./import-history').ImportFileKind; waitingImportId?: string }
    },
  ) => {
    const result = await bankWorkspaces.commitImport(proposal, selection, {
      ...options,
      bankAnswerWidth: domMeasure.bankAnswerWidth,
    })
    // One Exam is what a converted test is: it opens in the editor with the
    // banks it was built from as its tabs, from onboarding as from anywhere.
    const [onlyExam, ...otherExams] = result.createdExamIds
    if (onlyExam && otherExams.length === 0) {
      window.location.assign(`/editor?exam=${onlyExam}`)
      return
    }
    if (onlyExam) {
      window.location.assign('/exams')
      return
    }
    const bankIds = [...result.createdBankIds, ...result.updatedBankIds]
    const [firstBankId] = bankIds
    if (!firstBankId) return
    // From inside the editor, the imported banks are wanted where the teacher
    // is: as tabs of this Exam's bank pane, with the Exam untouched.
    // Everywhere else they open on their own page.
    if (route === '/editor' && editorId) {
      for (const bankId of bankIds) await bankWorkspaces.openTab({ examId: editorId }, bankId)
      await bankWorkspaces.openTab({ examId: editorId }, firstBankId)
      closeImport()
      setBankLibraryRevision((revision) => revision + 1)
      return
    }
    // From onboarding, banks were imported in order to write an Exam from
    // them: a fresh Exam opens with them as its pane's tabs.
    if (route.startsWith('/get-started')) {
      const exam = await workspaces.create()
      for (const bankId of bankIds) await bankWorkspaces.openTab({ examId: exam.id }, bankId)
      window.location.assign(`/editor?exam=${exam.id}`)
      return
    }
    const first = await bankWorkspaces.read(firstBankId)
    const questions = countOf(result.questionCount, 'question')
    window.sessionStorage.setItem(
      'test-parrot-import-announcement',
      bankIds.length > 1
        ? t('bank.importedMany', { what: questions, banks: countOf(bankIds.length, 'bank') })
        : t('bank.importedOne', { what: questions, name: first?.name ?? t('bank.title') }),
    )
    window.location.assign(`/question-bank?id=${firstBankId}`)
  }, [bankWorkspaces, closeImport, editorId, route, workspaces])
  const picturesNeededIn = useCallback(async (bankIds: readonly string[]) => {
    const banks = await Promise.all(bankIds.map((id) => bankWorkspaces.read(id)))
    return banks.reduce((total, bank) => total + (bank ? pendingImagesOfQuestions(bank.questions).length : 0), 0)
  }, [bankWorkspaces])
  const requestBankDeletion = useCallback((bank: QuestionBankCollectionItem) => {
    void bankWorkspaces.read(bank.id).then(async (resource) => {
      const impact = await workspaces.deletionImpact(resource?.questions.map(({ id }) => id) ?? [])
      setDeletingBank({ bank, impact })
    })
  }, [bankWorkspaces, workspaces])
  const requestBankExport = useCallback((bank: QuestionBankCollectionItem) => {
    void bankWorkspaces.read(bank.id).then((resource) => {
      if (resource) setExportingBank(resource)
    })
  }, [bankWorkspaces])
  const bankExportDialog = exportingBank && <QuestionBankExportDialog
    bank={exportingBank}
    onClose={() => setExportingBank(null)}
  />
  const bankDeletionConfirmation = deletingBank && <BankDeletionConfirmation
    bank={deletingBank.bank}
    impact={deletingBank.impact}
    onCancel={() => setDeletingBank(null)}
    onConfirm={async () => {
      const bank = await bankWorkspaces.read(deletingBank.bank.id)
      if (!bank) throw new Error(t('errors.bankUnavailable'))
      await bankWorkspaces.permanentlyDeleteBank(bank.id, (ids) => workspaces.forceDeleteQuestions(ids))
      setBankCollection((current) => current.filter(({ id }) => id !== bank.id))
      setExams(await workspaces.recent())
      setDeletingBank(null)
    }}
  />
  // The editor names its Exam by what its title field says now, which may be
  // ahead of the last backup.
  const requestExamDeletion = useCallback((id: string, title?: string) => {
    void workspaces.deletionSummary(id).then((summary) => {
      if (summary) setDeletingExam(title === undefined ? summary : { ...summary, title })
    })
  }, [workspaces])
  const examDeletionConfirmation = deletingExam && <ExamDeletionConfirmation
    summary={deletingExam}
    onCancel={() => setDeletingExam(null)}
    onConfirm={async () => {
      const { examId } = deletingExam
      const open = examId === editorId
      // A backup still on its way must land before the database goes, not
      // after, where it would find the Exam gone.
      if (open && editorStore) await editorStore.whenSettled().catch(() => undefined)
      await workspaces.deleteExam(examId)
      // An Exam deleted from its own editor leaves it for Home.
      if (open) {
        window.location.assign('/')
        return
      }
      setDeletingExam(null)
      const [recent, recentBanks] = await Promise.all([workspaces.recent(), bankWorkspaces.recent()])
      setExams(recent)
      // Its banks are used in one Exam fewer.
      setBankCollection(await questionBankCollection(recentBanks, bankWorkspaces, workspaces))
    }}
  />
  const saveAs = useCallback(async () => {
    if (!editorStore) return
    const sourceId = await workspaces.activeId()
    if (!sourceId) throw new Error(t('exam.sourceUnavailable'))
    let targetId: string | null = null
    const session = await editorStore.saveAs(async (snapshot) => {
      targetId = (await workspaces.saveAs(sourceId, snapshot)).id
    })
    if (!targetId) throw new Error(t('exam.copyUnavailable'))
    const target = session.initial
    const saved = {
      questionBank: target.questionBank,
      workingCopy: target.workingCopy,
    }
    setEditorStore(createExamStore({
      backend: workspaces.backendFor(targetId),
      saved,
      initial: target,
      initialHistory: session.history,
      bankAnswerWidth: domMeasure.bankAnswerWidth,
    }))
    setEditorId(targetId)
  }, [editorStore, workspaces])
  // Home and both collections read the account afresh each time they are
  // shown: moving between them and a Question Bank page loads no document, so
  // what they were handed at start is out of date once a bank is edited. Only
  // Home sweeps away untouched placeholders, as it always has; reading is all
  // the collections do.
  useEffect(() => {
    if (route !== '/' && route !== '/exams' && route !== '/question-banks') return
    let current = true
    void (async () => {
      if (route === '/') {
        await workspaces.cleanupPristine({ includeActive: true })
        await bankWorkspaces.cleanupPristine({ includeActive: true })
      }
      const [recent, recentBanks] = await Promise.all([
        workspaces.recent(),
        bankWorkspaces.recent(),
      ])
      const [collection, currentStorageStatus] = await Promise.all([
        questionBankCollection(recentBanks, bankWorkspaces, workspaces),
        persistentStorageStatus(),
      ])
      if (current) {
        setExams(recent)
        setBankCollection(collection)
        setStorageStatus(currentStorageStatus)
      }
    })()
    return () => { current = false }
  }, [route, workspaces, bankWorkspaces])
  // The editor is entered and left by loading a document, as `main.tsx`
  // expects: it reads the Exam from storage afresh, and the browser's own
  // leave-page guard stands between the teacher and an unsaved Working Copy.
  // The Question Bank Pop-over closes with that load (ADR-0030).
  const openExam = (id: string) => window.location.assign(`/editor?exam=${id}`)
  const openBank = useCallback((id: string) => navigate(`/question-bank?id=${id}`), [])
  const newExam = () => { void workspaces.create().then((exam) => openExam(exam.id)) }
  const newBank = () => { void bankWorkspaces.create().then((bank) => openBank(bank.id)) }
  const onBankPage = route === '/question-bank'
  const pageBankReady = onBankPage && pageBank?.search === search
  useEffect(() => {
    if (!onBankPage) {
      setPageBank(null)
      return
    }
    if (pageBankReady) return
    const id = new URLSearchParams(search).get('id')
    let current = true
    void (id ? bankWorkspaces.open(id) : Promise.resolve(null)).then((opened) => {
      if (!current) return
      if (opened) {
        setPageBank({ bank: opened, search })
        return
      }
      setHomeError(t('errors.bankUnavailable'))
      replaceRoute('/question-banks')
    })
    return () => { current = false }
  }, [bankWorkspaces, onBankPage, pageBankReady, search])
  const importDialog = inspectingBankFile && <QuestionBankImportDialog
    key={`${droppedBankFile ? `${droppedBankFile.name}:${droppedBankFile.lastModified}` : 'chosen'}:${importTargetBankId ?? ''}:${importWaitingId ?? ''}`}
    initialFile={droppedBankFile ?? undefined}
    initialProposal={importProposal ?? undefined}
    targetBankId={importTargetBankId ?? undefined}
    waitingImportId={importWaitingId ?? undefined}
    dropped={dialogDrop ?? undefined}
    loadBanks={loadImportBanks}
    onClose={closeImport}
    onImport={importBank}
    onConverting={(waiting) => {
      // A test to convert waits for its AI on its own page, which outlives
      // the dialog: the teacher comes back to it with the file their AI made.
      closeImport()
      navigate(`/import?id=${encodeURIComponent(waiting.id)}`)
    }}
  />
  // Importing by drop is offered on every page, the editor included, so the
  // overlay and the dialog live outside the route switch below.
  const globalChrome = <>
    <BankFileDropTarget onFile={dropping(openImport)} />
    {importDialog}
  </>
  if (route === '/imports' || route === '/imports/new') return <>{globalChrome}<ImportsPage
    onImport={() => openImport()}
    onProposal={openImportWithProposal}
    persistentStorage={storageStatus}
    revision={importRevision}
    picturesNeededIn={picturesNeededIn}
  /></>
  if (route === '/import') {
    const waitingId = new URLSearchParams(window.location.search).get('id') ?? ''
    // A file dropped on a waiting import's page is the AI's answer to it.
    return <>
      <BankFileDropTarget onFile={dropping((file) => setConvertDrop({ file, id: Date.now() }))} />
      {importDialog}
      <WaitingImportPage
        id={waitingId}
        persistentStorage={storageStatus}
        revision={importRevision}
        dropped={convertDrop}
        onReturnedFile={(file) => openImport(file, null, waitingId)}
      />
    </>
  }
  if (route === '/diak') {
    // A diák saját oldala: kóddal a belépő, kód nélkül a kódkérő — itt látszanak
    // a telefonon megőrzött hibalisták is, miután a szoba már bezárt.
    const studentCode = new URLSearchParams(search).get('kod') ?? ''
    return <GameStudent initialCode={studentCode} />
  }
  if (route === '/jatek') {
    // A diák linkje (`/jatek?kod=482913`) a telefonos belépő; kód nélkül a tanár oldala.
    const code = new URLSearchParams(search).get('kod') ?? ''
    if (code) return <GameStudent initialCode={code} />
    const query = new URLSearchParams(search)
    return (
      <GamePage
        banks={bankWorkspaces}
        persistentStorage={storageStatus}
        initialBankId={query.get('bank') ?? ''}
        initialMode={query.get('mod') === 'kartya' ? 'flashcard' : ''}
      />
    )
  }
  if (route === '/about') return <>{globalChrome}<AboutPage persistentStorage={storageStatus} /></>
  if (route === '/privacy') return <>{globalChrome}<PrivacyPage persistentStorage={storageStatus} /></>
  if (route === '/settings') return <>{globalChrome}<SettingsPage persistentStorage={storageStatus} /></>
  if (route === '/exams') return <>{globalChrome}<ResourceCollectionPage
    kind="exams"
    exams={exams}
    banks={bankCollection}
    persistentStorage={storageStatus}
    onOpenExam={openExam}
    onOpenBank={openBank}
    onNewExam={newExam}
    onDeleteExam={(exam) => requestExamDeletion(exam.id)}
    error={homeError}
  />{bankDeletionConfirmation}{examDeletionConfirmation}</>
  if (route === '/question-banks') return <>{globalChrome}<ResourceCollectionPage
    kind="question-banks"
    exams={exams}
    banks={bankCollection}
    persistentStorage={storageStatus}
    onOpenExam={openExam}
    onOpenBank={openBank}
    onNewBank={newBank}
    onExportBank={requestBankExport}
    onDeleteBank={requestBankDeletion}
    onImportBank={() => openImport()}
    error={homeError}
  />{bankExportDialog}{bankDeletionConfirmation}</>
  // A device that has never been here gets the front door instead of empty
  // shelves; the same page stays reachable at /welcome afterwards.
  const firstVisit = exams.length === 0 && bankCollection.length === 0 && !hasBeenWelcomed()
  if (route === '/welcome' || (route === '/' && firstVisit)) return <>{globalChrome}<LandingPage returning={!firstVisit} /></>
  if (route === '/get-started') return <>{globalChrome}<OnboardingPage onNewBank={newBank} onNewExam={newExam} /></>
  // Its last step is "drop the file anywhere", which the page-wide drop
  // target in the global chrome already is.
  // Converting starts from the test itself, so on the convert page a drop is
  // the page's to read: only a Test Parrot file goes straight to the import.
  if (route === '/get-started/convert') return <>
    <BankFileDropTarget tests onFile={dropping((file) => setConvertDrop({ file, id: Date.now() }))} />
    {importDialog}
    <ConvertPage dropped={convertDrop} onOpenImport={(file, waitingImportId) => openImport(file, null, waitingImportId)} />
  </>
  if (route === '/') return <>{globalChrome}<HomePage
    exams={exams}
    banks={bankCollection}
    error={homeError}
    persistentStorage={storageStatus}
    onNewExam={newExam}
    onOpen={openExam}
    onNewBank={newBank}
    onOpenBank={openBank}
    onExportBank={requestBankExport}
    onDeleteBank={requestBankDeletion}
    onDeleteExam={(exam) => requestExamDeletion(exam.id)}
    onImport={() => openImport()}
  />{bankExportDialog}{bankDeletionConfirmation}{examDeletionConfirmation}</>
  if (route === '/question-bank') return pageBank && pageBankReady ? <>{globalChrome}<QuestionBankPage
    key={pageBank.bank.id}
    bank={pageBank.bank}
    bankWorkspaces={bankWorkspaces}
    workspaces={workspaces}
    persistentStorage={storageStatus}
    // What went wrong at start belongs to the bank the app started on.
    launchError={pageBank.bank === bank ? initialError : null}
    onImportInto={(bankId) => openImport(null, bankId)}
    onPlay={() => navigate(`/jatek?bank=${pageBank.bank.id}`)}
    onFlashcards={() => navigate(`/jatek?bank=${pageBank.bank.id}&mod=kartya`)}
  /></> : globalChrome
  return editorStore && editorId ? <>{globalChrome}<ExamEditor
    store={editorStore}
    examId={editorId}
    bankWorkspaces={bankWorkspaces}
    workspaces={workspaces}
    exams={exams}
    launchError={initialError}
    bankLibraryRevision={bankLibraryRevision}
    onImportBank={(file) => openImport(file)}
    onSaveAs={saveAs}
    onDelete={() => requestExamDeletion(editorId, editorStore.getState().workingCopy.title)}
    onOpenExam={(id) => {
      void (async () => {
        await bankWorkspaces.carryWorkspace({ examId: editorId }, { examId: id })
        if (!await workspaces.open(id)) return
        setEditorStore(await loadExamStore(workspaces.backendFor(id), undefined, domMeasure.bankAnswerWidth))
        setEditorId(id)
      })()
    }}
    onHome={() => {
    void workspaces.activeId().then(async (id) => {
      if (id) await workspaces.removePristine(id)
      window.location.assign('/')
    })
  }} />{examDeletionConfirmation}</> : globalChrome
}
