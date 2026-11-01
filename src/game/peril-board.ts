import type { Question } from './types'
import { fillColumn, toBoard, type BoardDraft } from './peril/draft'
import type { Column } from './peril/types'

/**
 * A Veszély! táblája egy készletből, tanári szerkesztés nélkül.
 *
 * A készlet kérdései a Topicjaik szerint sorakoznak fel, ha van belőlük elég;
 * különben három egyenlő oszlopba kerülnek, soronként körbeszedve, hogy a tábla
 * minden sora hasznos legyen. Az oszlopok legfeljebb hatan, a sorok öten — a
 * Class Gauntlet táblájának mérete —, és egy sor annyi, ahány kérdés van: egy
 * kis készletből alacsony tábla lesz, nem üres mezőkkel teli.
 */

export const MAX_BOARD_COLUMNS = 6
export const BOARD_TILES = 5

/** A legkevesebb kérdés, amiből már van értelmes tábla (2 oszlop × 2 sor). */
export const MIN_BOARD_QUESTIONS = 4

function titlesFor(questions: readonly Question[], columns: number, untitled: (index: number) => string): string[] {
  const topics = questions.map((question) => question.topics?.[0]).filter((topic): topic is string => !!topic)
  const distinct = [...new Set(topics)]
  // Csak akkor oszlopcím a Topic, ha legalább két oszlopra telik belőle.
  if (distinct.length >= 2 && distinct.length <= columns && topics.length === questions.length) {
    return distinct.slice(0, columns)
  }
  return Array.from({ length: columns }, (_, index) => untitled(index))
}

/**
 * A tábla a készletből: a kérdések oszlopokba rendezve, 100-tól 500-ig érő
 * mezőkkel, és egy kincsesbarlanggal az első sor alatt, ha van hova tenni.
 */
export function perilBoard(
  questions: readonly Question[],
  options: { untitled: (index: number) => string; treasureTrove?: boolean; random?: () => number },
): Column[] {
  const playable = questions.slice(0, MAX_BOARD_COLUMNS * BOARD_TILES)
  // Legalább két oszlop: egyetlen oszlop már nem tábla, hanem lista.
  const columns = Math.max(Math.min(2, playable.length), Math.min(MAX_BOARD_COLUMNS, Math.ceil(playable.length / BOARD_TILES)))
  const titles = titlesFor(playable, columns, options.untitled)
  // Soronként körbeszedve: az első oszlop kapja az első kérdést, a második a
  // másodikat, és így tovább, hogy egy rövid készlet is kitöltse a felső sorokat.
  const buckets: Question[][] = Array.from({ length: columns }, () => [])
  playable.forEach((question, index) => buckets[index % columns].push(question))
  let draft: BoardDraft = {
    columns: Array.from({ length: columns }, () => ({ title: '', tiles: Array<null>(BOARD_TILES).fill(null) })),
  }
  buckets.forEach((bucket, index) => {
    draft = fillColumn(draft, index, bucket.map((question) => question.id), titles[index])
  })
  return toBoard(draft, [{ id: 'play', title: '', updatedAt: 0, questions: [...playable] }], {
    treasureTrove: options.treasureTrove ?? true,
    random: options.random ?? Math.random,
  })
}
