import { answerIsRight } from './engine'
import type { ClassicAnswer, ClassicSession } from './types'
import type { Question } from '../types'

/**
 * A diák elrontott kérdései a Klasszikus naplójából.
 *
 * Csak az számít hibának, amire a diák **válaszolt** és nem lett jó — a
 * kihagyott (lejárt idő) kérdés nem hiba, hanem hiány, azt a hibalista nem
 * gyűjti (a tanár a jelenléten látja).
 */
export function missedQuestions(session: ClassicSession, playerId: string): Question[] {
  const missed: Question[] = []
  session.questions.forEach((question, index) => {
    const answer = (session.answers[index] ?? []).find((entry) => entry.playerId === playerId)
    if (!answer) return
    if (answerWasRight(question, answer)) return
    missed.push(question)
  })
  return missed
}

/** Egy rögzített válasz helyessége a naplóból (a pontozáséval azonos szabály). */
export function answerWasRight(question: Question, answer: ClassicAnswer): boolean {
  const choices = answer.texts?.length ? [] : (answer.choices ?? [answer.choice])
  return answerIsRight(question, choices, answer.texts ?? [])
}

/** Minden diák hibás kérdései egyszerre — a tanár egy menetben küldi ki a paklikat. */
export function missedBy(session: ClassicSession): Map<string, Question[]> {
  const byPlayer = new Map<string, Question[]>()
  for (const player of session.players) {
    const missed = missedQuestions(session, player.id)
    if (missed.length > 0) byPlayer.set(player.id, missed)
  }
  return byPlayer
}
