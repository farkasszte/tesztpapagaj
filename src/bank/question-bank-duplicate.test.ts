// A kérdésbank másolata önálló bank: ugyanazok a kérdések új azonosítóval, saját
// névvel. A másolat nem írhatja át az eredetit, és az eredeti sem a másolatot.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, test } from 'bun:test'
import { createQuestion } from '../exam/exam'
import { createQuestionBankWorkspaceService } from './question-bank-workspaces'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

test('a másolat új bank: saját azonosító, „(másolat)" név, ugyanazok a kérdések', async () => {
  const banks = createQuestionBankWorkspaceService()
  const source = await banks.create()
  await banks.commit(source.id, { kind: 'rename', name: 'Biológia alapok' })
  const first = createQuestion('open')
  const second = createQuestion('multiple-choice')
  await banks.commit(source.id, { kind: 'create-questions', questions: [first, second] })

  const copy = await banks.duplicate(source.id)
  expect(copy).not.toBeNull()
  expect(copy!.id).not.toBe(source.id)
  expect(copy!.name).toBe('Biológia alapok (másolat)')
  expect(copy!.questions).toHaveLength(2)

  // A kérdések azonosítói újak: a két bank kérdései nem ütközhetnek.
  const rereadSource = await banks.read(source.id)
  const sourceIds = (rereadSource?.questions ?? []).map(({ id }) => id)
  const copyIds = copy!.questions.map(({ id }) => id)
  expect(copyIds.some((id) => sourceIds.includes(id))).toBe(false)
  expect(new Set([...sourceIds, ...copyIds]).size).toBe(4)
  // A tartalom viszont ugyanaz.
  expect(copy!.questions.map((question) => question.type)).toEqual(['open', 'multiple-choice'])
})

test('a másolat független: az egyik bank átnevezése nem érinti a másikat', async () => {
  const banks = createQuestionBankWorkspaceService()
  const source = await banks.create()
  await banks.commit(source.id, { kind: 'rename', name: 'Kémia' })
  const copy = await banks.duplicate(source.id)

  await banks.commit(copy!.id, { kind: 'rename', name: 'Kémia — haladó' })

  const rereadSource = await banks.read(source.id)
  const rereadCopy = await banks.read(copy!.id)
  expect(rereadSource?.name).toBe('Kémia')
  expect(rereadCopy?.name).toBe('Kémia — haladó')
})

test('nem létező bankot nem lehet másolni', async () => {
  const banks = createQuestionBankWorkspaceService()
  expect(await banks.duplicate('nincs-ilyen')).toBeNull()
})
