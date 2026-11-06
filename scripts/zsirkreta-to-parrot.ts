/**
 * Zsírkréta → Tesztpapagáj kérdésbank-csomag.
 *
 * Egy Zsírkréta-vizsga = egy Tesztpapagáj kérdésbank, `.parrot.zip` fájlban, amit
 * a tanár a behozatalnál egyszerűen behúz. A csomagot a **Tesztpapagáj saját
 * írója** állítja elő (`prepareQuestionBankExport` + `writePackageZip`), tehát a
 * fájl szerkezete nem tud eltérni attól, amit az app be tud olvasni.
 *
 * Bemenet: Zsírkréta export (`{questions, exams}`, mint a `probavizsga.json`)
 * vagy a beépített minta. Kimenet: vizsgánként egy `.parrot.zip` + `osszefoglalo.json`.
 *
 * Futtatás (a repó gyökeréből):
 *   bun run script --help          — nincs ilyen; közvetlenül:
 *   bun scripts/zsirkreta-to-parrot.ts <bemenet.json> <kimeneti-mappa>
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ProseMirrorJSON, Question } from '../src/exam/exam'
import { DEFAULT_COLUMNS } from '../src/exam/exam'
import { prepareQuestionBankExport } from '../src/export/question-bank-export'
import {
  PACKAGE_FORMAT,
  PACKAGE_FORMAT_VERSION,
  type TestParrotPackage,
} from '../src/import/package-import'
import { writePackageZip } from '../src/import/package-zip'

/* ------------------------------------------------------------------------- */
/* A Zsírkréta alakjai (a forrás `types.ts`-ből)                              */
/* ------------------------------------------------------------------------- */

type ZQuestion = {
  id: string
  type: string
  question: string
  points?: number
  subject?: string
  data?: Record<string, unknown>
}
type ZExam = {
  id: string
  title: string
  description?: string
  questionIds?: string[]
  question_ids?: string[]
  createdAt?: number
}
type ZExport = { questions?: ZQuestion[]; exams?: ZExam[] }

/* ------------------------------------------------------------------------- */
/* Segédek: ProseMirror csomópontok, a Tesztpapagáj saját alakjaiban           */
/* ------------------------------------------------------------------------- */

const text = (value: string): ProseMirrorJSON => ({ type: 'text', text: value })
const paragraph = (...content: ProseMirrorJSON[]): ProseMirrorJSON =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }

/** Egy hosszú szöveget bekezdésekre törünk: a szerkesztő így tudja szerkeszteni. */
function blocks(value: string): ProseMirrorJSON[] {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  return lines.length === 0 ? [paragraph()] : lines.map((line) => paragraph(text(line)))
}

const choice = (id: string, correct: boolean, value: string): ProseMirrorJSON => ({
  type: 'multipleChoiceChoice',
  attrs: { correct, id },
  content: [paragraph(text(value))],
})

const mcDoc = (stem: ProseMirrorJSON[], choices: ProseMirrorJSON[]): ProseMirrorJSON => ({
  type: 'doc',
  content: [...stem, { type: 'multipleChoice', content: choices }],
})

function mcQuestion(id: string, stem: ProseMirrorJSON[], choices: ProseMirrorJSON[], points?: number): Question {
  return {
    id,
    type: 'multiple-choice',
    columns: DEFAULT_COLUMNS,
    doc: mcDoc(stem, choices),
    ...(typeof points === 'number' ? { points } : {}),
  }
}

/* ------------------------------------------------------------------------- */
/* Kérdéstípusonkénti leképezés                                               */
/* ------------------------------------------------------------------------- */

export type Mapped = { question: Question } | { skip: string }

/**
 * A válaszlehetőségek normalizálása. A Zsírkréta adatában két alak él egymás
 * mellett: `{options: string[], correct: index | index[]}` (a beépített minta és
 * a régi vizsgák) és `{options: [{text, isCorrect}]}` (a típusdefiníció).
 */
function choicesOf(data: Record<string, unknown> | undefined): { text: string; correct: boolean }[] {
  const raw = data?.options
  if (!Array.isArray(raw)) return []
  const correct = (data as { correct?: number | number[] } | undefined)?.correct
  const marked = new Set<number>(
    Array.isArray(correct) ? correct : typeof correct === 'number' ? [correct] : [],
  )
  return raw.map((option, index) => {
    if (typeof option === 'string') return { text: option, correct: marked.has(index) }
    const entry = option as { text?: string; isCorrect?: boolean }
    return { text: entry.text ?? '', correct: entry.isCorrect === true || marked.has(index) }
  })
}

