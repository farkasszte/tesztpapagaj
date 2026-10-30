import type { PersistentStorageStatus } from './durable-storage'
import { AppShell } from './app-shell'
import { useT } from './i18n'

const SUPPORT_EMAIL = 'farkas.szte@gmail.com'

export function AboutPage({
  persistentStorage,
}: {
  persistentStorage: PersistentStorageStatus
}) {
  const t = useT()
  return (
    <AppShell
      crumbs={[{ label: t('nav.home'), href: '/' }, { label: t('site.about.title') }]}
      persistentStorage={persistentStorage}
    >
      <div className="site-prose">
        <h1>{t('site.about.title')}</h1>
        <p className="site-lede">{t('site.about.lede')}</p>

        <section className="site-card">
          <div className="site-card-heading">
            <h2>{t('site.about.whyTitle')}</h2>
          </div>
          <p>{t('site.about.whyBody')}</p>
        </section>

        <section className="site-card">
          <h2>{t('site.about.promiseTitle')}</h2>
          <ul className="site-promise">
            <li>
              <strong>{t('site.about.promise1Lead')}</strong> {t('site.about.promise1')}
            </li>
            <li>
              <strong>{t('site.about.promise2Lead')}</strong> {t('site.about.promise2')}
            </li>
            <li>
              <strong>{t('site.about.promise3Lead')}</strong> {t('site.about.promise3')}
            </li>
          </ul>
        </section>

        <section className="site-card">
          <h2>{t('site.about.sourceTitle')}</h2>
          <p>{t('site.about.sourceBody')}</p>
        </section>

        <section className="site-card">
          <h2>{t('site.about.feedbackTitle')}</h2>
          <p>{t('site.about.feedbackBody')}</p>
          <a
            className="site-button"
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('site.about.mailSubject'))}`}
          >
            {t('site.about.emailCta', { email: SUPPORT_EMAIL })}
          </a>
        </section>
      </div>
    </AppShell>
  )
}

export function PrivacyPage({
  persistentStorage,
}: {
  persistentStorage: PersistentStorageStatus
}) {
  const t = useT()
  return (
    <AppShell
      crumbs={[{ label: t('nav.home'), href: '/' }, { label: t('site.privacy.title') }]}
      persistentStorage={persistentStorage}
    >
      <div className="site-prose">
        <h1>{t('site.privacy.title')}</h1>
        <p className="site-lede">{t('site.privacy.lede')}</p>

        <section className="site-card">
          <p>{t('site.privacy.body1')}</p>
          <p>{t('site.privacy.body2')}</p>
          <p>
            {t('site.privacy.contactLead')}{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('site.privacy.mailSubject'))}`}
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </AppShell>
  )
}
