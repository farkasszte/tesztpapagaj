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
  const shownExams = useMemo(
    () => filterExamCollection(exams, query),
    [exams, query],
  )
  const shownBanks = useMemo(
    () => filterQuestionBankCollection(banks, query),
    [banks, query],
  )
  const isExams = kind === 'exams'
  const resources = isExams ? shownExams : shownBanks
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
          {isExams
            ? shownExams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} onOpen={onOpenExam} onDelete={onDeleteExam} />
              ))
            : shownBanks.map((bank) => (
                <QuestionBankCard
                  key={bank.id}
                  bank={bank}
                  onOpen={onOpenBank}
                  onExport={onExportBank}
                  onDelete={onDeleteBank}
                />
              ))}
        </section>
      )}
    </AppShell>
  )
}
