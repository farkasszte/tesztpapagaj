import { describe, expect, test } from 'bun:test'
import { SECTION_LABELS, type Question as BankQuestion, type QuestionType } from '../exam'
import { t } from '../i18n'
import type { ProseMirrorJSON } from '../question-doc'
import { playableQuestions } from './projection'

function choice(said: string, correct = false): ProseMirrorJSON {
  return {
    type: 'multipleChoiceChoice',
    attrs: { correct, id: said },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: said }] }],
  }
}

function stem(text = 'Which number is prime?'): ProseMirrorJSON[] {
  return [{ type: 'paragraph', content: [{ type: 'text', text }] }]
}

function question(
  choices: ProseMirrorJSON[],
  options: { type?: QuestionType; words?: ProseMirrorJSON[]; topics?: string[] } = {},
): BankQuestion {
  return {
    id: 'q1',
    type: options.type ?? 'multiple-choice',
    columns: 2,
    doc: {
      type: 'doc',
      content: [
        ...(options.words ?? stem()),
        { type: 'multipleChoice', content: choices },
      ],
    },
    ...(options.topics ? { topics: options.topics } : {}),
  }
}

describe('what the projector plays', () => {
  test('a Multiple Choice question with one right answer is played, and keeps where that answer stands', () => {
    const result = playableQuestions([question([choice('Four'), choice('Five', true), choice('Six')])])
    expect(result.skipped).toEqual([])
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({
      prompt: 'Which number is prime?',
      choices: ['Four', 'Five', 'Six'],
      correct: 1,
    })
  })

  test('two answers are enough, four are fine, one or five are not', () => {
    expect(playableQuestions([question([choice('A'), choice('B', true)])]).questions).toHaveLength(1)
    expect(playableQuestions([question([choice('A'), choice('B'), choice('C'), choice('D', true)])]).questions).toHaveLength(1)
    const one = playableQuestions([question([choice('A', true)])])
    expect(one.skipped[0].reason).toBe(t('game.skip.choiceCount', { count: 1 }))
    const five = playableQuestions([question([choice('A'), choice('B'), choice('C'), choice('D'), choice('E', true)])])
    expect(five.skipped[0].reason).toBe(t('game.skip.choiceCount', { count: 5 }))
  })

  test('a True/False question is played, with the two answers in the interface’s language', () => {
    const result = playableQuestions([question([choice('True', true), choice('False')], { type: 'true-false' })])
    expect(result.skipped).toEqual([])
    expect(result.questions[0]).toMatchObject({
      prompt: 'Which number is prime?',
      choices: [t('game.trueFalse.true'), t('game.trueFalse.false')],
      correct: 0,
    })
    // A második válasz a helyes: a sorrend és a jelölés is megmarad.
    const swapped = playableQuestions([question([choice('True'), choice('False', true)], { type: 'true-false' })])
    expect(swapped.questions[0]).toMatchObject({
      choices: [t('game.trueFalse.true'), t('game.trueFalse.false')],
      correct: 1,
    })
  })

  test('a True/False question without exactly two answers is still left out', () => {
    const one = playableQuestions([question([choice('True', true)], { type: 'true-false' })])
    expect(one.skipped[0].reason).toBe(t('game.skip.choiceCount', { count: 1 }))
    const three = playableQuestions([
      question([choice('True', true), choice('False'), choice('Maybe')], { type: 'true-false' }),
    ])
    expect(three.skipped[0].reason).toBe(t('game.skip.choiceCount', { count: 3 }))
  })

  test('every other type of the Tesztpapagáj is left out, and the reason names the type', () => {
    const types: QuestionType[] = [
      'multiple-answer',
      'matching',
      'ordering',
      'fill-in-the-blank',
      'open',
      'multipart',
    ]
    for (const type of types) {
      const result = playableQuestions([question([choice('A', true), choice('B')], { type })])
      expect(result.questions).toHaveLength(0)
      expect(result.skipped[0].reason).toBe(t('game.skip.type', { type: SECTION_LABELS[type] }))
    }
  })

  test('a question with no right answer, or with two, is left out', () => {
    expect(playableQuestions([question([choice('A'), choice('B')])]).skipped[0].reason).toBe(t('game.skip.noCorrect'))
    expect(playableQuestions([question([choice('A', true), choice('B', true)])]).skipped[0].reason).toBe(t('game.skip.manyCorrect'))
  })

  test('an empty answer, or two answers that say the same thing, is left out', () => {
    const empty = playableQuestions([question([choice('A', true), choice('   ')])])
    expect(empty.skipped[0].reason).toBe(t('game.skip.blankChoice'))
    const same = playableQuestions([question([choice('Paris', true), choice('Paris')])])
    expect(same.skipped[0].reason).toBe(t('game.skip.sameChoices'))
  })

  test('a question with no words is left out', () => {
    const result = playableQuestions([question([choice('A', true), choice('B')], { words: [{ type: 'paragraph' }] })])
    expect(result.skipped[0].reason).toBe(t('game.skip.emptyStem'))
  })

  test('formatting, maths and pictures come along as Rich Text, and as the words the stage draws', () => {
    const picture = { type: 'image-block', attrs: { src: `/local-images/${'a'.repeat(64)}`, alt: 'A graph' } }
    const result = playableQuestions([
      question([choice('A'), choice('B', true)], {
        words: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Read ', marks: [{ type: 'strong' }] },
              { type: 'text', text: 'this', marks: [{ type: 'strong' }] },
              { type: 'math_inline', attrs: { value: '\\frac{1}{2}' } },
            ],
          },
          picture,
        ],
      }),
    ])
    expect(result.skipped).toEqual([])
    const played = result.questions[0]
    expect(played.rich).toBeDefined()
    // A picture is a block of its own, so the plain words put a line between them.
    expect(played.prompt).toBe('Read this\\frac{1}{2}\n[A graph]')
    expect(JSON.stringify(played.rich)).toContain('"inline-math"')
    expect(JSON.stringify(played.rich)).toContain(`sha256:${'a'.repeat(64)}`)
    // The projector draws the bank's own nodes, so pictures keep their sizes and crops.
    expect(result.words.get('q1')?.stem).toHaveLength(2)
    expect(result.words.get('q1')?.choices).toHaveLength(2)
  })

  test('a Side-by-Side in the words is left out: the projector has no room for it', () => {
    const sideBySide = {
      type: 'sideBySide',
      content: [
        { type: 'sideBySidePanel', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
        { type: 'sideBySidePanel', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
      ],
    }
    const result = playableQuestions([question([choice('A', true), choice('B')], { words: [sideBySide] })])
    expect(result.questions).toHaveLength(0)
    expect(result.skipped[0].reason).toBe(t('game.skip.layout'))
  })

  test('a question is numbered as the bank lists it, so the teacher finds it', () => {
    const result = playableQuestions([
      question([choice('A'), choice('B', true)], { topics: ['földrajz'] }),
      question([choice('A'), choice('B')]),
      question([choice('A'), choice('B', true)]),
    ])
    expect(result.questions.map((q) => q.id)).toEqual(['q1', 'q1'])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].number).toBe(2)
    expect(result.questions[0].topics).toEqual(['földrajz'])
  })
})
