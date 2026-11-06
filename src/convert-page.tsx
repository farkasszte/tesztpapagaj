import { ImportFileDrop } from './import-file-drop'
import { LandingHeader } from './landing-page'
import { Footer, Link } from './site-chrome'
import { t } from './i18n/index'

/**
 * The second onboarding page, for a teacher with a test already in hand. It
 * asks for one thing, the test, as Imports does for a new import — and takes
 * the file the AI gives back the same way.
 */
export function ConvertPage({
  dropped,
  onOpenImport,
}: {
  dropped: { file: File; id: number } | null
  onOpenImport: (file: File, waitingImportId?: string) => void
}) {
  return (
    <div className="landing landing--onboarding landing--convert">
      <LandingHeader>
        <Link href="/get-started" className="site-link">
          {t('common.back')}
        </Link>
        <Link href="/about" className="site-link">
          {t('nav.about')}
        </Link>
      </LandingHeader>

      <main className="convert">
        <div className="convert-head">
          <h1>{t('convert.title')}</h1>
          <p className="landing-lede">
            {t('convert.lede')}
          </p>
        </div>

        <div className="convert-body">
          <ImportFileDrop dropped={dropped} onOpenImport={onOpenImport} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
