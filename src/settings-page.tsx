import { BackupSettings } from './account-menu'
import { DriveSettings } from './storage/drive-settings'
import { AppShell } from './app-shell'
import type { PersistentStorageStatus } from './storage/durable-storage'
import { LANGUAGE_NAMES, getLanguage, setLanguage, useT, type LanguageCode } from './i18n'

/**
 * Where the teacher keeps a copy of their work — and, since this is a
 * translated build, where they choose the interface language. The choice is
 * remembered on the device; the questions themselves are never translated.
 */
export function SettingsPage({ persistentStorage }: { persistentStorage: PersistentStorageStatus }) {
  const t = useT()
  const current = getLanguage()
  return (
    <AppShell
      crumbs={[{ label: t('shell.home'), href: '/' }, { label: t('settings.title') }]}
      persistentStorage={persistentStorage}
    >
      <div className="site-prose">
        <h1>{t('settings.title')}</h1>
        <p className="site-lede">{t('settings.lede')}</p>

        <section className="site-card">
          <h2>{t('settings.language')}</h2>
          <p>{t('settings.languageHint')}</p>
          <div className="language-choice" role="group" aria-label={t('settings.language')}>
            {(Object.keys(LANGUAGE_NAMES) as LanguageCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className="language-choice-button"
                aria-pressed={current === code}
                onClick={() => setLanguage(code)}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
        </section>

        <BackupSettings status={persistentStorage} />

        <DriveSettings />
      </div>
    </AppShell>
  )
}
