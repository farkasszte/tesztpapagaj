import { useLayoutEffect, useRef } from 'react'
import { exportTime } from './export-time'
import type { ExportRecord } from './export-preparation'
import { countOf, t } from '../i18n/index'

// A few names, then how many more, so a long batch keeps its card short.
function versionsLabel(versions: readonly string[]): string {
  const shown = versions.slice(0, 2).join(', ')
  return versions.length > 2 ? `${shown} +${versions.length - 2}` : shown
}

function selectionLabel(record: ExportRecord): string {
  if (record.selection.test && record.selection.answerKey) {
    return t('export.studentTestAndKey')
  }
  return record.selection.test ? t('export.studentTest') : t('export.answerKey')
}

export function ExportHistoryDrawer({
  records,
  selectedRecordId,
  open,
  onOpenChange,
  onSelect,
}: {
  records: readonly ExportRecord[]
  selectedRecordId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (record: ExportRecord, number: number) => void
}) {
  const drawer = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    drawer.current?.querySelector<HTMLElement>('.export-history-item, button')?.focus()
  }, [open])

  return (
    <aside
      className="export-history-drawer"
      id="export-history"
      aria-label={t('export.historyTitle')}
      aria-hidden={!open}
      hidden={!open}
      ref={drawer}
      tabIndex={-1}
    >
      <header className="export-history-header">
        <div>
          <h2>{t('ui.exportHistory')}</h2>
          <p>{t('export.historyEmpty')}</p>
        </div>
        <button
          type="button"
          className="toolbar-icon-button"
          aria-label={t('export.closeHistory')}
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
      </header>
      {records.length === 0 ? (
        <p className="export-history-empty">{t('export.historyHint')}</p>
      ) : (
        <ol className="export-history-list">
          {records.map((record, index) => ({ record, number: index + 1 })).reverse().map(({ record, number }) => (
            <li key={record.id}>
              <button
                type="button"
                className="export-history-item export-history-item"
                aria-current={selectedRecordId === record.id ? 'page' : undefined}
                onClick={() => onSelect(record, number)}
              >
                <strong>{record.capturedName}</strong>
                <span>Export #{number}</span>
                <time dateTime={record.createdAt}>{exportTime(record.createdAt)}</time>
                <span>{record.format.toUpperCase()} · {selectionLabel(record)}</span>
                {record.versions && (
                  <span className="export-history-versions">
                    {record.versions.length === 1 ? 'Version' : `${record.versions.length} Versions`}: {versionsLabel(record.versions)}
                  </span>
                )}
                <span>
                  {countOf(record.questionCount, 'question')}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
