import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { createExamStore, loadExamStore, type ExamStore } from './exam/exam-store'
import { domMeasure } from './export/dom-measure'
import { pendingImagesOfQuestions } from './editor/pending-images'
import { navigate, replaceRoute, useLocationSearch, useRoute } from './use-route'
import { HomePage } from './home-page'
import { LandingPage, OnboardingPage } from './landing-page'
import { ConvertPage } from './import/convert-page'
import { hasBeenWelcomed } from './welcomed'
import type { ExamWorkspaceService, QuestionDeletionImpact, RecentExam } from './exam/exam-workspaces'
import { type ExamDeletionSummary } from './exam/exam-deletion'
import { type QuestionBankResource, type QuestionBankWorkspaceService } from './bank/question-bank-workspaces'
import { useDriveAutoBackup } from './use-drive-autobackup'
import { persistentStorageStatus, type PersistentStorageStatus } from './storage/durable-storage'
import { BankFileDropTarget } from './bank/bank-file-drop'
import { questionBankCollection, type QuestionBankCollectionItem } from './bank/resource-collections'
import { countOf, t } from './i18n/index'
import { BankDeletionConfirmation, ExamDeletionConfirmation } from './confirmations'

const AboutPage = lazy(() => import('./site-pages').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('./site-pages').then((m) => ({ default: m.PrivacyPage })))
const SettingsPage = lazy(() => import('./settings-page').then((m) => ({ default: m.SettingsPage })))
const GamePage = lazy(() => import('./game/page').then((m) => ({ default: m.GamePage })))
const GameStudent = lazy(() => import('./game/student').then((m) => ({ default: m.GameStudent })))
const ResourceCollectionPage = lazy(() => import('./bank/resource-collection-page').then((m) => ({ default: m.ResourceCollectionPage })))
const ImportsPage = lazy(() => import('./import/imports-page').then((m) => ({ default: m.ImportsPage })))
const WaitingImportPage = lazy(() => import('./import/imports-page').then((m) => ({ default: m.WaitingImportPage })))
const ResultsPage = lazy(() => import('./results-page').then((m) => ({ default: m.ResultsPage })))
const QuestionBankExportDialog = lazy(() => import('./export/question-bank-export-dialog').then((m) => ({ default: m.QuestionBankExportDialog })))
const QuestionBankImportDialog = lazy(() => import('./import/question-bank-import-dialog').then((m) => ({ default: m.QuestionBankImportDialog })))
const ExamEditor = lazy(() => import('./exam/exam-editor').then((m) => ({ default: m.ExamEditor })))
const QuestionBankPage = lazy(() => import('./bank/question-bank-page').then((m) => ({ default: m.QuestionBankPage })))

