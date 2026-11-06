import { describe, expect, test } from 'bun:test'
import { kahootIdIn } from '../kahoot-link'
import { kahootQuizQuestions } from './kahoot-quiz'

/** A quiz as Kahoot's API hands it over: the types a teacher's quiz is made
 *  of, and two the app has no question for. */
const quiz = {
  title: 'Földrajz röpdolgozat',
  description: 'Európa',
  questions: [
    {
      type: 'quiz',
      question: 'Mi Magyarország fővárosa?',
      questionFormat: 0,
      choices: [
        { answer: 'Bécs', correct: false },
        { answer: 'Budapest', correct: true },
        { answer: 'Pozsony', correct: false },
      ],
    },
    {
      type: 'quiz',
      question: 'Melyek a Duna-parti fővárosok?',
      questionFormat: 1,
      choices: [
        { answer: 'Bécs', correct: true },
        { answer: 'Budapest', correct: true },
        { answer: 'Prága', correct: false },
      ],
    },
    {
      type: 'true_false',
      question: 'A Balaton a legnagyobb tavunk.',
      choices: [
        { answer: 'True', correct: true },
        { answer: 'False', correct: false },
      ],
    },
    {
      type: 'type_answer',
      question: 'Melyik folyó szeli át Budapestet?',
      choices: [{ answer: 'Duna', correct: true }, { answer: 'duna', correct: true }],
    },
    {
      type: 'open_ended',
      question: 'Nevezz meg egy magyar vármegyét!',
      choices: [{ answer: 'Pest', correct: true }],
    },
    {
      type: 'jumble',
      question: 'Tedd sorrendbe a városokat északról délre!',
      choices: [
        { answer: 'Miskolc', correct: true },
        { answer: 'Szeged', correct: true },
      ],
    },
    {
      type: 'word_cloud',
      question: 'Írj egy szót Európáról!',
      choices: [],
    },
    {
      type: 'quiz',
      question: 'Két válasz, egyik sem helyes',
      choices: [
        { answer: 'A', correct: false },
        { answer: 'B', correct: false },
      ],
    },
    {
      type: 'quiz',
      question: 'Egy válasz',
      choices: [{ answer: 'Csak ez', correct: true }],
    },
  ],
}

describe('a Kahoot link', () => {
  test('megtalálja a kvíz azonosítóját bármilyen linkben', () => {
    const id = '61071306-187d-4e92-82d7-2c11f2779298'
    expect(kahootIdIn(`https://create.kahoot.it/share/wordsmith-wind/${id}`)).toBe(id)
    expect(kahootIdIn(`https://play.kahoot.it/v2/lobby?quizId=${id}`)).toBe(id)
    expect(kahootIdIn(`  ${id}  `)).toBe(id)
    expect(kahootIdIn('https://create.kahoot.it/share/wordsmith-wind')).toBeNull()
    expect(kahootIdIn('')).toBeNull()
  })
})

describe('a Kahoot kvíz kérdései', () => {
  const result = kahootQuizQuestions(quiz)

  test('a kvíz címe a bank neve lesz', () => {
    expect(result.name).toBe('Földrajz röpdolgozat')
    expect(result.found).toBe(quiz.questions.length)
  })

  test('a típusok a saját kérdéstípusainkra képződnek', () => {
    const kinds = result.questions.map((question) => question.kind)
    expect(kinds).toEqual([
      'multiple-choice',
      'multiple-answer',
      'true-false',
      'fill-in-blank',
      'short-answer',
      'ordering',
    ])
  })

  test('a helyes válaszok megmaradnak', () => {
    const single = result.questions[0]!
    expect(single.kind).toBe('multiple-choice')
    if (single.kind === 'multiple-choice') {
      expect(single.choices.filter((choice) => choice.correct)).toHaveLength(1)
    }
    const tf = result.questions[2]!
    expect(tf.kind === 'true-false' && tf.answer).toBe(true)
    const accepted = result.questions[3]!
    expect(accepted.kind === 'fill-in-blank' && accepted.accepted).toEqual(['Duna', 'duna'])
  })

  test('a nem támogatott és a hibás kérdés kimarad, megjegyzéssel', () => {
    const codes = result.issues.map((issue) => issue.code)
    expect(codes).toContain('kahoot-unsupported')
    expect(codes).toContain('kahoot-no-correct')
    expect(codes).toContain('kahoot-few-answers')
    // A szófelhő kérdése nincs benne, a többiek igen.
    expect(result.questions).toHaveLength(6)
  })
})
