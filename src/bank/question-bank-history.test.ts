// Bankonkénti előzmény (C6): a legutóbbi lépések visszavonhatók, legfeljebb tíz.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, test } from 'bun:test'
import { createQuestion } from '../exam/exam'
import { HISTORY_DEPTH, createQuestionBankWorkspaceService } from './question-bank-workspaces'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

test('a hozzáadás visszavonható: a kérdés eltűnik, a bank neve marad', async () => {
  const banks = createQuestionBankWorkspaceService()
  const bank = await banks.create()
  await banks.commit(bank.id, { kind: 'rename', name: 'Biológia' })
  await banks.commit(bank.id, {
    kind: 'create-questions',
    questions: [createQuestion('open'), createQuestion('multiple-choice')],
  })
  expect((await banks.read(bank.id))?.questions).toHaveLength(2)

  const undone = await banks.undo(bank.id)
  expect(undone).not.toBeNull()
  expect(undone!.label).toBe('kérdés hozzáadása')
  const after = await banks.read(bank.id)
  expect(after?.questions).toHaveLength(0)
  expect(after?.name).toBe('Biológia')

  // Egy lépéssel tovább: az átnevezés is visszajön.
  await banks.undo(bank.id)
  expect((await banks.read(bank.id))?.name).not.toBe('Biológia')
})

test('a törlés visszavonható: a kérdés ugyanazzal az azonosítóval jön vissza', async () => {
  const banks = createQuestionBankWorkspaceService()
  const bank = await banks.create()
  // Nevesített bank: a névtelen, üres bankot a törlés magával viszi.
  await banks.commit(bank.id, { kind: 'rename', name: 'Kémia' })
  const question = createQuestion('open')
  await banks.commit(bank.id, { kind: 'create-question', question })

  await banks.permanentlyDeleteQuestion(bank.id, question.id, async () => ({
    rollback: async () => undefined,
    finalize: async () => undefined,
  }))
  expect((await banks.read(bank.id))?.questions).toHaveLength(0)

  const undone = await banks.undo(bank.id)
  expect(undone?.label).toBe('kérdés törlése')
  const after = await banks.read(bank.id)
  expect(after?.questions.map(({ id }) => id)).toEqual([question.id])
})

test('legfeljebb tíz lépés marad meg', async () => {
  const banks = createQuestionBankWorkspaceService()
  const bank = await banks.create()
  for (let step = 0; step < 14; step += 1) {
    await banks.commit(bank.id, { kind: 'rename', name: `Név ${step}` })
  }
  expect(await banks.historyLength(bank.id)).toBe(HISTORY_DEPTH)
})

test('üres előzménynél nincs mit visszavonni', async () => {
  const banks = createQuestionBankWorkspaceService()
  const bank = await banks.create()
  expect(await banks.undo(bank.id)).toBeNull()
})
