import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n/index'
import { MAX_FOLDER_NAME } from './folders'

export function FolderDialog({
  title,
  initialValue = '',
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  initialValue?: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const t = useT()
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') onCancel()
      }}
    >
      <section
        className="destructive-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = name.trim()
            if (trimmed) onConfirm(trimmed)
          }}
        >
          <div style={{ margin: '16px 0' }}>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('folder.namePlaceholder')}
              maxLength={MAX_FOLDER_NAME}
              className="export-field"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cdb9a6',
                background: '#fffdf8',
                color: '#241c17',
                fontSize: '14px',
              }}
            />
          </div>
          <footer className="destructive-dialog-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!name.trim()}
            >
              {confirmLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}
