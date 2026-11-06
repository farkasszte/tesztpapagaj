import { describe, expect, test } from 'bun:test'
import { SECTION_LABELS, type Question as BankQuestion, type QuestionType } from '../exam'
import { t } from '../i18n/index'
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
    const types: QuestionType[] = ['multipart']
    for (const type of types) {
      const result = playableQuestions([question([choice('A', true), choice('B')], { type })], {
        classic: true,
      })
      expect(result.questions).toHaveLength(0)
      expect(result.skipped[0].reason).toBe(t('game.skip.type', { type: SECTION_LABELS[type] }))
    }
    // A sorrendezés a Klasszikuson kívül nem játszható.
    const ordering = playableQuestions([question([choice('A'), choice('B')], { type: 'ordering' })])
    expect(ordering.skipped[0].reason).toBe(
      t('game.skip.multipleMode', { type: SECTION_LABELS['ordering'] }),
    )
  })

  test('a Fill in the Blank question is played with its gaps, and the answers stay on the teacher’s side', () => {
    const blank = (answer: string): ProseMirrorJSON => ({
      type: 'blank',
      content: [{ type: 'text', text: answer }],
    })
    const bankQuestion: BankQuestion = {
      id: 'fb1',
      type: 'fill-in-the-blank',
      columns: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'A növény a ' },
              blank('fotoszintézis'),
              { type: 'text', text: ' során cukrot termel a ' },
              blank('levélben'),
              { type: 'text', text: '.' },
            ],
          },
        ],
      },
    }
    const result = playableQuestions([bankQuestion], { classic: true })
    expect(result.skipped).toEqual([])
    const played = result.questions[0]!
    expect(played.blanks).toEqual(['fotoszintézis', 'levélben'])
    expect(played.choices).toEqual([])
    // A stem vonalat mutat a válasz helyén, és nem árulja el a választ.
    expect(played.prompt).toContain('_____ (1)')
    expect(played.prompt).toContain('_____ (2)')
    expect(played.prompt).not.toContain('fotoszintézis')
    expect(played.prompt).not.toContain('levélben')

    // Üres hézaggal nem játszható.
    const empty: BankQuestion = {
      ...bankQuestion,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [blank('')] }] },
    }
    const skipped = playableQuestions([empty], { classic: true })
    expect(skipped.skipped[0]!.reason).toBe(t('game.skip.emptyBlank'))
  })

  test('a Short Answer question is played against the suggested answer, and never shows it while answering', () => {
    const bankQuestion: BankQuestion = {
      id: 'sa1',
      type: 'open',
      columns: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mi a fotoszintézis terméke?' }] }],
      },
      suggestedAnswer: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'glükóz / cukor' }] }],
      },
    }
    const result = playableQuestions([bankQuestion], { classic: true })
    expect(result.skipped).toEqual([])
    const played = result.questions[0]!
    expect(played.accepted).toEqual(['glükóz', 'cukor'])
    expect(played.prompt).not.toContain('glükóz')
    expect(played.blanks).toBeUndefined()

    // Javasolt válasz nélkül nincs mihez mérni.
    const { suggestedAnswer: _drop, ...without } = bankQuestion
    void _drop
    const skipped = playableQuestions([without], { classic: true })
    expect(skipped.skipped[0]!.reason).toBe(t('game.skip.noAnswer'))
  })

  test('a Matching question is played with shuffled answers, and every concept keeps its pair', () => {
    const matchingDoc = (pairs: [string, string][], missing = false): ProseMirrorJSON => ({
      type: 'doc',
      content: [
        ...stem('Párosítsd a fogalmakat a jelentésükkel!'),
        {
          type: 'matching',
          content: [
            ...pairs.map(([prompt, answer]) => ({
              type: 'matchingPrompt',
              attrs: { id: `p-${prompt}`, answer: missing ? '' : `a-${answer}` },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: prompt }] }],
            })),
            ...pairs.map(([, answer]) => ({
              type: 'matchingAnswer',
              attrs: { id: `a-${answer}` },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: answer }] }],
            })),
          ],
        },
      ],
    })
    const bank: BankQuestion = {
      id: 'mt1',
      type: 'matching',
      columns: 2,
      doc: matchingDoc([
        ['Fotoszintézis', 'Cukrot termel'],
        ['Légzés', 'Energiát szabadít fel'],
        ['Párologtatás', 'Vizet ad le'],
      ]),
    }
    const result = playableQuestions([bank], { classic: true })
    expect(result.skipped).toEqual([])
    const played = result.questions[0]!
    expect(played.prompts).toEqual(['Fotoszintézis', 'Légzés', 'Párologtatás'])
    expect([...played.choices].sort()).toEqual(
      ['Cukrot termel', 'Energiát szabadít fel', 'Vizet ad le'].sort(),
    )
    // Fogalmanként a felkínált válaszok indexe, a helyes pár szerint.
    expect(played.matches).toHaveLength(3)
    expect(played.matches![0]).toBe(played.choices.indexOf('Cukrot termel'))
    expect(played.matches![1]).toBe(played.choices.indexOf('Energiát szabadít fel'))
    expect(played.matches![2]).toBe(played.choices.indexOf('Vizet ad le'))
    expect(played.correct).toBe(played.matches![0])

    // Amelyik fogalomnak nincs párja, az nem játszható.
    const broken: BankQuestion = {
      id: 'mt2',
      type: 'matching',
      columns: 2,
      doc: matchingDoc([['Fotoszintézis', 'Cukrot termel']], true),
    }
    const skipped = playableQuestions([broken], { classic: true })
    expect(skipped.questions).toHaveLength(0)
    expect(skipped.skipped[0]!.reason).toBe(t('game.skip.unpaired'))
  })

  test('an Ordering question is played scrambled, and its right order points at the shown items', () => {
    const items = [choice('Első'), choice('Második'), choice('Harmadik'), choice('Negyedik')]
    const result = playableQuestions([question(items, { type: 'ordering' })], { classic: true })
    expect(result.skipped).toEqual([])
    const played = result.questions[0]!
    // A felkínált sor nem a szerzői sorrend.
    expect(played.choices).not.toEqual(['Első', 'Második', 'Harmadik', 'Negyedik'])
    expect([...played.choices].sort()).toEqual(['Első', 'Harmadik', 'Második', 'Negyedik'])
    // A helyes sorrend a felkínált indexekkel: az első szerzői elem helye elöl.
    expect(played.correctOrder).toHaveLength(4)
    expect(new Set(played.correctOrder)).toEqual(new Set([0, 1, 2, 3]))
    expect(played.correctOrder![0]).toBe(played.choices.indexOf('Első'))
    expect(played.correctOrder![1]).toBe(played.choices.indexOf('Második'))
    expect(played.correct).toBe(played.correctOrder![0])
    // Ugyanaz a kérdés minden futásban ugyanazt a sorrendet adja (minden eszközön ez kell).
    const again = playableQuestions([question(items, { type: 'ordering' })], { classic: true })
    expect(again.questions[0]!.choices).toEqual(played.choices)
  })

  test('a Multiple Answer question is played in Classic, with every right choice, and left out elsewhere', () => {
    const bank = question(
      [choice('Párizs', true), choice('Lyon'), choice('Róma', true)],
      { type: 'multiple-answer' },
    )
    const classic = playableQuestions([bank], { classic: true })
    expect(classic.skipped).toEqual([])
    expect(classic.questions[0]).toMatchObject({
      choices: ['Párizs', 'Lyon', 'Róma'],
      correct: 0,
      correctChoices: [0, 2],
    })

    // A Bajnok és a Veszély! egy választ vár: ott ez a típus kimarad, indoklással.
    const single = playableQuestions([bank])
    expect(single.questions).toHaveLength(0)
    expect(single.skipped[0].reason).toBe(
      t('game.skip.multipleMode', { type: SECTION_LABELS['multiple-answer'] }),
    )
  })

  test('a Multiple Answer question marks one right answer as a plain single choice', () => {
    const result = playableQuestions(
      [question([choice('A', true), choice('B')], { type: 'multiple-answer' })],
      { classic: true },
    )
    expect(result.questions[0]).toMatchObject({ correct: 0, correctChoices: [0] })
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

describe('shuffling the answers a game shows', () => {
  const four = () => question([
    choice('Egy'),
    choice('Kettő'),
    choice('Három', true),
    choice('Négy'),
  ])

  test('the card question is shown in another order, and the right answer moves with it', () => {
    const authored = playableQuestions([four()]).questions[0]!
    expect(authored.choices).toEqual(['Egy', 'Kettő', 'Három', 'Négy'])
    expect(authored.correct).toBe(2)

    const shuffled = playableQuestions([four()], { shuffleAnswers: true }).questions[0]!
    // A készlet ugyanaz, a sorrend nem a szerzői, és a helyes válasz arra a
    // kártyára mutat, amelyen a szövege áll.
    expect([...shuffled.choices].sort()).toEqual(['Egy', 'Három', 'Kettő', 'Négy'].sort())
    expect(shuffled.choices).not.toEqual(authored.choices)
    expect(shuffled.choices[shuffled.correct]).toBe('Három')
  })

  test('every device computes the same order, so a room never disagrees', () => {
    const once = playableQuestions([four()], { shuffleAnswers: true }).questions[0]!
    const twice = playableQuestions([four()], { shuffleAnswers: true }).questions[0]!
    expect(twice.choices).toEqual(once.choices)
    expect(twice.correct).toBe(once.correct)
  })

  test('a question with several right answers keeps all of them, at their new places', () => {
    const several = () => question(
      [choice('A', true), choice('B'), choice('C', true), choice('D')],
      { type: 'multiple-answer' },
    )
    const shuffled = playableQuestions([several()], { shuffleAnswers: true, classic: true }).questions[0]!
    const right = shuffled.correctChoices!.map((index) => shuffled.choices[index])
    expect(right.sort()).toEqual(['A', 'C'])
  })

  test('a True/False pair keeps its order: the two answers are not interchangeable', () => {
    const pair = () => question([choice('True', true), choice('False')], { type: 'true-false' })
    const shuffled = playableQuestions([pair()], { shuffleAnswers: true }).questions[0]!
    expect(shuffled.choices).toHaveLength(2)
    expect(shuffled.correct).toBe(0)
  })

  test('turned off, the bank’s own order is what the stage shows', () => {
    const kept = playableQuestions([four()], { shuffleAnswers: false }).questions[0]!
    expect(kept.choices).toEqual(['Egy', 'Kettő', 'Három', 'Négy'])
    expect(kept.correct).toBe(2)
  })

  test('two answers are shuffled too', () => {
    const pair = () => question([choice('Első', true), choice('Második')])
    const shuffled = playableQuestions([pair()], { shuffleAnswers: true }).questions[0]!
    expect(shuffled.choices[shuffled.correct]).toBe('Első')
  })
})
})
