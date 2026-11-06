import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { SECTION_LABELS, SECTION_ORDER, createQuestion, duplicateQuestion } from '../exam/exam'
import type { Question } from '../exam/exam'
import { QuestionBankPane } from './question-bank-pane'
import { NO_FILTER, topicOptions, type QuestionBankFilter } from './question-bank-view'
import { useSelection } from '../editor/use-selection'
import { useWorkspaceDrag } from '../editor/use-workspace-drag'
import { ResolveImagesDialog } from '../editor/resolve-images-dialog'
import { storedPicture } from '../editor/resolved-pictures'
import { pendingImagesOfQuestions, withStoredPictures, type PendingImageResolution, type StoredPicture } from '../editor/pending-images'
import { FolderOpen, Import, Pencil, PictureInPicture2, Plus, X } from 'lucide-react'
import { ContextMenu, type MenuPoint } from '../context-menu'
import { usePopOver } from '../editor/pop-over-context'
import { navigate } from '../use-route'
import type { ExamWorkspaceService, QuestionUsage } from '../exam/exam-workspaces'
import { type QuestionBankResource, type QuestionBankSummary, type QuestionBankTabsWorkspace, type BankWorkspaceContext, closeBankTab, openBankTab, type QuestionBankWorkspaceService } from './question-bank-workspaces'
import { AppShell } from '../app-shell'
import { type PersistentStorageStatus } from '../storage/durable-storage'
import { QuestionBankExportDialog } from '../export/question-bank-export-dialog'
import { countOf, t, useT } from '../i18n/index'
import { QUESTION_TYPE_ICONS } from '../editor/question-type-icons'
import { QuestionDialog } from '../editor/question-editor'
import { QuestionDeletionConfirmation } from '../confirmations'

export function ResourcePicker({
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
export function QuestionBankWorkspace({
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

export function QuestionBankTabsPane({
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
export function BankPageFacts({
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
export function QuestionBankPage({
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




