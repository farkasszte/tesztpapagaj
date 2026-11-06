import type { ClassicSession } from './classic/types'
import { answerWasRight } from './classic/misses'
import { plainTextOf } from '../editor/question-doc'
import type { PlayableWords } from './projection'

/**
 * Egy lejátszott játék eredménye — a tanár számára, utólag.
 *
 * A motor a játék közben mindent tud (ki mit válaszolt, mennyi idő alatt), de ez
 * csak addig él, amíg a vetítés nyitva van. Itt **kérdésenkénti mátrix** készül:
 * diák × kérdés, cellánként helyes / hibás / nem válaszolt — ez az a nézet, amit
 * a Kahoot is ad, és amiből a tanár a csoportátlagot és a kérdésenkénti
 * sikerességet olvassa.
 *
 * Csak az a játék menthető, amelyben tényleg születtek válaszok: kivetítésnél
 * (diák-eszköz nélkül) nincs mit rögzíteni, és nem is hazudunk üres statisztikát.
 */

export type ResultCell = 'right' | 'wrong' | 'skipped'

export type GamePlayerResult = {
  nickname: string
  points: number
  correct: number
  answered: number
  /** Kérdésenként, a játék sorrendjében. */
  cells: ResultCell[]
}

export type GameQuestionResult = {
  id: string
  /** A kérdés szövege (rövidítve), hogy a mátrix fejléce olvasható legyen. */
  prompt: string
  correct: number
  answered: number
}

export type GameResult = {
  /** A játék azonosítója: módból és a játék kezdetéből — így újramentés nem duplikál. */
  id: string
  mode: string
  title: string
  bankId?: string
  startedAt: number
  endedAt: number
  players: GamePlayerResult[]
  questions: GameQuestionResult[]
}

/** A mátrix fejlécében ennyi karakter fér el a kérdésből. */
export const PROMPT_LIMIT = 90

const promptOf = (question: ClassicSession['questions'][number], words?: Map<string, PlayableWords>): string => {
  const stems = words?.get(question.id)?.stem ?? []
  const text = stems.map(plainTextOf).join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return '?'
  return text.length > PROMPT_LIMIT ? `${text.slice(0, PROMPT_LIMIT - 1)}…` : text
}

/**
 * A játék eredménye a session-ből. `null`, ha nincs mit menteni: nem volt
 * játékos, vagy egyetlen válasz sem érkezett.
 */
export function buildGameResult(
  session: ClassicSession,
  options: {
    mode: string
    title: string
    bankId?: string
    words?: Map<string, PlayableWords>
    now?: number
  },
): GameResult | null {
  if (session.players.length === 0) return null
  const answeredAny = session.answers.some((answers) => answers.length > 0)
  if (!answeredAny) return null

  const questions: GameQuestionResult[] = session.questions.map((question, index) => {
    const answers = session.answers[index] ?? []
    const right = answers.filter((answer) => answerWasRight(question, answer)).length
    return {
      id: question.id,
      prompt: promptOf(question, options.words),
      correct: right,
      answered: answers.length,
    }
  })

  const players: GamePlayerResult[] = session.players.map((player) => {
    const cells: ResultCell[] = session.questions.map((question, index) => {
      const answer = (session.answers[index] ?? []).find((entry) => entry.playerId === player.id)
      if (!answer) return 'skipped'
      return answerWasRight(question, answer) ? 'right' : 'wrong'
    })
    return {
      nickname: player.nickname,
      points: player.points,
      correct: cells.filter((cell) => cell === 'right').length,
      answered: cells.filter((cell) => cell !== 'skipped').length,
      cells,
    }
  })

  return {
    id: `${options.mode}-${session.createdAt}-${session.code || 'projection'}`,
    mode: options.mode,
    title: options.title,
    ...(options.bankId ? { bankId: options.bankId } : {}),
    startedAt: session.createdAt,
    endedAt: options.now ?? Date.now(),
    players,
    questions,
  }
}

/** A csoport átlaga: az összes diák helyes válaszainak aránya, százalékban. */
export function averagePercentOf(result: Pick<GameResult, 'players' | 'questions'>): number {
  const total = result.players.length * result.questions.length
  if (total === 0) return 0
  const right = result.players.reduce((sum, player) => sum + player.correct, 0)
  return Math.round((right / total) * 100)
}

/** Egy kérdés sikeressége: a válaszolók hány százaléka találta el. */
export function successPercentOf(question: Pick<GameQuestionResult, 'correct' | 'answered'>): number {
  if (question.answered === 0) return 0
  return Math.round((question.correct / question.answered) * 100)
}

/** Egy diák eredménye százalékban, a feltett kérdésekhez mérve. */
export function studentPercentOf(player: Pick<GamePlayerResult, 'correct'>, questionCount: number): number {
  if (questionCount === 0) return 0
  return Math.round((player.correct / questionCount) * 100)
}
