import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convert, mapQuestion } from './zsirkreta-to-parrot'

/**
 * A Zsírkréta → Tesztpapagáj leképezés: a kérdéstípusok és a válaszok alakja.
 * A bemeneti alakok a valós adatból jönnek (a beépített minta régi formátuma és
 * a típusdefiníció újabb `{text, isCorrect}` változata is).
 */

const z = (type: string, data: Record<string, unknown>, question = 'Kérdés?') => ({ id: 'z1', type, question, data })

describe('Zsírkréta kérdés → Tesztpapagáj kérdés', () => {
  test('egyszeres választás a régi alakból (options + correct index)', () => {
    const mapped = mapQuestion(z('single', { options: ['A', 'B', 'C'], correct: 1 }), 0)
    expect('question' in mapped).toBe(true)
    if (!('question' in mapped)) return
    expect(mapped.question.type).toBe('multiple-choice')
    const node = (mapped.question.doc.content as { type: string; content: { attrs: { correct: boolean } }[] }[])[1]
    expect(node.type).toBe('multipleChoice')
    expect(node.content.map((choice) => choice.attrs.correct)).toEqual([false, true, false])
  })

  test('többszörös választás a helyes indexekkel, hibakereső változatban is', () => {
    const plain = mapQuestion(z('multiple', { options: ['A', 'B', 'C'], correct: [0, 2] }), 1)
    if (!('question' in plain)) throw new Error('nem képezte le')
    expect(plain.question.type).toBe('multiple-answer')
    const node = (plain.question.doc.content as { type: string; content: { attrs: { correct: boolean } }[] }[])[1]
    expect(node.content.map((choice) => choice.attrs.correct)).toEqual([true, false, true])

    // Egyetlen helyes válasz mellett ez a gyakorlatban egyszeres választás.
    const one = mapQuestion(z('multiple-error', { options: ['A', 'B', 'C'], correct: [1] }), 2)
    if (!('question' in one)) throw new Error('nem képezte le')
    expect(one.question.type).toBe('multiple-choice')

    // Helyes válasz nélkül viszont nincs mit pontozni (szavazás/vélemény).
    const none = mapQuestion(z('multiple', { options: ['A', 'B'], correct: [] }), 3)
    expect('skip' in none).toBe(true)
    if ('skip' in none) expect(none.skip).toContain('szavazás')
  })

  test('igaz/hamis a régi `correct: 0|1` és az új `isTrue` alakból', () => {
    for (const [data, expected] of [
      [{ options: ['Igaz', 'Hamis'], correct: 0 }, true],
      [{ options: ['Igaz', 'Hamis'], correct: 1 }, false],
      [{ isTrue: true }, true],
      [{ isTrue: false }, false],
    ] as const) {
      const mapped = mapQuestion(z('true-false', data as Record<string, unknown>), 0)
      if (!('question' in mapped)) throw new Error('nem képezte le')
      const node = (mapped.question.doc.content as { type: string; content: { attrs: { correct: boolean } }[] }[])[1]
      expect(node.content[0].attrs.correct, JSON.stringify(data)).toBe(expected)
      expect(node.content[1].attrs.correct, JSON.stringify(data)).toBe(!expected)
    }
  })

  test('sorrend: a dokumentum sorrendje a helyes sorrend', () => {
    const mapped = mapQuestion(z('order', { items: ['Első', 'Második', 'Harmadik'] }), 0)
    if (!('question' in mapped)) throw new Error('nem képezte le')
    expect(mapped.question.type).toBe('ordering')
    const node = (mapped.question.doc.content as { content: { content: { content: { text: string }[] }[] }[] }[])[1]
    expect(node.content.map((choice) => choice.content[0].content[0].text)).toEqual([
      'Első',
      'Második',
      'Harmadik',
    ])
  })

  test('párosítás: fogalom és párja azonosítóval összekötve', () => {
    const mapped = mapQuestion(
      z('match', { pairs: [{ left: 'Oktatás', right: 'Arány' }, { left: 'Sport', right: 'Edzés' }] }),
      0,
    )
    if (!('question' in mapped)) throw new Error('nem képezte le')
    expect(mapped.question.type).toBe('matching')
    const node = (mapped.question.doc.content as { type: string; content: { type: string; attrs: Record<string, string> }[] }[])[1]
    expect(node.type).toBe('matching')
    const prompts = node.content.filter((entry) => entry.type === 'matchingPrompt')
    const answers = node.content.filter((entry) => entry.type === 'matchingAnswer')
    expect(prompts).toHaveLength(2)
    expect(answers).toHaveLength(2)
    // Minden fogalom a saját válaszára mutat.
    expect(prompts.map((prompt) => prompt.attrs.answer)).toEqual(answers.map((answer) => answer.attrs.id))
  })

  test('beírt válasz: az összes elfogadott alak a javasolt megoldásban', () => {
    const mapped = mapQuestion(z('text', { acceptedAnswers: ['0', 'nulla', 'semmit'] }), 0)
    if (!('question' in mapped)) throw new Error('nem képezte le')
    expect(mapped.question.type).toBe('open')
    const answer = mapped.question.suggestedAnswer as { content: { content: { text: string }[] }[] }
    expect(answer.content.map((paragraph) => paragraph.content[0].text)).toEqual(['0', 'nulla', 'semmit'])
  })

  test('aminek nincs megfelelője, kimarad és megmondja, miért', () => {
    for (const type of ['group', 'list', 'scale', 'wordcloud', 'brainstorming', 'figure-recognition']) {
      const mapped = mapQuestion(z(type, {}), 0)
      expect('skip' in mapped, type).toBe(true)
      if ('skip' in mapped) expect(mapped.skip.length).toBeGreaterThan(10)
    }
  })

  test('hiányos adat nem tör el semmit: kimarad', () => {
    expect('skip' in mapQuestion(z('single', { options: ['egy'] }), 0)).toBe(true)
    expect('skip' in mapQuestion(z('match', { pairs: [] }), 0)).toBe(true)
    expect('skip' in mapQuestion(z('text', { acceptedAnswers: [] }), 0)).toBe(true)
    expect('skip' in mapQuestion(z('order', { items: [] }), 0)).toBe(true)
  })
})

