import { useCallback, useMemo, useState } from 'react'
import {
  FileText,
  FolderOpen,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Upload,
  LayoutGrid,
  Table as TableIcon,
  EllipsisVertical,
  TriangleAlert,
  Copy,
  Trash2,
  PictureInPicture2,
} from 'lucide-react'
import type { RecentExam } from './exam/exam-workspaces'
import type { PersistentStorageStatus } from './storage/durable-storage'
import type { QuestionBankCollectionItem } from './bank/resource-collections'
import { homePreview } from './bank/resource-collections'
import {
  CreateFirstCard,
  ExamCard,
  NewResourceCard,
  QuestionBankCard,
  ResourceCarousel,
} from './bank/resource-cards'
import { AppShell } from './app-shell'
import { countOf, t, useT } from './i18n/index'
import { usePopOver } from './editor/pop-over-context'
import { navigate } from './use-route'
import { ContextMenu, type MenuItem, type MenuPoint } from './context-menu'
import { TopicBadge } from './editor/badges'
import { BulkDeletionConfirmation } from './confirmations'

function relativeTime(prefix: string, iso: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  )
  const say = (
    key: 'card.justNow' | 'card.minutesAgo' | 'card.hoursAgo' | 'card.daysAgo',
    count = 0,
  ) => (count > 0 ? t(key, { prefix, count }) : t(key, { prefix }))
  if (minutes === 0) return say('card.justNow')
  if (minutes < 60) return say('card.minutesAgo', minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return say('card.hoursAgo', hours)
  const days = Math.floor(hours / 24)
  return say('card.daysAgo', days)
}

type FilterTab = 'all' | 'exams' | 'banks'
type SortColumn = 'name' | 'type' | 'questions' | 'date'
type SortDir = 'asc' | 'desc'

type TableItem =
  | {
      kind: 'exam'
      id: string
      title: string
      questionCount: number
      date: string
      unsaved: boolean
      raw: RecentExam
    }
  | {
      kind: 'bank'
      id: string
      title: string
      questionCount: number
      date: string
      topics: string[]
      student: boolean
      raw: QuestionBankCollectionItem
    }

