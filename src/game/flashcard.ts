import type { Question } from './types'

/**
 * A tanulókártya tartalma: elől a kérdés, hátul a helyes válasz.
 *
 * A Zsírkréta `FlashcardViewer`-ének a logikája, a saját kérdéstípusainkra
 * szűkítve. A kártya nem játék: nincs pont, nincs idő, nincs szoba — a tanár
 * vagy a diák maga lapozza, és a hátlap mindig megmondja, mi a helyes válasz,
 * illetve miért.
 */

export type Flashcard = {
  id: string
  prompt: string
  /** A hátlap sorai: a helyes válasz(ok), típusonként más formában. */
  answers: string[]
  explanation: string | null
}

/**
 * A hátlap a kérdés típusa szerint:
 * - kártyás (egy/több helyes): a helyes válasz(ok) szövege (betűjel nélkül,
 *   mert a játék keveri a válaszok sorrendjét — a betű félrevezetne);
 * - sorrendezés: a helyes sorrend nyíllal összefűzve;
 * - párosítás: fogalom — pár soronként;
 * - kiegészítés: a hézagok sorrendben;
 * - rövid válasz: az elfogadható alakok.
 */
export function cardAnswers(question: Question): string[] {
  const { choices } = question
  if (question.correctOrder?.length) {
    return [question.correctOrder.map((index) => choices[index] ?? '').join(' → ')]
  }
  if (question.matches?.length && question.prompts?.length) {
    return question.prompts.map(
      (prompt, index) => `${prompt} — ${choices[question.matches![index] ?? 0] ?? ''}`,
    )
  }
  if (question.blanks?.length) {
    return question.blanks.map((blank, index) =>
      question.blanks!.length > 1 ? `${index + 1}. ${blank}` : blank,
    )
  }
  if (question.accepted?.length) return [...question.accepted]
  if (question.correctChoices?.length) {
    return question.correctChoices.map((index) => choices[index] ?? '')
  }
  const right = choices[question.correct]
  return right === undefined ? [] : [right]
}

/** A kártya a játék kérdéséből; a szövegek a már kinyert (plain) változatból jönnek. */
export function cardOf(question: Question): Flashcard {
  return {
    id: question.id,
    prompt: question.prompt,
    answers: cardAnswers(question),
    explanation: question.explanation?.trim() || null,
  }
}

/** A pakli: minden kérdésből egy kártya; a hátlap nélküli kimarad. */
export function deckOf(questions: readonly Question[]): Flashcard[] {
  return questions.map(cardOf).filter((card) => card.answers.length > 0)
}
