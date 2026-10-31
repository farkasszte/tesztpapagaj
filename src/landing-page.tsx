import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowRight,
  Camera,
  FileText,
  FileType,
  Image,
  Library,
  MousePointer2,
  NotebookPen,
  PencilLine,
  Printer,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import { APP_NAME, useT, type TextKey } from './i18n'
import { Footer, Link } from './site-chrome'
import { markWelcomed } from './welcomed'

/**
 * The front door. A visitor who has never made anything here lands on this
 * page rather than on the resume shelves of Home, because there is nothing to
 * resume yet and everything to explain: a hero, how it works, and where the
 * work lives. Every "Get started" on it leads to the same short onboarding,
 * which is the one place the app says out loud that an Exam is built from a
 * Question Bank. Neither page wears the dashboard shell — there is no
 * breadcrumb to a place you have not been.
 */

const GET_STARTED = '/get-started'

function GetStartedButton({
  children,
  className = 'landing-cta',
}: {
  children?: ReactNode
  className?: string
}) {
  const t = useT()
  return (
    <Link href={GET_STARTED} className={className}>
      {children ?? t('landing.getStartedFree')}
      <ArrowRight aria-hidden="true" />
    </Link>
  )
}

export function LandingHeader({ children }: { children?: ReactNode }) {
  const t = useT()
  return (
    <header className="landing-header">
      <Link href="/welcome" className="site-wordmark">
        <img className="app-logo" src="/logo.svg" alt="" width={36} height={36} />
        {APP_NAME}
      </Link>
      <nav className="landing-nav" aria-label={t('landing.siteNav')}>
        {children}
      </nav>
    </header>
  )
}

/**
 * The picture the headline makes: one exam sheet in the middle, and the
 * places a question can come from feeding into it. The sources are real
 * things a teacher has lying around, drawn as the files they are; the lines
 * are drawn once in SVG behind them so the cards can be ordinary HTML.
 */
const SOURCES = [
  { key: 'pdf', labelKey: 'landing.sourcePdf', Icon: FileText, x: 2, y: 8, tilt: -4 },
  { key: 'photo', labelKey: 'landing.sourcePhoto', Icon: Camera, x: 0, y: 62, tilt: 3 },
  { key: 'scan', labelKey: 'landing.sourceScan', Icon: ScanLine, x: 70, y: 4, tilt: 3 },
  { key: 'docx', labelKey: 'landing.sourceDocx', Icon: FileType, x: 66, y: 56, tilt: -3 },
  { key: 'image', labelKey: 'landing.sourceImage', Icon: Image, x: 36, y: 86, tilt: 2 },
] as const satisfies readonly {
  key: string
  labelKey: TextKey
  Icon: typeof FileText
  x: number
  y: number
  tilt: number
}[]

function HeroArt() {
  const t = useT()
  return (
    <div className="hero-art" aria-hidden="true">
      <svg className="hero-art-lines" viewBox="0 0 560 480" fill="none">
        <path d="M118 62 C 170 70, 190 110, 210 128" />
        <path d="M112 328 C 150 330, 180 300, 208 282" />
        <path d="M440 44 C 400 66, 380 100, 352 128" />
        <path d="M440 290 C 410 292, 385 276, 352 262" />
        <path d="M280 418 C 280 400, 280 380, 280 366" />
      </svg>

      {SOURCES.map(({ key, labelKey, Icon, x, y, tilt }) => (
        <div
          key={key}
          className="hero-source"
          style={{ left: `${x}%`, top: `${y}%`, '--tilt': `${tilt}deg` } as CSSProperties}
        >
          <Icon />
          <span>{t(labelKey)}</span>
        </div>
      ))}

      <div className="hero-sheet">
        <div className="hero-sheet-head">
          <span className="hero-sheet-title">{t('landing.heroSheetTitle')}</span>
          <span className="hero-sheet-meta">{t('landing.heroSheetMeta')}</span>
        </div>
        <ol className="hero-sheet-questions">
          <li>
            <span className="hero-line" style={{ width: '92%' }} />
            <span className="hero-line" style={{ width: '64%' }} />
            <span className="hero-choices">
              <i>A</i><i>B</i><i>C</i><i>D</i>
            </span>
          </li>
          <li>
            <span className="hero-line" style={{ width: '78%' }} />
            <span className="hero-figure" />
            <span className="hero-choices">
              <i>A</i><i>B</i><i>C</i><i>D</i>
            </span>
          </li>
          <li>
            <span className="hero-line" style={{ width: '86%' }} />
            <span className="hero-line" style={{ width: '40%' }} />
            <span className="hero-answer" />
          </li>
        </ol>
      </div>
    </div>
  )
}

