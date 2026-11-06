import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { examDeletionMessage } from './exam-deletion'
import type { ExamDeletionSummary } from './exam-deletion'
import type { QuestionDeletionImpact, QuestionUsage } from './exam-workspaces'
import type { QuestionBankCollectionItem } from './resource-collections'
import { useT } from './i18n'

/**
 * A visszafordíthatatlan műveletek megerősítő ablakai.
 *
 * Mind a négy ugyanarra a vázra épül: cím, a következmények felsorolása, Mégse
 * és a művelet gombja. A fókusz a művelet gombján indul, a Tab az ablakon belül
 * marad, az Escape zár — a törlés közben viszont nem, mert a kérés már úton van.
 */

export function DestructiveConfirmation({ label, title, children, confirmLabel, onCancel, onConfirm }: {
  label: string
  title: string
  children: ReactNode
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const t = useT()
  const titleId = useId()
  const dialog = useRef<HTMLElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('button')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onCancel()
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
      if (controls.length === 0) return
      const first = controls[0]!
      const last = controls.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus() })
    }
  }, [deleting, onCancel])
  return createPortal(<div className="dialog-backdrop" role="presentation" onKeyDown={(event) => {
    event.stopPropagation()
    if (event.key === 'Escape' && !deleting) onCancel()
  }}>
    <section ref={dialog} className="destructive-dialog" role="dialog" aria-modal="true" aria-label={label} aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {children}
      {error && <p className="dialog-save-error" role="alert">{error}</p>}
      <footer className="destructive-dialog-actions">
        <button type="button" className="secondary-button" disabled={deleting} onClick={onCancel}>{t('common.cancel')}</button>
        <button type="button" className="danger-button" disabled={deleting} onClick={() => {
          setDeleting(true)
          setError(null)
          void onConfirm().catch((reason) => {
            setError(reason instanceof Error ? reason.message : t('editor.deleteFailed'))
            setDeleting(false)
          })
        }}>{deleting ? t('common.deleting') : confirmLabel}</button>
      </footer>
    </section>
  </div>, document.body)
}

export function QuestionDeletionConfirmation({ usage, onCancel, onConfirm }: {
  usage: readonly QuestionUsage[]
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const t = useT()
  const count = usage.length
  return <DestructiveConfirmation
    label={t('editor.deleteQuestionPermanent')}
    title={t('editor.deleteQuestionTitle')}
    confirmLabel={count === 0 ? t('editor.deleteQuestion') : t(count === 1 ? 'editor.deleteAndRemoveOne' : 'editor.deleteAndRemoveMany', { count })}
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    <p>{t('common.cannotBeUndone')}</p>
    {count === 0 ? <p>{t('editor.questionUnused')}</p> : <>
      <p>{t('editor.questionRemovedFrom')}</p>
      <ul>{usage.map((item) => <li key={item.examId}>{item.title}</li>)}</ul>
    </>}
  </DestructiveConfirmation>
}

export function BankDeletionConfirmation({ bank, impact, onCancel, onConfirm }: {
  bank: QuestionBankCollectionItem
  impact: readonly QuestionDeletionImpact[]
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const t = useT()
  return <DestructiveConfirmation
    label={t('bank.deletePermanent')}
    title={t('bank.deleteTitle', { name: bank.name })}
    confirmLabel={t('bank.delete')}
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    <p>{t('common.cannotBeUndone')}</p>
    {bank.questionCount === 0 ? <p>{t('bank.deleteEmpty')}</p> : <>
      <p>{t(bank.questionCount === 1 ? 'bank.deleteOne' : 'bank.deleteMany', { count: bank.questionCount })}</p>
      {/* Ha egy dolgozat sem használja, nincs mit felsorolni. */}
      {impact.length > 0 && (
        <>
          <p>{t(impact.length === 1 ? 'bank.impactOne' : 'bank.impactMany', { count: impact.length })}</p>
          <ul>{impact.map((item) => <li key={item.examId}>{t(item.questionCount === 1 ? 'bank.impactLineOne' : 'bank.impactLineMany', { title: item.title, count: item.questionCount })}</li>)}</ul>
        </>
      )}
      <p><strong>{t('bank.exportHistoryUnchanged')}</strong> {t('bank.exportHistoryStays')}</p>
    </>}
  </DestructiveConfirmation>
}

/** Deleting an Exam takes its Export History with it (ADR-0047). */
export function ExamDeletionConfirmation({ summary, onCancel, onConfirm }: {
  summary: ExamDeletionSummary
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const t = useT()
  const message = examDeletionMessage(summary)
  return <DestructiveConfirmation
    label={t('exam.delete')}
    title={message.title}
    confirmLabel={t('exam.delete')}
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    <p>{message.body}</p>
  </DestructiveConfirmation>
}