export function mapQuestion(source: ZQuestion, index: number): Mapped {
  const id = `q${index + 1}`
  const stem = blocks(source.question ?? '')
  const points = typeof source.points === 'number' && source.points > 0 ? source.points : undefined
  const isMultiple = source.type === 'multiple' || source.type === 'multiple-error'

  switch (source.type) {
    case 'single':
    case 'single-error':
    case 'multiple':
    case 'multiple-error': {
      const options = choicesOf(source.data)
      if (options.length < 2) return { skip: 'nincs elég válaszlehetőség' }
      const correct = options.filter((option) => option.correct).length
      if (correct === 0) {
        // Véleménykérdés/szavazás: nincs helyes válasz, tehát nincs mit pontozni.
        return { skip: 'szavazás vagy véleménykérdés — nincs helyes válasz' }
      }
      // Ha csak egy helyes válasz van megjelölve, akkor ez a gyakorlatban egyszeres
      // választás, és úgy is játsszák: nem kényszerítjük „több helyes válasz” módba.
      const multipleAnswer = isMultiple && correct > 1
      return {
        question: {
          ...mcQuestion(
            id,
            stem,
            options.map((option, optionIndex) => choice(`${id}-${optionIndex + 1}`, option.correct, option.text)),
            points,
          ),
          ...(multipleAnswer ? { type: 'multiple-answer' as const } : {}),
        },
      }
    }

    case 'true-false': {
      const data = source.data as { isTrue?: boolean; correct?: number } | undefined
      const isTrue = typeof data?.isTrue === 'boolean' ? data.isTrue : data?.correct === 0 ? true : data?.correct === 1 ? false : undefined
      if (typeof isTrue !== 'boolean') return { skip: 'hiányzó igaz/hamis érték' }
      return {
        question: {
          id,
          type: 'true-false',
          columns: DEFAULT_COLUMNS,
          doc: mcDoc(stem, [choice(`${id}-t`, isTrue, 'Igaz'), choice(`${id}-f`, !isTrue, 'Hamis')]),
          ...(points ? { points } : {}),
        },
      }
    }

    case 'order': {
      const items = (source.data as { items?: string[] } | undefined)?.items ?? []
      if (items.length < 2) return { skip: 'a sorba rendezéshez kevesebb mint két elem van' }
      // A dokumentum sorrendje a helyes sorrend.
      return {
        question: {
          id,
          type: 'ordering',
          columns: DEFAULT_COLUMNS,
          doc: mcDoc(stem, items.map((item, itemIndex) => choice(`${id}-${itemIndex + 1}`, false, item))),
          ...(points ? { points } : {}),
        },
      }
    }

    case 'match': {
      const pairs = (source.data as { pairs?: { left: string; right: string }[] } | undefined)?.pairs ?? []
      if (pairs.length < 2) return { skip: 'a párosításhoz kevesebb mint két pár van' }
      const prompts = pairs.map((pair, pairIndex) => ({
        type: 'matchingPrompt',
        attrs: { id: `${id}-p${pairIndex + 1}`, answer: `${id}-a${pairIndex + 1}` },
        content: [paragraph(text(pair.left))],
      }))
      const answers = pairs.map((pair, pairIndex) => ({
        type: 'matchingAnswer',
        attrs: { id: `${id}-a${pairIndex + 1}` },
        content: [paragraph(text(pair.right))],
      }))
      return {
        question: {
          id,
          type: 'matching',
          columns: DEFAULT_COLUMNS,
          doc: { type: 'doc', content: [...stem, { type: 'matching', content: [...prompts, ...answers] }] },
          ...(points ? { points } : {}),
        },
      }
    }

    case 'text': {
      const accepted = (source.data as { acceptedAnswers?: string[] } | undefined)?.acceptedAnswers ?? []
      const suggestions = accepted.filter((entry) => entry.trim().length > 0)
      if (suggestions.length === 0) return { skip: 'nincs elfogadható válasz' }
      return {
        question: {
          id,
          type: 'open',
          columns: DEFAULT_COLUMNS,
          doc: { type: 'doc', content: stem },
          // A rövid válasz javasolt megoldása: az összes elfogadott alak, soronként.
          suggestedAnswer: { type: 'doc', content: suggestions.map((entry) => paragraph(text(entry))) },
          ...(points ? { points } : {}),
        },
      }
    }

    default:
      return { skip: `a(z) „${source.type}” típusnak nincs megfelelője` }
  }
}

/* ------------------------------------------------------------------------- */
/* Vizsga → kérdésbank → `.parrot.zip`                                        */
/* ------------------------------------------------------------------------- */

export type Converted = {
  exam: string
  bank: string
  /** Melyik csomagba került (a fájl neve), vagy null, ha nincs mit beolvasni. */
  file: string | null
  kept: number
  skipped: { question: string; reason: string }[]
}

export type Conversion = {
  report: Converted[]
  /** A megírt csomagok: fájlnév → hány bank van benne. */
  packages: { file: string; banks: number; questions: number }[]
  total: { exams: number; kept: number; skipped: number }
}

