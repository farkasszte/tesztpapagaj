import type { Question } from './types'
import { fillColumn, MAX_COLUMNS, onBoard, TILES_PER_COLUMN, type BoardDraft } from './peril/draft'
import type { Column } from './peril/types'
import type { PerilPlan, TroveChoice } from './peril-plan'

/**
 * A Veszély! táblája.
 *
 * Három út vezet a táblához, és mindegyik ugyanazt a szerződést adja:
 * oszlopcímek, 100-tól 500-ig érő mezők, legfeljebb hat oszlop és öt sor,
 * valamint egy kincsesbarlang az első sor alatt.
 *
 * - `perilBoard(q)` — a készletből **automatikusan** felépített tábla.
 * - `boardFromDraft(d, q)` — a tanár által **kézzel beosztott** tábla.
 * - `planBoard(plan, q)` — a mentett **terv** (mezők + kincsesbarlang).
 */

export const MAX_BOARD_COLUMNS = MAX_COLUMNS
export const BOARD_TILES = TILES_PER_COLUMN

/** A legkevesebb kérdés, amiből már van értelmes tábla (2 oszlop × 2 sor). */
export const MIN_BOARD_QUESTIONS = 4

function titlesFor(
  questions: readonly Question[],
  columns: number,
  untitled: (index: number) => string,
): string[] {
  const topics = questions.map((question) => question.topics?.[0]).filter((topic): topic is string => !!topic)
  const distinct = [...new Set(topics)]
  // Csak akkor oszlopcím a Topic, ha legalább két oszlopra telik belőle.
  if (distinct.length >= 2 && distinct.length <= columns && topics.length === questions.length) {
    return distinct.slice(0, columns)
  }
  return Array.from({ length: columns }, (_, index) => untitled(index))
}

/**
 * Az automatikus tábla szerkeszthető változata — ezzel indul a kézi szerkesztő.
 *
 * A készlet kérdései a Topicjaik szerint sorakoznak fel, ha van belőlük elég;
 * különben egyenlő oszlopokba kerülnek, soronként körbeszedve, hogy a tábla
 * minden sora hasznos legyen. Az oszlopok legfeljebb hatan, a sorok öten — a
 * Class Gauntlet táblájának mérete —, és egy sor annyi, ahány kérdés van: egy
 * kis készletből alacsony tábla lesz, nem üres mezőkkel teli.
 */
export function autoDraft(
  questions: readonly Question[],
  options: { untitled: (index: number) => string },
): BoardDraft {
  const playable = questions.slice(0, MAX_BOARD_COLUMNS * BOARD_TILES)
  // Legalább két oszlop: egyetlen oszlop már nem tábla, hanem lista.
  const columns = Math.max(
    Math.min(2, playable.length),
    Math.min(MAX_BOARD_COLUMNS, Math.ceil(playable.length / BOARD_TILES)),
  )
  const titles = titlesFor(playable, columns, options.untitled)
  // Soronként körbeszedve: az első oszlop kapja az első kérdést, a második a
  // másodikat, és így tovább, hogy egy rövid készlet is kitöltse a felső sorokat.
  const buckets: Question[][] = Array.from({ length: columns }, () => [])
  playable.forEach((question, index) => buckets[index % columns].push(question))
  let draft: BoardDraft = {
    columns: Array.from({ length: columns }, () => ({
      title: '',
      tiles: Array<null>(BOARD_TILES).fill(null),
    })),
  }
  buckets.forEach((bucket, index) => {
    draft = fillColumn(
      draft,
      index,
      bucket.map((question) => question.id),
      titles[index],
    )
  })
  return draft
}

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 }

/** Van-e egyáltalán nehézség a készletben? Enélkül a rendezés nem mond semmit. */
export function hasDifficulty(questions: readonly Question[]): boolean {
  return questions.some((question) => question.difficulty)
}

/**
 * A tábla **nehézség szerint**: a könnyű kérdések a 100-as sorba, a nehezek az
 * 500-ba. A nehézség nélküli kérdés a közepére kerül, mert arról nem tudunk
 * semmit; ha egyáltalán nincs nehézség, a szerkesztő ezt ki is mondja, és a
 * gomb nem él.
 */
