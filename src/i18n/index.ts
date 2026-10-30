// Tesztpapagáj: a magyar változat módosítása (lásd NOTICE.md)
/**
 * Minden látható szöveg, nyelvenként.
 *
 * Az angol a forrás: a kulcsai alkotják a típust, tehát hiányzó fordítás
 * típushiba, nem üres felirat. A magyar a szállított nyelv, de a választóval
 * angolra is át lehet állni (és a böngésző nyelvét is követi, ha az angol).
 *
 * A szótáron kívül felirat nem maradhat a komponensekben: ha szöveget látsz a
 * felületen, azt itt keresd.
 */
import { useSyncExternalStore } from 'react'

/** A termék neve. Márkanév, ezért nem fordítjuk. */
export const APP_NAME = 'Tesztpapagáj'

const en = {
  // --- héj: navigáció, súgó, lábléc
  'shell.home': 'Home',
  'shell.exams': 'Exams',
  'shell.questionBanks': 'Question Banks',
  'shell.imports': 'Imports',
  'shell.settings': 'Settings',
  'shell.sections': 'Sections',
  'shell.breadcrumb': 'Breadcrumb',
  'shell.help': 'Help',
  'shell.helpClose': 'Close help',
  'shell.helpTitle': 'Need a hand?',
  'shell.helpBodyBefore': 'If you’re running into trouble or have suggestions, email us at ',
  'shell.helpBodyAfter': '.',
  'shell.logoAlt': 'Home',

  'footer.credit': 'Made by teacher.dev',
  'footer.about': 'about',
  'footer.privacy': 'privacy',

  // --- kezdőlap
  'home.pickUp': 'Pick up where you left off',
  'home.recentExams': 'Recent Exams',
  'home.newExam': 'New Exam',
  'home.import': 'Import',
  'home.questionBanks': 'Question Banks',
  'home.newBank': 'New Question Bank',

  // --- nyitóoldal
  'landing.howItWorks': 'How it works',
  'landing.about': 'About',
  'landing.home': 'Home',
  'landing.getStarted': 'Get started',
  'landing.getStartedFree': 'Get started — it’s free',
  'landing.siteNav': 'Site',
  'landing.sourcePdf': 'last-year.pdf',
  'landing.sourcePhoto': 'photo of a worksheet',
  'landing.sourceScan': 'scanned quiz',
  'landing.sourceDocx': 'unit-3-test.docx',
  'landing.sourceImage': 'a diagram',
  'landing.heroTitle': 'Turn anything into an exam.',
  'landing.heroLede':
    'PDFs, scans, screenshots, old Word documents, questions you type yourself — {app} gathers them into Question Banks and lays them out as a clean, printable exam.',
  'landing.fineprint': 'Runs in your browser. Nothing to install, no account to make.',
  'landing.heroSheetTitle': 'Unit 3 Test',
  'landing.heroSheetMeta': 'Name ______  Date ____',
  'landing.stepGatherTitle': 'Gather your questions',
  'landing.stepGatherText':
    'Write them in the editor, or hand a test you already have — a PDF, a scan, a screenshot — to an AI with our instructions and import the file it gives back.',
  'landing.stepBankTitle': 'Keep them in a Question Bank',
  'landing.stepBankText':
    'Every question gets a topic and a difficulty, so the one you want is a filter away. A bank is yours to reuse in as many exams as you like.',
  'landing.stepDragTitle': 'Drag them into an Exam',
  'landing.stepDragText':
    'Pull questions from any bank onto the page. Reorder them, shuffle the questions or the answers, and make a second version in a click.',
  'landing.stepPrintTitle': 'Print it',
  'landing.stepPrintText':
    'Send it to the printer, or download it as a PDF or a Word document. Every export is kept, so the version you handed out is always there.',
  'landing.localTitle': 'We’re completely local.',
  'landing.localText':
    '{app} runs entirely in your browser. Your exams, Question Banks and images are saved on your own device and never uploaded anywhere — there is no account, no server, and nothing to sign up for.',

  // --- első indítás
  'onboarding.title': 'Let’s make your first Question Bank',
  'onboarding.lede':
    'Exams in {app} are built from Questions, and Questions live in a Question Bank. So the first thing to make is a bank — write it yourself, or convert materials you already have.',
  'onboarding.writeTitle': 'Write it myself',
  'onboarding.writeText':
    'Open an empty Question Bank and add questions in the editor, one at a time.',
  'onboarding.newBank': 'New Question Bank',
  'onboarding.convertTitle': 'Convert what I already have',
  'onboarding.convertText':
    'Give a PDF, scan or screenshot to an AI with our instructions, then import the file it produces.',
  'onboarding.convertTest': 'Convert a test',
  'onboarding.skipBefore': 'Or skip ahead — ',
  'onboarding.skipBlank': 'start with a blank Exam',
  'onboarding.skipAfter': ' and make a bank from inside the editor.',

  // --- beállítások
  'settings.title': 'Settings',
  'settings.lede': 'Your work is saved in this browser. Keep a copy by exporting it.',
  'settings.language': 'Language',
  'settings.languageHint':
    'The language of the interface. The questions you write stay exactly as you typed them.',

  // --- indításkori hibák
  'errors.backupRestore':
    'The backup could not be restored, so nothing in this browser was changed.',
  'errors.bankUnavailable': 'That Question Bank is unavailable on this device.',
  'errors.examUnavailable': 'That Exam is unavailable on this device.',
} as const

