// An Ordering question, end to end: the type the teacher picks, the items it
// holds in the order they belong, the scramble the paper prints, and the
// sequence the Answer Key gives.

import { afterAll, describe, expect, test } from 'bun:test'
import { FIXTURES } from './export-fixtures'
import { planExport } from './export-plan'
import { SECTION_INSTRUCTIONS, SECTION_TITLE } from './section-headings'
import { getLanguage, setLanguage } from './i18n/index'
import { ANSWER_BLANK } from './paper-style'

// A test file shares the process with the others: the language it sets is put
// back, so a file that reads English words still finds them.
const language = getLanguage()
afterAll(() => setLanguage(language))

const fixture = () => FIXTURES.find((item) => item.exam.questions.some((question) => question.type === 'ordering'))!

const answerKeyOf = (item: ReturnType<typeof fixture>) => {
  const plan = planExport({
    exam: item.exam,
    arrangement: item.arrangement,
    selection: { test: false, answerKey: true },
    measure: item.measure,
    version: null,
  })
  return plan.pages
    .flatMap((page) => page.items)
    .filter((entry) => entry.kind === 'answer-key-entry' && entry.kind === 'answer-key-entry')
}

describe('an Ordering question', () => {
  test('prints its own section title and directions', () => {
    setLanguage('hu')
    expect(SECTION_TITLE.ordering).toBe('Sorba rendezés')
    expect(SECTION_INSTRUCTIONS.ordering).toBe('Számozd meg az elemeket a helyes sorrendben.')
    setLanguage('en')
    expect(SECTION_TITLE.ordering).toBe('Ordering')
    expect(SECTION_INSTRUCTIONS.ordering).toBe('Number the items in the order they belong.')
  })

  test('prints its items scrambled, and the key gives the order they belong in', () => {
    const item = fixture()
    const plan = planExport({
      exam: item.exam,
      arrangement: item.arrangement,
      selection: { test: true, answerKey: true },
      measure: item.measure,
      version: null,
    })
    const question = plan.pages
      .flatMap((page) => page.items)
      .find((entry) => entry.kind === 'question' && entry.question.type === 'ordering')
    expect(question).toBeDefined()
    if (question?.kind !== 'question') return

    // Four items, lettered as they print, one column, each with a line for its
    // number.
    expect(question.question.choices).toHaveLength(4)
    expect(question.question.choices.map((choice) => choice.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(question.question.marks).toEqual([ANSWER_BLANK])
    expect(question.question.grid?.columns).toBe(1)

    // The key names every item once, in the order they belong — which the
    // scramble on the paper must not be.
    const key = answerKeyOf(item).find(
      (entry) => entry.kind === 'answer-key-entry' && entry.number === question.question.number,
    )
    expect(key).toBeDefined()
    const letters = (key as { letter: string }).letter.split(', ')
    expect([...letters].sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(letters.join(', ')).not.toBe('A, B, C, D')
  })

  test('prints the same scramble every time the same paper is planned', () => {
    const item = fixture()
    const order = () =>
      planExport({
        exam: item.exam,
        arrangement: item.arrangement,
        selection: { test: true, answerKey: false },
        measure: item.measure,
        version: null,
      })
        .pages.flatMap((page) => page.items)
        .filter((entry) => entry.kind === 'question' && entry.question.type === 'ordering')
        .flatMap((entry) => (entry.kind === 'question' ? entry.question.choices.map((choice) => choice.id) : []))
    expect(order()).toEqual(order())
  })
})