describe('vizsga → csomagok', () => {
  test('a bankok 100-as bontásban, vizsgánként egy bankba kerülnek', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zsirkreta-'))
    try {
      const exam = (title: string) => ({ id: title, title, question_ids: ['z1'] })
      const source = {
        questions: [z('single', { options: ['A', 'B'], correct: 0 })],
        exams: [exam('Egy'), exam('Kettő'), exam('Három')],
      }
      const result = await convert(source, dir, { perPackage: 2 })
      expect(result.total).toEqual({ exams: 3, kept: 3, skipped: 0 })
      expect(result.packages.map((pack) => pack.banks)).toEqual([2, 1])
      expect(result.packages.map((pack) => pack.questions)).toEqual([2, 1])

      // A csomag valódi `.parrot.zip`, a bankok benne vannak a naplóban.
      const zip = await readFile(result.packages[0].file)
      expect(zip.length).toBeGreaterThan(200)
      const summary = JSON.parse(await readFile(join(dir, 'osszefoglalo.json'), 'utf8').catch(() => 'null'))
      expect(summary).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('az azonos című vizsgák külön bank-azonosítót kapnak', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zsirkreta-'))
    try {
      const source = {
        questions: [z('single', { options: ['A', 'B'], correct: 0 })],
        exams: [
          { id: 'a', title: 'Ugyanaz', question_ids: ['z1'] },
          { id: 'b', title: 'Ugyanaz', question_ids: ['z1'] },
        ],
      }
      const result = await convert(source, dir)
      expect(result.report.map((entry) => entry.exam)).toEqual(['Ugyanaz', 'Ugyanaz'])
      expect(result.packages[0].banks).toBe(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
