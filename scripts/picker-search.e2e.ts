// The bank picker's search box.
//
// A teacher with a dozen Question Banks finds one by name, not by scrolling —
// and types it the way a keyboard offers it, without the accents. The box
// narrows the list, says so when nothing answers, and Enter opens the one name
// a query has left.
import { expect, test, type Page } from '@playwright/test'
import { seedAuthoringState } from './seed-authoring'

const NAMES = [
  'Tündér és legendamesék',
  'Mentálhigiéné 1.',
  'Mozgásfejlődés (új)',
  'Látásfogyatékosok oktatása',
  'Emlékezet',
  'Érzéki csalódások, konstanciák',
  'Gondolkodás_intelligencia_26',
  'Játékped1 (művelet+szerep)',
  'Társadalomtudomány vizsgára 1',
  'Összefoglalás 2',
  'Szenzomotoros fejlődés',
  'Tanulás és memória',
]

const question = {
  id: 'q1',
  type: 'open' as const,
  columns: 1 as const,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Egy kérdés.' }] }] },
}

async function open(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await seedAuthoringState(page, {
    questionBank: { questions: [question] },
    workingCopy: { title: 'Dolgozat', questionIds: ['q1'] },
    dirty: false,
  })
  await page.locator('.exam-page').first().waitFor()
  // A dozen banks, named the way a teacher names them.
  await page.evaluate(async (names: string[]) => {
    const { createQuestionBankWorkspaceService } = await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    ) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    for (const name of names) {
      const bank = await banks.create()
      await banks.commit(bank.id, { kind: 'rename', name })
    }
  }, NAMES)
  await page.goto('/editor')
  await page.getByRole('textbox', { name: 'Exam name' }).waitFor()
}

test('the picker searches names without accents', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Open Question Bank' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Open Question Bank' })
  await expect(dialog).toBeVisible()
  const search = dialog.getByRole('searchbox')
  await expect(search).toBeVisible()

  const rows = dialog.locator('.resource-picker-list > button')
  await expect.poll(() => rows.count()).toBeGreaterThan(10)

  await search.fill('tunder')
  await expect.poll(() => rows.count()).toBe(1)
  await expect(rows.first()).toContainText('Tündér és legendamesék')

  await search.fill('orzeszet')
  await expect(dialog).toContainText('No name matches this search.')
  await expect.poll(() => rows.count()).toBe(0)

  await search.fill('memoria')
  await expect.poll(() => rows.count()).toBe(1)
  await expect(rows.first()).toContainText('Tanulás és memória')

  // Enter opens the one name the query narrows to.
  await search.press('Enter')
  await expect(dialog).toBeHidden()

  // The picker comes back with its box empty, not with the last query in it.
  await page.getByRole('button', { name: 'Open Question Bank' }).first().click()
  const reopened = page.getByRole('dialog', { name: 'Open Question Bank' })
  await expect(reopened.getByRole('searchbox')).toHaveValue('')
  await expect.poll(() => reopened.locator('.resource-picker-list > button').count()).toBeGreaterThan(10)
})
