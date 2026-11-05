import { useMemo, useState } from 'react'
import type { RecentExam } from './exam-workspaces'
import type { PersistentStorageStatus } from './durable-storage'
import { CreateFirstCard, ExamCard, QuestionBankCard } from './resource-cards'
import {
  filterExamCollection,
  filterQuestionBankCollection,
  type QuestionBankCollectionItem,
} from './resource-collections'
import { AppShell } from './app-shell'
import {
  createFolder,
  folderIn,
  foldersIn,
  placeInFolder,
  removeFolder,
  renameFolder,
  useFolderState,
} from './folders'
import { countOf, t } from './i18n'

export function ResourceCollectionPage({
  kind,
  exams,
  banks,
  persistentStorage,
  onOpenExam,
  onOpenBank,
  onNewExam,
  onNewBank,
  onExportBank,
  onDeleteBank,
  onDeleteExam,
  onImportBank,
  error,
}: {
  kind: 'exams' | 'question-banks'
  exams: readonly RecentExam[]
  banks: readonly QuestionBankCollectionItem[]
  persistentStorage: PersistentStorageStatus
  onOpenExam: (id: string) => void
  onOpenBank: (id: string) => void
  onNewExam?: () => void
  onNewBank?: () => void
  onExportBank?: (bank: QuestionBankCollectionItem) => void
  onDeleteBank?: (bank: QuestionBankCollectionItem) => void
  onDeleteExam?: (exam: RecentExam) => void
  onImportBank?: () => void
  /** Why the page was entered — a resource that is no longer on this device is
   *  the one reason a teacher lands here without having asked for it. */
  error?: string | null
}) {
  const [query, setQuery] = useState('')
  // A mappák nézet-rendezés: a böngésző tárolójában élnek, nem a bank adatában.
  // A `useFolderState` maga figyeli a tárolót, ezért áthelyezés, átnevezés és
  // törlés után újrarajzol — nincs szükség kézi „frissítés" jelzésre.
  const folderState = useFolderState()
  const [chosen, setChosen] = useState<'all' | 'none' | string>('all')
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const folders = useMemo(() => foldersIn(folderState, kind), [folderState, kind])
  const place = (id: string, folderId: string | null) => {
    placeInFolder(kind, id, folderId)
  }
  const selected = chosen === 'all' || chosen === 'none'
    ? null
    : folders.find((folder) => folder.id === chosen) ?? null
  const shownExams = useMemo(
    () => filterExamCollection(exams, query),
    [exams, query],
  )
  const shownBanks = useMemo(
    () => filterQuestionBankCollection(banks, query),
    [banks, query],
  )
  const isExams = kind === 'exams'
  const all = isExams ? exams : banks
  const folderOfResource = (id: string) => folderIn(folderState, kind, id)
  const resources = (isExams ? shownExams : shownBanks).filter((resource) => {
    if (chosen === 'all') return true
    const place = folderOfResource(resource.id)
    return chosen === 'none' ? place === null : place === chosen
  })
  /** Mennyi elem van a mappában — a most itt lévő elemekből számolva. */
  const countInFolder = (folderId: string) =>
    all.filter((resource) => folderOfResource(resource.id) === folderId).length
  /** Mappán kívüliek: akik egyik mappához sem tartoznak. */
  const loose = all.filter((resource) => folderOfResource(resource.id) === null).length
  const resourceName = isExams ? t('coll.exams') : t('coll.banks')
  const create = isExams ? onNewExam : onNewBank

  return (
    <AppShell
      crumbs={[{ label: t('nav.home'), href: '/' }, { label: resourceName }]}
      persistentStorage={persistentStorage}
    >
      {/* The bar above is navigation. Acting on this collection happens on the
          collection, and the page already says which one it is — so the buttons
          are just Import and New. */}
      {error && <p className="home-error" role="alert">{error}</p>}
      <header className="collection-heading">
        <h1>{resourceName}</h1>
        <div className="collection-actions">
          {!isExams && onImportBank && (
            <button type="button" className="secondary-button" onClick={onImportBank}>
              {t('coll.import')}
            </button>
          )}
          {create && (
            <button type="button" className="primary-button" onClick={create}>
              {t('coll.new')}
            </button>
          )}
        </div>
      </header>
      <div className="collection-body">
        {/* A mappák oldalsávja: ugyanaz a nézet-rendezés, függőlegesen — így a
            kártyák helye nem szűkül, és hosszú listánál sem csúszik el. */}
        <aside className="collection-sidebar">
          <nav className="folder-list" aria-label={t('folder.move')}>
            <button
              type="button"
              className="folder-chip"
              data-on={chosen === 'all' ? 'yes' : undefined}
              onClick={() => setChosen('all')}
            >
              {t('folder.all')}
              <span>{all.length}</span>
            </button>
            {folders.map((folder) => (
              <div className="folder-row" key={folder.id}>
                <button
                  type="button"
                  className="folder-chip"
                  data-on={chosen === folder.id ? 'yes' : undefined}
                  onClick={() => setChosen(folder.id)}
                >
                  {folder.name}
                  <span>{countInFolder(folder.id)}</span>
                </button>
                {chosen === folder.id && (
                  <div className="folder-tools">
                    <input
                      value={draft}
                      placeholder={folder.name}
                      aria-label={t('folder.rename')}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="folder-tool"
                      disabled={draft.trim().length === 0}
                      onClick={() => {
                        renameFolder(folder.id, draft)
                        setDraft('')
                      }}
                    >
                      {t('folder.rename')}
                    </button>
                    <button
                      type="button"
                      className="folder-tool"
                      onClick={() => {
                        removeFolder(folder.id)
                        setChosen('all')
                        setDraft('')
                      }}
                    >
                      {t('folder.delete')}
                    </button>
                    <p className="folder-hint">{t('folder.deleteHint')}</p>
                  </div>
                )}
              </div>
            ))}
            {/* A mappa nélküliek külön csoportban, a lista alján. */}
            <button
              type="button"
              className="folder-chip folder-chip--loose"
              data-on={chosen === 'none' ? 'yes' : undefined}
              onClick={() => setChosen('none')}
            >
              {t('folder.none')}
              <span>{loose}</span>
            </button>
          </nav>
          {creating ? (
            <form
              className="folder-new"
              onSubmit={(event) => {
                event.preventDefault()
                const created = createFolder(kind, draft)
                setDraft('')
                setCreating(false)
                if (created) setChosen(created.id)
              }}
            >
              <input
                autoFocus
                value={draft}
                placeholder={t('folder.namePlaceholder')}
                aria-label={t('folder.namePlaceholder')}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDraft('')
                    setCreating(false)
                  }
                }}
              />
              <button type="submit" className="secondary-button">
                {t('folder.create')}
              </button>
            </form>
          ) : (
            <button type="button" className="folder-add" onClick={() => setCreating(true)}>
              + {t('folder.new')}
            </button>
          )}
        </aside>
        <div className="collection-main">
          <div className="collection-filter">
            <label className="collection-search">
              <span className="sr-only">{t('coll.search', { name: resourceName })}</span>
              <input
                type="search"
                autoFocus
                placeholder={t('coll.search', { name: resourceName })}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="collection-count" role="status" aria-live="polite">
              {countOf(resources.length, isExams ? 'exam' : 'bank')}
            </p>
          </div>
          {resources.length === 0 ? (
            <section aria-label={t('coll.results', { name: resourceName })}>
              {query ? (
                <div className="home-empty">
                  <h2>{t('coll.noMatch', { name: resourceName, query: query.trim() })}</h2>
                  <p>{t('coll.tryAnother')}</p>
                </div>
              ) : selected ? (
                <div className="home-empty">
                  <h2>{t('folder.empty')}</h2>
                </div>
              ) : (
                create && (
                  <CreateFirstCard
                    label={isExams ? t('home.createFirstExam') : t('home.createFirstBank')}
                    onClick={create}
                  />
                )
              )}
            </section>
          ) : (
            <section
              className={isExams ? 'collection-grid collection-grid--exams' : 'collection-grid'}
              aria-label={t('coll.results', { name: resourceName })}
            >
              {resources.map((resource) =>
                isExams ? (
                  <ExamCard
                    key={resource.id}
                    exam={resource as RecentExam}
                    onOpen={onOpenExam}
                    onDelete={onDeleteExam}
                    folders={folders}
                    folderId={folderOfResource(resource.id)}
                    onPlaceInFolder={place}
                  />
                ) : (
                  <QuestionBankCard
                    key={resource.id}
                    bank={resource as QuestionBankCollectionItem}
                    onOpen={onOpenBank}
                    onExport={onExportBank}
                    onDelete={onDeleteBank}
                    folders={folders}
                    folderId={folderOfResource(resource.id)}
                    onPlaceInFolder={place}
                  />
                ),
              )}
            </section>
          )}
        </div>
      </div>
    </AppShell>
  )
}