const STEPS = [
  {
    titleKey: 'landing.stepGatherTitle',
    textKey: 'landing.stepGatherText',
    Icon: Sparkles,
  },
  {
    titleKey: 'landing.stepBankTitle',
    textKey: 'landing.stepBankText',
    Icon: Library,
  },
  {
    titleKey: 'landing.stepDragTitle',
    textKey: 'landing.stepDragText',
    Icon: MousePointer2,
  },
  {
    titleKey: 'landing.stepPrintTitle',
    textKey: 'landing.stepPrintText',
    Icon: Printer,
  },
] as const satisfies readonly { titleKey: TextKey; textKey: TextKey; Icon: typeof Sparkles }[]

export function LandingPage({ returning }: {
  /** Whether there is work on this device to go back to. Only the header
   * changes: a visitor with Exams already has a Home, and is offered it. */
  returning: boolean
}) {
  const t = useT()
  return (
    <div className="landing">
      <LandingHeader>
        <a href="#how-it-works" className="site-link">
          {t('landing.howItWorks')}
        </a>
        <Link href="/about" className="site-link">
          {t('landing.about')}
        </Link>
        {returning && (
          <Link href="/" className="site-link">
            {t('landing.home')}
          </Link>
        )}
        <GetStartedButton className="landing-cta landing-cta--small">
          {t('landing.getStarted')}
        </GetStartedButton>
      </LandingHeader>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1>{t('landing.heroTitle')}</h1>
            <p className="landing-lede">{t('landing.heroLede', { app: APP_NAME })}</p>
            <GetStartedButton />
            <p className="landing-fineprint">{t('landing.fineprint')}</p>
          </div>
          <HeroArt />
        </section>

        <section className="landing-band" id="how-it-works" aria-labelledby="how-it-works-heading">
          <div className="landing-section">
            <h2 id="how-it-works-heading">{t('landing.howItWorks')}</h2>
            <ol className="landing-steps">
              {STEPS.map(({ titleKey, Icon, textKey }, index) => (
                <li key={titleKey} className="landing-step">
                  <span className="landing-step-mark">
                    <span className="landing-step-number">{index + 1}</span>
                    <Icon aria-hidden="true" />
                  </span>
                  <h3>{t(titleKey)}</h3>
                  <p>{t(textKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="local-heading">
          <div className="landing-local-card">
            <h2 id="local-heading">{t('landing.localTitle')}</h2>
            <p>{t('landing.localText', { app: APP_NAME })}</p>
            <GetStartedButton />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

/**
 * The one page between "Get started" and the app. Its job is a single
 * sentence — an Exam is built from a Question Bank — and the two ways to get
 * a first bank, with the blank Exam kept as the quiet way past it. Converting
 * has a page of its own, because it is a trip out of the app and back.
 */
export function OnboardingPage({
  onNewBank,
  onNewExam,
}: {
  onNewBank: () => void
  onNewExam: () => void
}) {
  const t = useT()
  useEffect(markWelcomed, [])
  return (
    <div className="landing landing--onboarding">
      <LandingHeader>
        <Link href="/about" className="site-link">
          {t('landing.about')}
        </Link>
      </LandingHeader>

      <main className="onboarding">
        <h1>{t('onboarding.title')}</h1>
        <p className="landing-lede">{t('onboarding.lede', { app: APP_NAME })}</p>

        <div className="onboarding-choices">
          <button type="button" className="onboarding-choice" onClick={onNewBank}>
            <PencilLine aria-hidden="true" />
            <strong>{t('onboarding.writeTitle')}</strong>
            <span>{t('onboarding.writeText')}</span>
            <em>{t('onboarding.newBank')}</em>
          </button>
          <Link href="/get-started/convert" className="onboarding-choice">
            <Sparkles aria-hidden="true" />
            <strong>{t('onboarding.convertTitle')}</strong>
            <span>{t('onboarding.convertText')}</span>
            <em>{t('onboarding.convertTest')}</em>
          </Link>
        </div>

        <p className="onboarding-skip">
          {t('onboarding.skipBefore')}
          <button type="button" className="onboarding-skip-button" onClick={onNewExam}>
            <NotebookPen aria-hidden="true" />
            {t('onboarding.skipBlank')}
          </button>
          {t('onboarding.skipAfter')}
        </p>
      </main>

      <Footer />
    </div>
  )
}