export type TextKey = keyof typeof en

const hu: Record<TextKey, string> = {
  'shell.home': 'Kezdőlap',
  'shell.exams': 'Dolgozatok',
  'shell.questionBanks': 'Kérdésbankok',
  'shell.imports': 'Importok',
  'shell.settings': 'Beállítások',
  'shell.sections': 'Szakaszok',
  'shell.breadcrumb': 'Morzsamenü',
  'shell.help': 'Súgó',
  'shell.helpClose': 'Súgó bezárása',
  'shell.helpTitle': 'Segíthetünk?',
  'shell.helpBodyBefore': 'Ha elakadtál, vagy ötleted van, írj ide: ',
  'shell.helpBodyAfter': '.',
  'shell.logoAlt': 'Kezdőlap',

  'footer.credit': 'Készítette: teacher.dev',
  'footer.about': 'a projektről',
  'footer.privacy': 'adatvédelem',

  'home.pickUp': 'Folytasd ott, ahol abbahagytad',
  'home.recentExams': 'Legutóbbi dolgozatok',
  'home.newExam': 'Új dolgozat',
  'home.import': 'Importálás',
  'home.questionBanks': 'Kérdésbankok',
  'home.newBank': 'Új kérdésbank',

  'landing.howItWorks': 'Hogyan működik',
  'landing.about': 'A projektről',
  'landing.home': 'Kezdőlap',
  'landing.getStarted': 'Kezdés',
  'landing.getStartedFree': 'Kezdés — ingyen van',
  'landing.siteNav': 'Oldal',
  'landing.sourcePdf': 'tavalyi-dolgozat.pdf',
  'landing.sourcePhoto': 'fénykép egy munkalapról',
  'landing.sourceScan': 'beszkennelt röpdolgozat',
  'landing.sourceDocx': '3-temazaro.docx',
  'landing.sourceImage': 'egy ábra',
  'landing.heroTitle': 'Alakíts bármit dolgozattá.',
  'landing.heroLede':
    'PDF-ek, beszkennelt lapok, képernyőképek, régi Word-dokumentumok, saját kérdések — a {app} kérdésbankokba gyűjti őket, és rendezett, nyomtatható dolgozattá állítja össze.',
  'landing.fineprint': 'A böngésződben fut. Nem kell telepíteni, és fiók sem kell hozzá.',
  'landing.heroSheetTitle': '3. témazáró',
  'landing.heroSheetMeta': 'Név ______  Dátum ____',
  'landing.stepGatherTitle': 'Gyűjtsd össze a kérdéseket',
  'landing.stepGatherText':
    'Írd meg őket a szerkesztőben, vagy adj oda egy meglévő dolgozatot — PDF-et, beszkennelt lapot, képernyőképet — egy AI-nak az útmutatónkkal, majd importáld a visszakapott fájlt.',
  'landing.stepBankTitle': 'Tartsd őket kérdésbankban',
  'landing.stepBankText':
    'Minden kérdés kap témát és nehézséget, így a keresett kérdés egy szűrőnyire van. A bankot akárhány dolgozatban újra felhasználhatod.',
  'landing.stepDragTitle': 'Húzd őket dolgozatba',
  'landing.stepDragText':
    'Húzz kérdéseket bármelyik bankból az oldalra. Rendezd át őket, keverd a kérdéseket vagy a válaszokat, és egy kattintással csinálj második változatot.',
  'landing.stepPrintTitle': 'Nyomtasd ki',
  'landing.stepPrintText':
    'Küldd nyomtatóra, vagy töltsd le PDF-ként vagy Word-dokumentumként. Minden export megmarad, így a kiosztott változat mindig kéznél van.',
  'landing.localTitle': 'Teljesen helyi.',
  'landing.localText':
    'A {app} teljes egészében a böngésződben fut. A dolgozataid, a kérdésbankjaid és a képek a saját eszközödön maradnak, és nem kerülnek fel sehová — nincs fiók, nincs szerver, nincs regisztráció.',

  'onboarding.title': 'Készítsük el az első kérdésbankodat',
  'onboarding.lede':
    'A {app} dolgozatai kérdésekből épülnek fel, a kérdések pedig kérdésbankban laknak. Ezért először egy bankot érdemes csinálni — írd meg magad, vagy alakítsd át, amid már van.',
  'onboarding.writeTitle': 'Magam írom meg',
  'onboarding.writeText':
    'Nyiss egy üres kérdésbankot, és tedd bele a kérdéseket a szerkesztőben, egyenként.',
  'onboarding.newBank': 'Új kérdésbank',
  'onboarding.convertTitle': 'Ami már van, alakítsuk át',
  'onboarding.convertText':
    'Adj oda egy PDF-et, beszkennelt lapot vagy képernyőképet egy AI-nak az útmutatónkkal, majd importáld a kapott fájlt.',
  'onboarding.convertTest': 'Dolgozat átalakítása',
  'onboarding.skipBefore': 'Vagy vágjunk a közepébe — ',
  'onboarding.skipBlank': 'kezdj üres dolgozattal',
  'onboarding.skipAfter': ', és készíts bankot a szerkesztőből.',

  'settings.title': 'Beállítások',
  'settings.lede': 'A munkád ebben a böngészőben van elmentve. Másolatot exportálással készíthetsz.',
  'settings.language': 'Nyelv',
  'settings.languageHint':
    'A felület nyelve. A kérdéseid szövege pontosan úgy marad, ahogy beírtad.',

  'errors.backupRestore':
    'A biztonsági mentést nem sikerült visszaállítani, ezért ebben a böngészőben semmi nem változott.',
  'errors.bankUnavailable': 'Ez a kérdésbank nem érhető el ezen az eszközön.',
  'errors.examUnavailable': 'Ez a dolgozat nem érhető el ezen az eszközön.',
}

