// A Multiple Answer question, end to end: the type the teacher picks, the
// answers the editor marks, the grid the paper prints, and the letters the
// Answer Key writes.

import { afterAll, describe, expect, test } from 'bun:test'
import { FIXTURES } from '../export/export-fixtures'
import { planExport } from '../export/export-plan'
import { SECTION_INSTRUCTIONS, SECTION_TITLE } from '../export/section-headings'
import { getLanguage, setLanguage } from '../i18n/index'

// A test file shares the process with the others: the language it sets is
// put back, so a file that reads English words still finds them.
const language = getLanguage()
afterAll(() => setLanguage(language))

const fixture = () => FIXTURES.find((item) => item.exam.questions.some((question) => question.type === 'multiple-answer'))!

describe('a Multiple Answer question', () => {
  test('prints its own section title and directions', () => {
    setLanguage('hu')
    expect(SECTION_TITLE['multiple-answer']).toBe('Többszörös választás')
    expect(SECTION_INSTRUCTIONS['multiple-answer']).toBe('Jelöld meg az összes helyes választ.')
    setLanguage('en')
    expect(SECTION_TITLE['multiple-answer']).toBe('Multiple Answer')
    expect(SECTION_INSTRUCTIONS['multiple-answer']).toBe('Tick every correct answer.')
  })

  test('writes every correct answer into the Answer Key, in print order', () => {
    const item = fixture()
    const plan = planExport({
      exam: item.exam,
      arrangement: item.arrangement,
      selection: { test: false, answerKey: true },
      measure: item.measure,
      version: null,
    })
    const entries = plan.pages.flatMap((page) => page.items)
      .filter((item) => item.kind === 'answer-key-entry')
    const several = entries.filter(
      (item) => item.kind === 'answer-key-entry' && (item.letter ?? '') === 'A, C',
    )
    expect(several).toHaveLength(1)
    // Helium and Argon are marked: A and C, and never just the first.
    expect(several[0]).toMatchObject({ letter: 'A, C' })
  })
})
