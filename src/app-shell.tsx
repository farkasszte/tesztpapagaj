import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChartNoAxesColumn, CircleQuestionMark, FileText, House, Import, Library, PartyPopper, Settings, X } from 'lucide-react'
import { AccountBadge, SETTINGS_PATH } from './account-menu'
import { APP_NAME, useT, type TextKey } from './i18n'
import type { PersistentStorageStatus } from './durable-storage'
import { Footer, Link } from './site-chrome'
import { SUPPORT_EMAIL } from './support-email'
import { useRoute } from './use-route'

/**
 * The utility-app chrome every page outside the editor wears: a fixed left nav
 * naming the resource destinations, breadcrumbs across the top, and the page
 * itself in between. The editor keeps its own full-width document bar and is
 * reached by opening or creating an Exam rather than by a separate nav entry.
 */

export type Crumb = { label: string; href?: string }

const NAV = [
  { href: '/', labelKey: 'shell.home', Icon: House },
  { href: '/exams', labelKey: 'shell.exams', Icon: FileText },
  { href: '/question-banks', labelKey: 'shell.questionBanks', Icon: Library },
  { href: '/jatek', labelKey: 'shell.game', Icon: PartyPopper },
  { href: '/eredmenyek', labelKey: 'shell.results', Icon: ChartNoAxesColumn },
  { href: '/imports', labelKey: 'shell.imports', Icon: Import },
] as const satisfies readonly { href: string; labelKey: TextKey; Icon: typeof House }[]


/**
 * The one way to reach a person. It lives at the foot of the nav, out of the
 * way of the work but on every page, and says a single thing when opened.
 */
function HelpDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const titleId = useId()
  const dialog = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])
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
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus() })
    }
  }, [])
  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        ref={dialog}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="resource-picker-header">
          <h2 id={titleId}>{t('shell.helpTitle')}</h2>
          <button
            type="button"
            className="question-bank-action"
            aria-label={t('shell.helpClose')}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <p>
          {t('shell.helpBodyBefore')}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(APP_NAME)}`}>
            {SUPPORT_EMAIL}
          </a>
          {t('shell.helpBodyAfter')}
        </p>
      </section>
    </div>,
    document.body,
  )
}

function HelpButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="help-button"
        aria-label={t('shell.help')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <CircleQuestionMark aria-hidden="true" />
      </button>
      {open && <HelpDialog onClose={() => setOpen(false)} />}
    </>
  )
}

export function AppShell({
  crumbs,
  persistentStorage,
  actions,
  children,
}: {
  crumbs: readonly Crumb[]
  persistentStorage: PersistentStorageStatus
  /** Page-level actions, shown in the top bar beside the storage badge. */
  actions?: ReactNode
  children: ReactNode
}) {
  const route = useRoute()
  const t = useT()
  return (
    <div className="app-shell">
      <aside className="app-nav">
        <Link href="/" className="site-wordmark app-nav-brand">
          <img className="app-logo" src="/logo.svg" alt="" width={36} height={36} />
          {APP_NAME}
        </Link>
        <nav aria-label={t('shell.sections')}>
          <ul className="app-nav-list">
            {NAV.map(({ href, labelKey, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="app-nav-link"
                  {...(route === href || (href === '/imports' && route === '/import') ? { 'aria-current': 'page' } : {})}
                >
                  <Icon aria-hidden="true" />
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="app-nav-foot">
          <HelpButton />
          <Link
            href={SETTINGS_PATH}
            className="app-nav-link"
            {...(route === SETTINGS_PATH ? { 'aria-current': 'page' } : {})}
          >
            <Settings aria-hidden="true" />
            {t('shell.settings')}
          </Link>
        </div>
      </aside>
      <div className="app-frame">
        <header className="app-topbar">
          <nav aria-label={t('shell.breadcrumb')}>
            <ol className="breadcrumbs">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1
                return (
                  <li key={crumb.label}>
                    {crumb.href && !last ? (
                      <Link href={crumb.href}>{crumb.label}</Link>
                    ) : (
                      <span {...(last ? { 'aria-current': 'page' as const } : {})}>
                        {crumb.label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
          <div className="app-topbar-actions">
            {actions}
            <AccountBadge status={persistentStorage} />
          </div>
        </header>
        <main className="app-main">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