/** The mark each Question Section goes by, so a type reads the same wherever
 *  it is named — the picker that chooses one, and the dialog that states it. */
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
  const [importProposal, setImportProposal] = useState<import('./import/package-import').ImportProposal | null>(null)
  const [convertDrop, setConvertDrop] = useState<{ file: File; id: number } | null>(null)
  const [homeError, setHomeError] = useState(initialError)
  const [bankLibraryRevision, setBankLibraryRevision] = useState(0)
  const [importTargetBankId, setImportTargetBankId] = useState<string | null>(null)
  /** The waiting import the dialog finishes, when it was opened on one. */
  const [importWaitingId, setImportWaitingId] = useState<string | null>(null)
  /** Bumped whenever an import may have finished, for the Imports pages. */
  const [importRevision, setImportRevision] = useState(0)
  /** A Kahoot link read into questions: the dialog shows it as a file's reading. */
  const openImportWithProposal = useCallback((proposal: import('./import/package-import').ImportProposal) => {
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
    proposal: import('./import/package-import').ImportProposal,
    selection: import('./import/import-selection').ImportSelection,
    options: {
      resolution: import('./editor/pending-images').PendingImageResolution
      history: { fileName: string; kind: import('./import/import-history').ImportFileKind; waitingImportId?: string }
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
  // Másolat: a bank a listán marad, az új példány „(másolat)" névvel jelenik meg
  // mellette — a tanár innen nyithatja meg és szerkesztheti tovább.
  const duplicateBank = useCallback((bank: QuestionBankCollectionItem) => {
    void bankWorkspaces.duplicate(bank.id).then(async (copy) => {
      if (!copy) return
      const [recent, recentBanks] = await Promise.all([workspaces.recent(), bankWorkspaces.recent()])
      setExams(recent)
      setBankCollection(await questionBankCollection(recentBanks, bankWorkspaces, workspaces))
    })
  }, [bankWorkspaces, workspaces])
  const bankExportDialog = exportingBank && (
    <Suspense fallback={null}>
      <QuestionBankExportDialog
        bank={exportingBank}
        onClose={() => setExportingBank(null)}
      />
    </Suspense>
  )
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
  const importDialog = inspectingBankFile && (
    <Suspense fallback={null}>
      <QuestionBankImportDialog
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
    </Suspense>
  )
  // Importing by drop is offered on every page, the editor included, so the
  // overlay and the dialog live outside the route switch below.
  const globalChrome = <>
    <BankFileDropTarget onFile={dropping(openImport)} />
    {importDialog}
  </>
  if (route === '/imports' || route === '/imports/new') return <Suspense fallback={null}>{globalChrome}<ImportsPage
    onImport={() => openImport()}
    onProposal={openImportWithProposal}
    persistentStorage={storageStatus}
    revision={importRevision}
    picturesNeededIn={picturesNeededIn}
  /></Suspense>
  if (route === '/import') {
    const waitingId = new URLSearchParams(window.location.search).get('id') ?? ''
    // A file dropped on a waiting import's page is the AI's answer to it.
    return <Suspense fallback={null}>
      <BankFileDropTarget onFile={dropping((file) => setConvertDrop({ file, id: Date.now() }))} />
      {importDialog}
      <WaitingImportPage
        id={waitingId}
        persistentStorage={storageStatus}
        revision={importRevision}
        dropped={convertDrop}
        onReturnedFile={(file) => openImport(file, null, waitingId)}
      />
    </Suspense>
  }
  if (route === '/diak') {
    // A diák saját oldala: kóddal a belépő, kód nélkül a kódkérő — itt látszanak
    // a telefonon megőrzött hibalisták is, miután a szoba már bezárt.
    const studentCode = new URLSearchParams(search).get('kod') ?? ''
    return <Suspense fallback={null}><GameStudent initialCode={studentCode} /></Suspense>
  }
  if (route === '/jatek') {
    // A diák linkje (`/jatek?kod=482913`) a telefonos belépő; kód nélkül a tanár oldala.
    const code = new URLSearchParams(search).get('kod') ?? ''
    if (code) return <Suspense fallback={null}><GameStudent initialCode={code} /></Suspense>
    const query = new URLSearchParams(search)
    return (
      <Suspense fallback={null}>
        <GamePage
          banks={bankWorkspaces}
          persistentStorage={storageStatus}
          initialBankId={query.get('bank') ?? ''}
          initialMode={query.get('mod') === 'kartya' ? 'flashcard' : ''}
        />
      </Suspense>
    )
  }
  if (route === '/about') return <Suspense fallback={null}>{globalChrome}<AboutPage persistentStorage={storageStatus} /></Suspense>
  if (route === '/privacy') return <Suspense fallback={null}>{globalChrome}<PrivacyPage persistentStorage={storageStatus} /></Suspense>
  if (route === '/eredmenyek') return <Suspense fallback={null}>{globalChrome}<ResultsPage persistentStorage={storageStatus} /></Suspense>
  if (route === '/settings') return <Suspense fallback={null}>{globalChrome}<SettingsPage persistentStorage={storageStatus} /></Suspense>
  if (route === '/exams') return <Suspense fallback={null}>{globalChrome}<ResourceCollectionPage
    kind="exams"
    exams={exams}
    banks={bankCollection}
    persistentStorage={storageStatus}
    onOpenExam={openExam}
    onOpenBank={openBank}
    onNewExam={newExam}
    onDeleteExam={(exam) => requestExamDeletion(exam.id)}
    error={homeError}
  />{bankDeletionConfirmation}{examDeletionConfirmation}</Suspense>
  if (route === '/question-banks') return <Suspense fallback={null}>{globalChrome}<ResourceCollectionPage
    kind="question-banks"
    exams={exams}
    banks={bankCollection}
    persistentStorage={storageStatus}
    onOpenExam={openExam}
    onOpenBank={openBank}
    onNewBank={newBank}
    onExportBank={requestBankExport}
    onDuplicateBank={duplicateBank}
    onDeleteBank={requestBankDeletion}
    onImportBank={() => openImport()}
    error={homeError}
  />{bankExportDialog}{bankDeletionConfirmation}</Suspense>
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
    onDuplicateBank={duplicateBank}
    onDeleteBank={requestBankDeletion}
    onDeleteExam={(exam) => requestExamDeletion(exam.id)}
    onImport={() => openImport()}
  />{bankExportDialog}{bankDeletionConfirmation}{examDeletionConfirmation}</>
  if (route === '/question-bank') return pageBank && pageBankReady ? <Suspense fallback={globalChrome}>{globalChrome}<QuestionBankPage
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
  /></Suspense> : globalChrome
  return editorStore && editorId ? <Suspense fallback={globalChrome}>{globalChrome}<ExamEditor
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
  }} />{examDeletionConfirmation}</Suspense> : globalChrome
}