export function difficultyDraft(
  questions: readonly Question[],
  options: { untitled: (index: number) => string },
): BoardDraft {
  const playable = questions.slice(0, MAX_BOARD_COLUMNS * BOARD_TILES)
  const columns = Math.max(
    Math.min(2, playable.length),
    Math.min(MAX_BOARD_COLUMNS, Math.ceil(playable.length / BOARD_TILES)),
  )
  const titles = titlesFor(playable, columns, options.untitled)
  // Soronként osztunk: az első sor kapja a legkönnyebbeket, az utolsó a nehezeket.
  const sorted = [...playable].sort(
    (a, b) => (DIFFICULTY_RANK[a.difficulty ?? 'medium'] ?? 1) - (DIFFICULTY_RANK[b.difficulty ?? 'medium'] ?? 1),
  )
  const tiles: (string | null)[][] = Array.from({ length: columns }, () => Array<null>(BOARD_TILES).fill(null))
  sorted.forEach((question, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    if (row < BOARD_TILES) tiles[column][row] = question.id
  })
  return {
    columns: tiles.map((columnTiles, index) => ({ title: titles[index] ?? '', tiles: columnTiles })),
  }
}

/**
 * A tábla a készletből: a kérdések oszlopokba rendezve, 100-tól 500-ig érő
 * mezőkkel, és egy kincsesbarlanggal az első sor alatt, ha van hova tenni.
 */
export function perilBoard(
  questions: readonly Question[],
  options: { untitled: (index: number) => string; treasureTrove?: boolean; random?: () => number },
): Column[] {
  return boardFromDraft(autoDraft(questions, options), questions, options)
}

/**
 * A tanár által beosztott tábla.
 *
 * A mező értéke a helyéből jön (100 × a sor), az üres mezők és az üresen maradt
 * oszlopok kimaradnak, a kincsesbarlang pedig a kért helyre kerül: `'auto'`
 * esetén az első sor alatti mezők egyikére, egy megadott mezőre, vagy sehova
 * (`null`). Az időközben törölt kérdés helye üresen marad.
 */
export function boardFromDraft(
  draft: BoardDraft,
  questions: readonly Question[],
  options: {
    untitled: (index: number) => string
    /** Rövidítés: `false` ugyanaz, mint a `trove: null`. */
    treasureTrove?: boolean
    trove?: TroveChoice
    random?: () => number
  },
): Column[] {
  const byId = new Map(questions.map((question) => [question.id, question] as const))
  const wanted: TroveChoice = options.trove ?? (options.treasureTrove === false ? null : 'auto')
  const spotOf = (column: number, row: number) =>
    typeof wanted === 'object' && wanted !== null && wanted.column === column && wanted.row === row && row > 0
  let trovePlaced = false

  const board: Column[] = draft.columns
    .map((column, columnIndex) => ({
      title: column.title.trim() || options.untitled(columnIndex),
      tiles: column.tiles.flatMap((id, row) => {
        const question = id ? byId.get(id) : undefined
        if (!question) return []
        const trove = spotOf(columnIndex, row)
        if (trove) trovePlaced = true
        return [{ value: (row + 1) * 100, question, treasureTrove: trove }]
      }),
    }))
    .filter((column) => column.tiles.length > 0)

  // A megadott hely nem létezik (üres lett a mező, vagy az első sorba került):
  // ilyenkor a játék maga választ, hogy a kincsesbarlang ne tűnjön el némán.
  if (wanted !== null && !trovePlaced) {
    const below = board.flatMap((column) => column.tiles.filter((tile) => tile.value > 100))
    if (below.length > 0) {
      const random = options.random ?? Math.random
      below[Math.floor(random() * below.length)].treasureTrove = true
    }
  }
  return board
}

/** A tervből (mezők + kincsesbarlang) épített tábla: egy hívás a színpadnak. */
export function planBoard(
  plan: PerilPlan,
  questions: readonly Question[],
  options: { untitled: (index: number) => string; random?: () => number },
): Column[] {
  return boardFromDraft(plan.draft, questions, { ...options, trove: plan.trove })
}

/** A táblán már kint lévő kérdések azonosítói — a szerkesztő ezt használja. */
export function placedQuestions(draft: BoardDraft): Set<string> {
  return onBoard(draft)
}