const LANGUAGES = { en, hu } as const
export type LanguageCode = keyof typeof LANGUAGES

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  hu: 'Magyar',
}

const STORAGE_KEY = 'tesztpapagaj:language'
let current: LanguageCode = 'hu'
const listeners = new Set<() => void>()

type Vars = Record<string, string | number>

function fill(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  )
}

/**
 * A választott nyelv, indításkor egyszer. A böngésző nyelvét szándékosan nem
 * követjük: magyar tanár gépe gyakran angol Windowson fut, és attól még
 * magyarul kell indulnia. A váltás egy kattintás, és meg is jegyzi.
 */
export function initializeLanguage(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'hu') apply(saved)
  } catch {
    // Privát böngészés: a magyar marad, és a választó akkor is működik.
  }
}

function apply(code: LanguageCode): void {
  current = code
  if (typeof document !== 'undefined') document.documentElement.lang = code
  listeners.forEach((listener) => listener())
}

export function getLanguage(): LanguageCode {
  return current
}

export function setLanguage(code: LanguageCode): void {
  apply(code)
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // A választás így is él, csak a következő indításig.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Fordítás komponensen kívülről is (export, nyomtatás, fájlnevek). */
export function t(key: TextKey, vars: Vars = {}): string {
  const dictionary = LANGUAGES[current]
  return fill(dictionary[key] ?? en[key], vars)
}

/**
 * A `t` React-változata: nyelvváltáskor újrarendereli a komponenst. Minden
 * komponens ezt hívja, ne a nyers `t`-t, különben a váltás nem látszana.
 */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLanguage, getLanguage)
  return t
}