/** Egy csomagban ennyi kérdésbank lehet (a behozatal felső korlátja 100). */
export const BANKS_PER_PACKAGE = 100

const slug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'vizsga'

export async function convert(
  source: ZExport,
  output: string,
  options: { now?: Date; perPackage?: number } = {},
): Promise<Conversion> {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  const perPackage = Math.max(1, Math.min(BANKS_PER_PACKAGE, options.perPackage ?? BANKS_PER_PACKAGE))
  const byId = new Map((source.questions ?? []).map((question) => [question.id, question]))
  const exams = source.exams ?? []
  await mkdir(output, { recursive: true })

  const report: Converted[] = []
  const banks: { id: string; name: string; questions: Question[] }[] = []
  const usedIds = new Set<string>()

  for (const exam of exams) {
    const ids = exam.questionIds ?? exam.question_ids ?? []
    const sources = ids.map((id) => byId.get(id)).filter((entry): entry is ZQuestion => Boolean(entry))
    const kept: Question[] = []
    const skipped: { question: string; reason: string }[] = []
    sources.forEach((question, index) => {
      const mapped = mapQuestion(question, index)
      if ('skip' in mapped) {
        skipped.push({ question: (question.question ?? '').slice(0, 80), reason: mapped.skip })
        return
      }
      kept.push(mapped.question)
    })
    const name = exam.title?.trim() || 'Névtelen vizsga'
    let id = `zsirkreta-${slug(name)}`
    // Két azonos című vizsga ne kapjon azonos bank-azonosítót.
    let suffix = 2
    while (usedIds.has(id)) id = `zsirkreta-${slug(name)}-${suffix++}`
    usedIds.add(id)
    if (kept.length > 0) banks.push({ id, name, questions: kept })
    report.push({ exam: name, bank: name, file: null, kept: kept.length, skipped })
  }

  const packages: Conversion['packages'] = []
  for (let offset = 0; offset < banks.length; offset += perPackage) {
    const slice = banks.slice(offset, offset + perPackage)
    const prepared = []
    const files = new Map<string, Uint8Array>()
    for (const bank of slice) {
      const ready = await prepareQuestionBankExport(
        {
          id: bank.id,
          name: bank.name,
          createdAt: stamp,
          lastUpdatedAt: stamp,
          questions: bank.questions,
        },
        async () => null,
      )
      prepared.push({ bank, ready })
      for (const [path, bytes] of ready.files) files.set(path, bytes)
    }
    const pack: TestParrotPackage = {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_FORMAT_VERSION,
      generator: { name: 'Zsírkréta-átalakító', version: '1.0.0' },
      requiredFeatures: [],
      questionBanks: prepared.map(({ bank, ready }) => ({ id: bank.id, record: ready.record })),
      exams: [],
    }
    const zip = await writePackageZip(JSON.stringify(pack), files)
    const index = packages.length + 1
    const file = join(output, `zsirkreta-${index}-${slice.length}bank.parrot.zip`)
    await writeFile(file, zip)
    const questions = slice.reduce((sum, bank) => sum + bank.questions.length, 0)
    packages.push({ file, banks: slice.length, questions })
    for (const entry of report) {
      if (slice.some((bank) => bank.name === entry.exam)) entry.file = file
    }
  }

  return {
    report,
    packages,
    total: {
      exams: report.length,
      kept: report.reduce((sum, entry) => sum + entry.kept, 0),
      skipped: report.reduce((sum, entry) => sum + entry.skipped.length, 0),
    },
  }
}

/* ------------------------------------------------------------------------- */
/* Parancssor                                                                 */
/* ------------------------------------------------------------------------- */

if (import.meta.main) {
  const [input, output = 'tmp/zsirkreta'] = process.argv.slice(2)
  if (!input) {
    console.error('Használat: bun scripts/zsirkreta-to-parrot.ts <zsirkreta-export.json> [kimeneti-mappa]')
    process.exit(1)
  }
  const raw = JSON.parse(await readFile(input, 'utf8')) as ZExport
  const result = await convert(raw, output)
  await writeFile(join(output, 'osszefoglalo.json'), JSON.stringify({ input: basename(input), ...result }, null, 2))
  for (const pack of result.packages) {
    console.log(`${basename(pack.file)}: ${pack.banks} bank, ${pack.questions} kérdés`)
  }
  console.log(
    `Összesen: ${result.total.exams} vizsga, ${result.total.kept} kérdés átvéve, ${result.total.skipped} kihagyva.`,
  )
  for (const entry of result.report) {
    for (const skipped of entry.skipped) console.log(`   ${entry.exam}: kihagyva — ${skipped.reason}`)
  }
}
