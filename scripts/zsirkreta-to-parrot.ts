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
import type { ProseMirrorJSON, Question } from '../src/exam'
import { DEFAULT_COLUMNS } from '../src/exam'
import { prepareQuestionBankExport } from '../src/question-bank-export'
import { questionBankFilePackage } from '../src/question-bank-pdf'
import { writePackageZip } from '../src/package-zip'

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
      const mapped: Question = {
        ...mcQuestion(
          id,
          stem,
          options.map((option, optionIndex) => choice(`${id}-${optionIndex + 1}`, option.correct, option.text)),
          points,
        ),
        ...(isMultiple ? { type: 'multiple-answer' as const } : {}),
      }
      // Több helyes válasznál legyen is mit megjelölni.
      if (isMultiple && options.filter((option) => option.correct).length < 2) {
        return { skip: 'a több helyes válaszhoz kevesebb mint két helyes válasz tartozik' }
      }
      return { question: mapped }
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
  file: string | null
  kept: number
  skipped: { question: string; reason: string }[]
}

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
  options: { now?: Date } = {},
): Promise<Converted[]> {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  const byId = new Map((source.questions ?? []).map((question) => [question.id, question]))
  const exams = source.exams ?? []
  await mkdir(output, { recursive: true })
  const report: Converted[] = []

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
    const bank = {
      id: `zsirkreta-${slug(name)}`,
      name,
      createdAt: stamp,
      lastUpdatedAt: stamp,
      ...(exam.description?.trim() ? { description: exam.description.trim() } : {}),
      questions: kept,
    }
    const result: Converted = { exam: name, bank: name, file: null, kept: kept.length, skipped }
    if (kept.length > 0) {
      const prepared = await prepareQuestionBankExport(bank, async () => null)
      const zip = await writePackageZip(JSON.stringify(questionBankFilePackage(prepared)), prepared.files)
      const file = join(output, `zsirkreta-${slug(name)}.parrot.zip`)
      await writeFile(file, zip)
      result.file = file
    }
    report.push(result)
  }
  return report
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
  const report = await convert(raw, output)
  await writeFile(join(output, 'osszefoglalo.json'), JSON.stringify({ input: basename(input), report }, null, 2))
  for (const entry of report) {
    console.log(`${entry.exam}: ${entry.kept} kérdés${entry.file ? ` → ${basename(entry.file)}` : ' → nincs mit beolvasni'}`)
    for (const skipped of entry.skipped) console.log(`   kihagyva: ${skipped.question} — ${skipped.reason}`)
  }
}
