import { expect, test } from 'bun:test'
import { questionBankCollection } from './resource-collections'
import type { QuestionBankCollectionItem } from './resource-collections'

/**
 * A gyűjtemény felépítése kötegelt: száz banknál a bankonkénti teljes
 * újraolvasás és a vizsgánkénti ismételt bejárás másodperceket vitt el, ezért
 * a szolgáltatás egyszer adja a kérdés-azonosítókat és a használati térképet.
 * Ez a teszt azt rögzíti, hogy a gyors út nem esik vissza a lassúra.
 */

const bank = (id: string, name: string): QuestionBankCollectionItem => ({
  id,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  questionCount: 1,
  topics: [],
  usage: [],
})

test('a gyűjtemény kötegelve olvas: bankonként nem nyúl a tárolóhoz', async () => {
  const banks = [bank('1', 'Biology'), bank('2', 'Chemistry')]
  const read = async () => {
    throw new Error('bankonkénti olvasás: ez volt a lassulás oka')
  }
  const questionIds = async () => new Map([['1', ['q1', 'q2']], ['2', ['q3']]])
  const usageIndex = async () => new Map([
    ['q1', [{ examId: 'e1', title: 'Exam', saved: true, workingCopy: false }]],
    ['q2', [{ examId: 'e1', title: 'Exam', saved: true, workingCopy: false }]],
    ['q3', [{ examId: 'e2', title: 'Other', saved: false, workingCopy: true }]],
  ])
  const resourceUsage = async () => {
    throw new Error('vizsgánkénti újraolvasás: ez is a lassulás oka')
  }
  const collection = await questionBankCollection(
    banks,
    { read, questionIds } as never,
    { usageIndex, resourceUsage } as never,
  )
  // Egy vizsga egyszer szerepel, akkor is, ha több kérdése van a bankban.
  expect(collection[0].usage.map((usage) => usage.examId)).toEqual(['e1'])
  expect(collection[1].usage.map((usage) => usage.examId)).toEqual(['e2'])
})

test('a régi (egyenkénti) út is működik, ha a szolgáltatás nem tud kötegelni', async () => {
  const banks = [bank('1', 'Biology')]
  const read = async () => ({ questions: [{ id: 'q1' }] })
  const resourceUsage = async (ids: readonly string[]) =>
    ids.length === 1 ? [{ examId: 'e1', title: 'Exam', saved: true, workingCopy: false }] : []
  const collection = await questionBankCollection(banks, { read } as never, { resourceUsage } as never)
  expect(collection[0].usage.map((usage) => usage.examId)).toEqual(['e1'])
})
