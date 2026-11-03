import type { Question } from './types'
import { fillColumn, MAX_COLUMNS, onBoard, TILES_PER_COLUMN, type BoardDraft } from './peril/draft'
import type { Column } from './peril/types'

/**
 * A Veszély! táblája.
 *
 * Két út vezet a táblához, és mindkettő ugyanazt a szerződést adja: oszlopcímek,
 * 100-tól 500-ig érő mezők, legfeljebb hat oszlop és öt sor, valamint egy
 * kincsesbarlang az első sor alatt.
 *
 * - `perilBoard(q)` — a készletből **automatikusan** felépített tábla.
 * - `boardFromDraft(d, q)` — a tanár által **kézzel beosztott** tábla: a mező
 *   értéke a helyéből jön (100 × a sor), az üres mezők kimaradnak.
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
 * oszlopok kimaradnak, és a kincsesbarlang az első sor alatti mezők egyikére
 * kerül. Az időközben törölt kérdés helye üresen marad.
 */
export function boardFromDraft(
  draft: BoardDraft,
  questions: readonly Question[],
  options: { untitled: (index: number) => string; treasureTrove?: boolean; random?: () => number },
): Column[] {
  const byId = new Map(questions.map((question) => [question.id, question] as const))
  const board: Column[] = draft.columns
    .map((column, index) => ({
      title: column.title.trim() || options.untitled(index),
      tiles: column.tiles.flatMap((id, row) => {
        const question = id ? byId.get(id) : undefined
        return question ? [{ value: (row + 1) * 100, question, treasureTrove: false }] : []
      }),
    }))
    .filter((column) => column.tiles.length > 0)

  if (options.treasureTrove ?? true) {
    const below = board.flatMap((column) => column.tiles.filter((tile) => tile.value > 100))
    if (below.length > 0) {
      const random = options.random ?? Math.random
      below[Math.floor(random() * below.length)].treasureTrove = true
    }
  }
  return board
}

/** A táblán már kint lévő kérdések azonosítói — a szerkesztő ezt használja. */
export function placedQuestions(draft: BoardDraft): Set<string> {
  return onBoard(draft)
}
