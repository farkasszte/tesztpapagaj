import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// A kérdésbank másolata („Duplicate Question Bank"): a tanár ugyanarra a bankra
// építhet variánst anélkül, hogy az eredetit átírná.

const openQuestion = (id: string, stem: string) => ({
  id,
  type: 'open' as const,
  columns: 1 as const,
  doc: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: stem }] }],
  },
})

async function seed(page: Page) {
  const questions = [openQuestion('copy-1', 'Első kérdés'), openQuestion('copy-2', 'Második kérdés')]
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    try {
      await page.evaluate(async (given) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const service = createQuestionBankWorkspaceService()
        const existing = new Set((await service.recent()).map((one) => one.name))
        if (existing.has('Copy source')) return
        const bank = await service.create()
        await service.commit(bank.id, { kind: 'rename', name: 'Copy source' })
        await service.commit(bank.id, { kind: 'create-questions', questions: given as never })
      }, questions)
      return
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test('a kérdésbank másolható a listáról, és a másolat önálló bank', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await go(page, '/question-banks')

  const cards = page.locator('.question-bank-card')
  await expect(cards).toHaveCount(1)
  await expect(page.getByText('Copy source', { exact: true })).toBeVisible()

  // A kártya menüje: „Duplicate Question Bank".
  await cards.first().locator('.bank-card-menu').click()
  await page.getByRole('menuitem', { name: 'Duplicate Question Bank' }).click()

  await expect(cards).toHaveCount(2)
  await expect(page.getByText('Copy source (copy)', { exact: true })).toBeVisible()
  // Az eredeti a helyén marad.
  await expect(page.getByText('Copy source', { exact: true })).toBeVisible()

  // A másolat ugyanazokat a kérdéseket hozza — és a saját oldalán nyílik meg.
  const copy = cards.filter({ hasText: 'Copy source (copy)' })
  await copy.locator('.resource-card-main').click()
  await expect(page.getByText('Első kérdés')).toBeVisible()
  await expect(page.getByText('Második kérdés')).toBeVisible()

  // A másolat tartós: újratöltés után is két bank van.
  await go(page, '/question-banks')
  await expect(page.locator('.question-bank-card')).toHaveCount(2)
})
