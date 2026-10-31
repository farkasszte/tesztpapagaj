import type { ImportProposal } from './package-import'
import type { QuestionFileSummary } from './question-formats'

/**
 * A Kahoot link, read into the same proposal a file gives.
 *
 * The teacher pastes a share link — or the bare id — and the quiz comes in as
 * questions, with the note of what was read and what was left out that every
 * other import carries. The reading happens in `api/kahoot`, because Kahoot's
 * API cannot be read from a page; everything after it is the same pipeline a
 * dropped file takes.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The quiz id in anything a teacher might paste: a share link, a play link,
 *  a challenge link, or the id on its own. */
export function kahootIdIn(text: string): string | null {
  const match = UUID.exec(text.trim())
  return match ? match[0].toLowerCase() : null
}

/** Why a link could not be read, in the teacher's words. */
export class KahootLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KahootLinkError'
  }
}

async function fetchQuiz(id: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`/api/kahoot?id=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })
  } catch {
    throw new KahootLinkError('A Kahoot nem érhető el most. Próbáld meg újra.')
  }
  if (response.status === 404) throw new KahootLinkError('Nincs kahoot ezzel az azonosítóval.')
  if (response.status === 403) {
    throw new KahootLinkError('Ez a kahoot nem nyilvános, ezért linkről nem olvasható be. Tedd közzé, vagy használd a Kahoot táblázatát.')
  }
  if (!response.ok) throw new KahootLinkError('A Kahoot most nem adta ki a kvízt. Próbáld meg újra.')
  // Where the link reader is not running (a local preview without functions),
  // the request comes back as the app's own page rather than a quiz.
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) {
    throw new KahootLinkError('A Kahoot-link olvasója ezen a címen nem fut. A táblázat vagy a PDF behozatala most is működik.')
  }
  return response.json()
}

export async function inspectKahootLink(text: string): Promise<ImportProposal> {
  const id = kahootIdIn(text)
  if (!id) throw new KahootLinkError('Ez nem Kahoot link. Illeszd be a megosztási linket, vagy a kvíz azonosítóját.')

  const quiz = await fetchQuiz(id)
  const [{ kahootQuizQuestions }, { toRecord }, importer] = await Promise.all([
    import('./question-formats/kahoot-quiz'),
    import('./question-formats/record'),
    import('./package-import'),
  ])

  const result = kahootQuizQuestions(quiz)
  if (result.questions.length === 0) {
    throw new KahootLinkError('Ebben a kahootban nincs beolvasható kérdés. Lehet, hogy csak szavazás vagy szófelhő van benne.')
  }

  const reading = await toRecord(result, { bankName: result.name ?? '' })
  const proposal = await importer.inspectImportValue(reading.record, undefined, reading.files)
  const summary: QuestionFileSummary = {
    format: 'kahoot',
    label: 'Kahoot',
    found: result.found,
    imported: reading.imported,
    issues: [...result.issues, ...reading.issues],
    candidates: [],
    confidence: 1,
    word: false,
  }
  return { ...proposal, reading: summary }
}