export function HomePage({
  exams,
  banks,
  error,
  persistentStorage,
  onNewExam,
  onOpen,
  onNewBank,
  onOpenBank,
  onExportBank,
  onDeleteBank,
  onDuplicateBank,
  onDeleteExam,
  onBulkDelete,
  onImport,
}: {
  exams: readonly RecentExam[]
  banks: readonly QuestionBankCollectionItem[]
  error: string | null
  persistentStorage: PersistentStorageStatus
  onNewExam: () => void
  onOpen: (id: string) => void
  onNewBank: () => void
  onOpenBank: (id: string) => void
  onExportBank: (bank: QuestionBankCollectionItem) => void
  onDeleteBank: (bank: QuestionBankCollectionItem) => void
  onDuplicateBank: (bank: QuestionBankCollectionItem) => void
  onDeleteExam: (exam: RecentExam) => void
  onBulkDelete?: (items: { examIds: string[]; bankIds: string[] }) => Promise<void>
  onImport: () => void
}) {
  const tHook = useT()
  const popOver = usePopOver()

  const [view, setView] = useState<'table' | 'cards'>(() => {
    try {
      const saved = localStorage.getItem('test-parrot:home-view')
      if (saved === 'cards' || saved === 'table') return saved
    } catch {
      // ignore
    }
    return 'table'
  })

  const handleSetView = useCallback((next: 'table' | 'cards') => {
    setView(next)
    try {
      localStorage.setItem('test-parrot:home-view', next)
    } catch {
      // ignore
    }
  }, [])

  const [tab, setTab] = useState<FilterTab>('all')
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<SortColumn>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState<{
    examIds: string[]
    bankIds: string[]
  } | null>(null)

  const [activeMenu, setActiveMenu] = useState<{
    item: TableItem
    point: MenuPoint
  } | null>(null)

  const practiceHref = useCallback(
    (id: string) => navigate(`/gyakorlas?bank=${encodeURIComponent(id)}`),
    [],
  )

  const handleOpenItem = useCallback(
    (item: TableItem) => {
      if (item.kind === 'exam') {
        onOpen(item.id)
      } else if (item.student) {
        practiceHref(item.id)
      } else {
        onOpenBank(item.id)
      }
    },
    [onOpen, onOpenBank, practiceHref],
  )

  const allItems = useMemo<TableItem[]>(() => {
    const examItems: TableItem[] = exams.map((exam) => ({
      kind: 'exam',
      id: exam.id,
      title: exam.title || tHook('exam.untitled'),
      questionCount: exam.questionCount,
      date: exam.lastOpenedAt,
      unsaved: exam.unsaved,
      raw: exam,
    }))

    const bankItems: TableItem[] = banks.map((bank) => ({
      kind: 'bank',
      id: bank.id,
      title: bank.name || tHook('bank.untitledName'),
      questionCount: bank.questionCount,
      date: bank.lastUpdatedAt,
      topics: bank.topics || [],
      student: bank.student === true,
      raw: bank,
    }))

    return [...examItems, ...bankItems]
  }, [exams, banks, tHook])

  const selectedItems = useMemo(() => {
    return allItems.filter((item) => selectedKeys.has(`${item.kind}-${item.id}`))
  }, [allItems, selectedKeys])

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (tab === 'exams' && item.kind !== 'exam') return false
      if (tab === 'banks' && item.kind !== 'bank') return false

      const q = query.trim().toLowerCase()
      if (!q) return true

      if (item.title.toLowerCase().includes(q)) return true
      if (item.kind === 'bank' && item.topics) {
        return item.topics.some((top) => top.toLowerCase().includes(q))
      }
      return false
    })
  }, [allItems, tab, query])

  const sortedItems = useMemo(() => {
    const items = [...filteredItems]
    items.sort((a, b) => {
      let diff = 0
      if (sortCol === 'name') {
        diff = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      } else if (sortCol === 'type') {
        diff = a.kind.localeCompare(b.kind)
      } else if (sortCol === 'questions') {
        diff = a.questionCount - b.questionCount
      } else if (sortCol === 'date') {
        diff = new Date(a.date).getTime() - new Date(b.date).getTime()
      }
      return sortDir === 'asc' ? diff : -diff
    })
    return items
  }, [filteredItems, sortCol, sortDir])

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir(col === 'date' || col === 'questions' ? 'desc' : 'asc')
    }
  }

  const menuItems: MenuItem[] = useMemo(() => {
    if (!activeMenu) return []
    const { item } = activeMenu
    if (item.kind === 'exam') {
      return [
        {
          kind: 'action',
          label: t('card.open'),
          icon: <FolderOpen />,
          onSelect: () => onOpen(item.id),
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: t('common.delete'),
          icon: <Trash2 />,
          destructive: true,
          onSelect: () => onDeleteExam(item.raw),
        },
      ]
    }

    const student = item.student
    return [
      {
        kind: 'action',
        label: t(student ? 'practice.open' : 'card.open'),
        icon: <FolderOpen />,
        onSelect: () => (student ? practiceHref(item.id) : onOpenBank(item.id)),
      },
      ...(!student && popOver.supported
        ? [
            {
              kind: 'action' as const,
              label: t('bank.popOver'),
              icon: <PictureInPicture2 />,
              onSelect: () => popOver.open(item.id),
            },
          ]
        : []),
      ...(!student
        ? [
            {
              kind: 'action' as const,
              label: t('bank.duplicateAction'),
              icon: <Copy />,
              onSelect: () => onDuplicateBank(item.raw),
            },
            {
              kind: 'action' as const,
              label: t('bank.exportAction'),
              icon: <Upload />,
              disabled: item.questionCount === 0,
              onSelect: () => onExportBank(item.raw),
            },
          ]
        : []),
      { kind: 'separator' },
      {
        kind: 'action',
        label: t('bank.deleteAction'),
        icon: <Trash2 />,
        destructive: true,
        onSelect: () => onDeleteBank(item.raw),
      },
    ]
  }, [
    activeMenu,
    onOpen,
    onOpenBank,
    onDeleteExam,
    onDeleteBank,
    onDuplicateBank,
    onExportBank,
    practiceHref,
    popOver,
  ])

  const renderSortIndicator = (col: SortColumn) => {
    if (sortCol !== col) {
      return <ArrowUpDown aria-hidden="true" className="th-sort-idle" style={{ width: 13, height: 13 }} />
    }
    return sortDir === 'asc' ? (
      <ArrowUp aria-hidden="true" style={{ width: 13, height: 13 }} />
    ) : (
      <ArrowDown aria-hidden="true" style={{ width: 13, height: 13 }} />
    )
  }

  const isEmpty = exams.length === 0 && banks.length === 0
  const recentExams = homePreview(exams)

  const importLink = (
    <button type="button" className="primary-button" onClick={onImport}>
      <Upload aria-hidden="true" style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
      {tHook('home.import')}
    </button>
  )

  return (
    <AppShell crumbs={[{ label: tHook('shell.home') }]} persistentStorage={persistentStorage}>
      {error && (
        <p className="home-error" role="alert">
          {error}
        </p>
      )}

      {isEmpty ? (
        <>
          <section className="home-shelf" aria-labelledby="recent-exams-heading">
            <div className="shelf-bar">
              <h1 id="recent-exams-heading" className="shelf-label">
                {tHook('home.pickUp')}
              </h1>
              {importLink}
              <button type="button" className="link-button shelf-new" onClick={onNewExam}>
                <Plus aria-hidden="true" style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                {tHook('home.newExam')}
              </button>
            </div>
            <CreateFirstCard label={tHook('home.createFirstExam')} onClick={onNewExam} />
          </section>

          <section className="home-shelf" aria-labelledby="question-banks-heading">
            <div className="shelf-bar">
              <h2 id="question-banks-heading" className="shelf-label">
                {tHook('home.questionBanks')}
              </h2>
              <button type="button" className="link-button shelf-new" onClick={onNewBank}>
                <Plus aria-hidden="true" style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                {tHook('home.newBank')}
              </button>
            </div>
            <CreateFirstCard label={tHook('home.createFirstBank')} onClick={onNewBank} />
          </section>
        </>
      ) : (
        <>
          <div className="home-header">
            <div className="home-header-left">
              <div className="home-counts-summary">
                {tHook('home.itemCount', { count: allItems.length })} · {exams.length} {tHook('home.exams').toLowerCase()} · {banks.length} {tHook('home.banks').toLowerCase()}
              </div>
            </div>
            <div className="home-header-actions">
              <button type="button" className="secondary-button" onClick={onNewExam}>
                <Plus aria-hidden="true" style={{ width: 14, height: 14, marginRight: 6 }} />
                {tHook('home.newExam')}
              </button>
              <button type="button" className="secondary-button" onClick={onNewBank}>
                <Plus aria-hidden="true" style={{ width: 14, height: 14, marginRight: 6 }} />
                {tHook('home.newBank')}
              </button>
              <button type="button" className="primary-button" onClick={onImport}>
                <Upload aria-hidden="true" style={{ width: 14, height: 14, marginRight: 6 }} />
                {tHook('home.import')}
              </button>
              <div className="home-view-toggle" role="group" aria-label={tHook('home.viewTable')}>
                <button
                  type="button"
                  className="home-view-btn"
                  data-active={view === 'table'}
                  aria-pressed={view === 'table'}
                  onClick={() => handleSetView('table')}
                  title={tHook('home.viewTable')}
                >
                  <TableIcon aria-hidden="true" style={{ width: 15, height: 15 }} />
                  <span>{tHook('home.viewTable')}</span>
                </button>
                <button
                  type="button"
                  className="home-view-btn"
                  data-active={view === 'cards'}
                  aria-pressed={view === 'cards'}
                  onClick={() => handleSetView('cards')}
                  title={tHook('home.viewCards')}
                >
                  <LayoutGrid aria-hidden="true" style={{ width: 15, height: 15 }} />
                  <span>{tHook('home.viewCards')}</span>
                </button>
              </div>
            </div>
          </div>

          {view === 'cards' ? (
            <>
              <section className="home-shelf" aria-labelledby="recent-exams-heading">
                {recentExams.length === 0 ? (
                  <>
                    <div className="shelf-bar">
                      <h1 id="recent-exams-heading" className="shelf-label">
                        {tHook('home.pickUp')}
                      </h1>
                      <button type="button" className="link-button shelf-new" onClick={onNewExam}>
                        {tHook('home.newExam')}
                      </button>
                    </div>
                    <CreateFirstCard label={tHook('home.createFirstExam')} onClick={onNewExam} />
                  </>
                ) : (
                  <ResourceCarousel
                    label={tHook('home.recentExams')}
                    heading={
                      <h1 id="recent-exams-heading" className="shelf-label">
                        {tHook('home.pickUp')}
                      </h1>
                    }
                  >
                    {recentExams.map((exam) => (
                      <div role="listitem" key={exam.id}>
                        <ExamCard exam={exam} onOpen={onOpen} onDelete={onDeleteExam} />
                      </div>
                    ))}
                    <div role="presentation">
                      <NewResourceCard label={tHook('home.newExam')} shape="sheet" onClick={onNewExam} />
                    </div>
                  </ResourceCarousel>
                )}
              </section>

              <section className="home-shelf" aria-labelledby="question-banks-heading">
                <div className="shelf-bar">
                  <h2 id="question-banks-heading" className="shelf-label">
                    {tHook('home.questionBanks')}
                  </h2>
                  {banks.length === 0 && (
                    <button type="button" className="link-button shelf-new" onClick={onNewBank}>
                      {tHook('home.newBank')}
                    </button>
                  )}
                </div>
                {banks.length === 0 ? (
                  <CreateFirstCard label={tHook('home.createFirstBank')} onClick={onNewBank} />
                ) : (
                  <div className="collection-grid">
                    {banks.map((bank) => (
                      <QuestionBankCard
                        key={bank.id}
                        bank={bank}
                        onOpen={onOpenBank}
                        onExport={onExportBank}
                        onDelete={onDeleteBank}
                        onDuplicate={onDuplicateBank}
                      />
                    ))}
                    <NewResourceCard label={tHook('home.newBank')} shape="card" onClick={onNewBank} />
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="home-shelf" aria-labelledby="recent-exams-heading">
              <h1 id="recent-exams-heading" className="sr-only">
                {tHook('home.pickUp')}
              </h1>
              <section className="home-shelf" aria-labelledby="question-banks-heading" style={{ margin: 0 }}>
                <h2 id="question-banks-heading" className="sr-only">
                  {tHook('home.questionBanks')}
                </h2>
                <div className="home-table-card">
                  <div className="home-table-toolbar">
                    <div className="home-tabs" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'all'}
                        className="home-tab-btn"
                        data-active={tab === 'all'}
                        onClick={() => setTab('all')}
                      >
                        <span>{tHook('home.all')}</span>
                        <span className="home-tab-badge">{allItems.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'exams'}
                        className="home-tab-btn"
                        data-active={tab === 'exams'}
                        onClick={() => setTab('exams')}
                      >
                        <span>{tHook('home.exams')}</span>
                        <span className="home-tab-badge">{exams.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'banks'}
                        className="home-tab-btn"
                        data-active={tab === 'banks'}
                        onClick={() => setTab('banks')}
                      >
                        <span>{tHook('home.banks')}</span>
                        <span className="home-tab-badge">{banks.length}</span>
                      </button>
                    </div>

                    <div className="home-search-wrapper">
                      <Search className="home-search-icon" aria-hidden="true" style={{ width: 16, height: 16 }} />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={tHook('home.searchPlaceholder')}
                        aria-label={tHook('home.searchPlaceholder')}
                      />
                      {query.length > 0 && (
                        <button
                          type="button"
                          className="home-search-clear"
                          onClick={() => setQuery('')}
                          aria-label={tHook('home.clearSearch')}
                        >
                          <X aria-hidden="true" style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </div>
                  </div>

                  {sortedItems.length === 0 ? (
                    <div className="home-empty-search">
                      <h3>{tHook('home.noMatches', { query })}</h3>
                      <button type="button" className="link-button" onClick={() => { setQuery(''); setTab('all'); }}>
                        {tHook('home.clearSearch')}
                      </button>
                    </div>
                  ) : (
                    <div className="home-table-scroll">
                      <table className="home-table">
                        <thead>
                          <tr>
                            <th scope="col" className="home-th-select">
                              <input
                                type="checkbox"
                                checked={sortedItems.length > 0 && sortedItems.every((item) => selectedKeys.has(`${item.kind}-${item.id}`))}
                                ref={(el) => {
                                  if (el) {
                                    const some = sortedItems.some((item) => selectedKeys.has(`${item.kind}-${item.id}`))
                                    const all = sortedItems.length > 0 && sortedItems.every((item) => selectedKeys.has(`${item.kind}-${item.id}`))
                                    el.indeterminate = some && !all
                                  }
                                }}
                                onChange={() => {
                                  const all = sortedItems.length > 0 && sortedItems.every((item) => selectedKeys.has(`${item.kind}-${item.id}`))
                                  setSelectedKeys((prev) => {
                                    const next = new Set(prev)
                                    if (all) {
                                      sortedItems.forEach((i) => next.delete(`${i.kind}-${i.id}`))
                                    } else {
                                      sortedItems.forEach((i) => next.add(`${i.kind}-${i.id}`))
                                    }
                                    return next
                                  })
                                }}
                                aria-label={tHook('home.selectAll')}
                              />
                            </th>
                            <th
                              className="sortable"
                              scope="col"
                              onClick={() => handleSort('name')}
                              aria-sort={sortCol === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <div className="th-content">
                                <span>{tHook('home.colName')}</span>
                                {renderSortIndicator('name')}
                              </div>
                            </th>
                            <th
                              className="sortable"
                              scope="col"
                              onClick={() => handleSort('type')}
                              aria-sort={sortCol === 'type' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <div className="th-content">
                                <span>{tHook('home.colType')}</span>
                                {renderSortIndicator('type')}
                              </div>
                            </th>
                            <th
                              className="sortable"
                              scope="col"
                              onClick={() => handleSort('questions')}
                              aria-sort={sortCol === 'questions' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <div className="th-content">
                                <span>{tHook('home.colQuestions')}</span>
                                {renderSortIndicator('questions')}
                              </div>
                            </th>
                            <th
                              className="sortable"
                              scope="col"
                              onClick={() => handleSort('date')}
                              aria-sort={sortCol === 'date' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            >
                              <div className="th-content">
                                <span>{tHook('home.colLastActive')}</span>
                                {renderSortIndicator('date')}
                              </div>
                            </th>
                            <th scope="col" style={{ textAlign: 'right' }}>
                              <span>{tHook('home.colActions')}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedItems.map((item) => {
                            const isSelected = selectedKeys.has(`${item.kind}-${item.id}`)
                            return (
                              <tr
                                key={`${item.kind}-${item.id}`}
                                className={`home-table-row home-table-row--${item.kind}`}
                                data-selected={isSelected}
                                onClick={() => handleOpenItem(item)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleOpenItem(item)
                                }}
                              >
                                <td className="home-td-select" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      setSelectedKeys((prev) => {
                                        const next = new Set(prev)
                                        const key = `${item.kind}-${item.id}`
                                        if (next.has(key)) next.delete(key)
                                        else next.add(key)
                                        return next
                                      })
                                    }}
                                    aria-label={t('home.selectItem', { name: item.title })}
                                  />
                                </td>
                                <td>
                                  <div className="home-item-info">
                                    <div className={`home-item-icon home-item-icon--${item.kind}`}>
                                      {item.kind === 'exam' ? (
                                        <FileText aria-hidden="true" style={{ width: 18, height: 18 }} />
                                    ) : (
                                      <FolderOpen aria-hidden="true" style={{ width: 18, height: 18 }} />
                                    )}
                                  </div>
                                  <div className="home-item-text">
                                    <div className="home-item-title-row">
                                      <button
                                        type="button"
                                        className="home-item-title-btn"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenItem(item)
                                        }}
                                      >
                                        <span className="sr-only">
                                          {t('card.openName', { name: item.title })}{' '}
                                        </span>
                                        <span>{item.title}</span>
                                        <span className="sr-only">
                                          {' '}
                                          {countOf(item.questionCount, 'question')}
                                        </span>
                                      </button>
                                      {item.kind === 'exam' && item.unsaved && (
                                        <span className="unsaved-mark" title={tHook('home.unsaved')}>
                                          <TriangleAlert aria-hidden="true" style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                                          <span>{tHook('home.unsaved')}</span>
                                        </span>
                                      )}
                                    </div>
                                    {item.kind === 'bank' && item.topics && item.topics.length > 0 && (
                                      <div className="home-item-topics">
                                        {item.topics.slice(0, 3).map((topic) => (
                                          <TopicBadge key={topic} topic={topic} />
                                        ))}
                                        {item.topics.length > 3 && (
                                          <span className="badge">
                                            +{item.topics.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              <td>
                                <span className={`home-type-pill home-type-pill--${item.kind}`}>
                                  {item.kind === 'exam'
                                    ? tHook('home.typeExam')
                                    : item.student
                                    ? tHook('home.student')
                                    : tHook('home.typeBank')}
                                </span>
                              </td>

                              <td>
                                <span className="home-question-count">
                                  {countOf(item.questionCount, 'question')}
                                </span>
                              </td>

                              <td>
                                <span className="home-date-text">
                                  {item.kind === 'exam'
                                    ? relativeTime(t('home.openedPrefix'), item.date)
                                    : relativeTime(t('card.updatedPrefix'), item.date)}
                                </span>
                              </td>

                              <td>
                                <div className="home-actions-group">
                                  <button
                                    type="button"
                                    className="home-btn-open"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenItem(item)
                                    }}
                                  >
                                    <FolderOpen aria-hidden="true" style={{ width: 14, height: 14 }} />
                                    <span>{tHook('home.open')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="home-btn-menu"
                                    aria-label={t('ui.nameActions', { name: item.title })}
                                    aria-haspopup="menu"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const bounds = e.currentTarget.getBoundingClientRect()
                                      setActiveMenu({
                                        item,
                                        point: { x: bounds.right, y: bounds.bottom + 4 },
                                      })
                                    }}
                                  >
                                    <EllipsisVertical aria-hidden="true" style={{ width: 16, height: 16 }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {selectedItems.length > 0 && (
                    <div className="home-bulk-bar" role="region" aria-label={tHook('home.bulkActions')}>
                      <span className="home-bulk-count">
                        {tHook('home.selectedCount', { count: selectedItems.length })}
                      </span>
                      <div className="home-bulk-buttons">
                        <button
                          type="button"
                          className="home-bulk-btn home-bulk-btn--delete"
                          onClick={() => {
                            const examIds = selectedItems.filter((i) => i.kind === 'exam').map((i) => i.id)
                            const bankIds = selectedItems.filter((i) => i.kind === 'bank').map((i) => i.id)
                            setConfirmingBulkDelete({ examIds, bankIds })
                          }}
                        >
                          <Trash2 aria-hidden="true" style={{ width: 14, height: 14, marginRight: 6 }} />
                          {tHook('home.bulkDelete')}
                        </button>
                        <button
                          type="button"
                          className="home-bulk-btn home-bulk-btn--clear"
                          onClick={() => setSelectedKeys(new Set())}
                        >
                          <X aria-hidden="true" style={{ width: 14, height: 14, marginRight: 4 }} />
                          {tHook('home.clearSelection')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </section>
          )}

          {activeMenu && (
            <ContextMenu
              point={activeMenu.point}
              items={menuItems}
              ariaLabel={t('ui.nameActions', { name: activeMenu.item.title })}
              onClose={() => setActiveMenu(null)}
            />
          )}

          {confirmingBulkDelete && (
            <BulkDeletionConfirmation
              examCount={confirmingBulkDelete.examIds.length}
              bankCount={confirmingBulkDelete.bankIds.length}
              onCancel={() => setConfirmingBulkDelete(null)}
              onConfirm={async () => {
                if (onBulkDelete) {
                  await onBulkDelete(confirmingBulkDelete)
                } else {
                  for (const item of selectedItems) {
                    if (item.kind === 'exam') onDeleteExam(item.raw)
                    else onDeleteBank(item.raw)
                  }
                }
                setSelectedKeys(new Set())
                setConfirmingBulkDelete(null)
              }}
            />
          )}
        </>
      )}
    </AppShell>
  )
}
