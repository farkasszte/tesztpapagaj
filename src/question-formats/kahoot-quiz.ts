import { htmlBlocks } from './rich-text'
import { excerpt } from './text'
import type { ForeignChoice, ForeignQuestion, ImportIssue, ParseResult } from './types'
import { t } from '../i18n/index'

/**
 * A Kahoot quiz as Kahoot's own API hands it over, read into questions.
 *
 * The same shapes the spreadsheet template carries, from the other side: a
 * `quiz` is one right answer, a `multiple_select_quiz` several, a
 * `true_false` the two words, `type_answer` the answers it accepts, `jumble`
 * and `puzzle` a set in its right order, `open_ended` a written answer. What
 * Test Parrot has no question for — a poll, a word cloud, a survey, a slider,
 * a dropped pin — is left out with a note naming it, so a teacher sees what
 * did not come in rather than finding a bank quietly short of questions.
 */

type KahootChoice = { answer?: unknown; text?: unknown; title?: unknown; correct?: unknown }

type KahootQuestion = {
  type?: unknown
  question?: unknown
  questionFormat?: unknown
  choices?: unknown
  pointsMultiplier?: unknown
}

const choiceText = (choice: KahootChoice): string => {
  const raw = choice.answer ?? choice.text ?? choice.title ?? ''
  return typeof raw === 'string' ? raw : ''
}

const isCorrect = (choice: KahootChoice): boolean =>
  choice.correct === true || choice.correct === 'true' || choice.correct === 1

/** Kahoot spells a multi-select question two ways across its versions: a type
 *  and a `questionFormat`. */
const isMultiple = (question: KahootQuestion): boolean => {
  const type = String(question.type ?? '')
  if (type === 'multiple_select_quiz' || type === 'multi_select_quiz') return true
  const format = question.questionFormat
  return format === 1 || format === '1' || format === 'multi-select' || format === 'multiple-select'
}

/** The words Kahoot uses for a question Test Parrot cannot hold, as a teacher
 *  would say them. */
const UNSUPPORTED: Record<string, string> = {
  word_cloud: 'szófelhő',
  poll: 'szavazás',
  survey: 'kérdőív',
  content: 'dia',
  nps: 'NPS-kérdés',
  slider: 'skála',
  pin: 'kitűzés a képen',
  drop_pin: 'kitűzés a képen',
  pin_answer: 'kitűzés a képen',
  feedback: 'visszajelzés',
}

export function kahootQuizQuestions(quiz: unknown): ParseResult {
  const source = (quiz ?? {}) as { title?: unknown; description?: unknown; questions?: unknown }
  const items = Array.isArray(source.questions) ? (source.questions as KahootQuestion[]) : []
  const questions: ForeignQuestion[] = []
  const issues: ImportIssue[] = []

  const note = (severity: ImportIssue['severity'], code: string, message: string, number: number, text: string) => {
    issues.push({ severity, code, message, line: number, excerpt: excerpt(text, 40) })
  }

  items.forEach((item, index) => {
    const number = index + 1
    const stem = typeof item.question === 'string' ? item.question.trim() : ''
    const rawChoices = Array.isArray(item.choices) ? (item.choices as KahootChoice[]) : []
    const choices: ForeignChoice[] = rawChoices
      .map((choice) => ({ content: htmlBlocks(choiceText(choice)), correct: isCorrect(choice) }))
      .filter((choice) => choice.content.length > 0)

    if (!stem) {
      note('error', 'kahoot-no-question', t('kahoot.noQuestion'), number, '')
      return
    }

    const type = String(item.type ?? 'quiz')
    const base = { number, sourceType: type, stem: htmlBlocks(stem) }

    switch (type) {
      case 'quiz':
      case 'multiple_select_quiz':
      case 'multi_select_quiz': {
        if (choices.length < 2) {
          note('error', 'kahoot-few-answers', t('kahoot.fewAnswers'), number, stem)
          return
        }
        if (!choices.some((choice) => choice.correct)) {
          note('error', 'kahoot-no-correct', t('kahoot.noCorrect'), number, stem)
          return
        }
        const multiple = isMultiple(item) || choices.filter((choice) => choice.correct).length > 1
        questions.push(multiple
          ? { ...base, kind: 'multiple-answer', choices }
          : { ...base, kind: 'multiple-choice', choices })
        return
      }

      case 'true_false': {
        const trueChoice = rawChoices.find((choice) => /^(true|igaz)$/i.test(choiceText(choice).trim()))
        const correctChoice = rawChoices.find(isCorrect)
        const answer = correctChoice
          ? /^(true|igaz)$/i.test(choiceText(correctChoice).trim())
          : null
        if (!trueChoice) {
          note('error', 'kahoot-true-false', t('kahoot.trueFalse'), number, stem)
          return
        }
        questions.push({ ...base, kind: 'true-false', answer })
        return
      }

      case 'type_answer': {
        const accepted = choices.map((choice) => choice.content).map((content) => contentText(content)).filter(Boolean)
        if (accepted.length === 0) {
          note('error', 'kahoot-no-accepted', t('kahoot.noAccepted'), number, stem)
          return
        }
        questions.push({ ...base, kind: 'fill-in-blank', accepted })
        return
      }

      case 'puzzle':
      case 'jumble': {
        if (choices.length < 2) {
          note('error', 'kahoot-few-items', t('kahoot.fewItems'), number, stem)
          return
        }
        questions.push({ ...base, kind: 'ordering', items: choices.map((choice) => choice.content) })
        return
      }

      case 'open_ended':
      case 'brainstorming': {
        const suggested = choices.find((choice) => choice.correct) ?? choices[0]
        questions.push({
          ...base,
          kind: 'short-answer',
          ...(suggested ? { suggestedAnswer: suggested.content } : {}),
        })
        return
      }

      default: {
        const named = UNSUPPORTED[type]
        note('warning', 'kahoot-unsupported',
          named ? t('kahoot.unsupported', { kind: named }) : t('kahoot.unknownType', { type }),
          number, stem)
      }
    }
  })

  const result: ParseResult = { questions, issues, found: items.length }
  if (typeof source.title === 'string' && source.title.trim()) result.name = source.title.trim()
  if (typeof source.description === 'string' && source.description.trim()) result.description = source.description.trim()
  return result
}

/** A choice's text, without the marks its blocks carry. */
function contentText(blocks: ForeignChoice['content']): string {
  return blocks
    .map((block) => ('content' in block && Array.isArray(block.content)
      ? block.content.map((node) => ('text' in node && typeof node.text === 'string' ? node.text : '')).join('')
      : ''))
    .join(' ')
    .trim()
}
