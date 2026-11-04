import { answerIsRight } from './engine'
import type { ClassicSession } from './types'
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
    const choices = answer.texts?.length ? [] : (answer.choices ?? [answer.choice])
    if (answerIsRight(question, choices, answer.texts ?? [])) return
    missed.push(question)
  })
  return missed
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
