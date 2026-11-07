import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// Kérdés áthelyezése másik bankba (C7): a kérdés bankot vált, az azonosítója
// marad, és nem lehet egyszerre két bankban.

async function seedBanks(page: Page): Promise<{ source: string; target: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    try {
      const ids = await page.evaluate(async ({ suffix }) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const make = async (name: string, stem: string) => {
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name })
          await banks.commit(bank.id, {
            kind: 'create-questions',
            questions: [{
              id: `m-${suffix}-${name}`,
              type: 'open',
              columns: 1,
              doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: stem }] }] },
            }] as never,
          })
          return bank.id
        }
        return {
          source: await make(`Move from ${suffix}`, 'Áthelyezendő kérdés'),
          target: await make(`Move to ${suffix}`, 'Cél bank kérdése'),
        }
      }, { suffix: tag })
      return ids
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bankok vetése nem sikerült')
}

test('a kérdés átkerül a másik bankba, és a forrásból eltűnik', async ({ page }) => {
  test.setTimeout(120_000)
  const banks = await seedBanks(page)

  await go(page, `/question-bank?id=${banks.source}`)
  const rows = page.locator('[data-question-id]')
  await expect(rows).toHaveCount(1)

  // A kérdés szerkesztője: „Move to another Question Bank…".
  await rows.first().click()
  await page.getByRole('button', { name: /Move to another Question Bank/ }).click()

  // A választóban a cél bank.
  const picker = page.getByRole('dialog')
  await picker.getByRole('button', { name: /^Move to / }).first().click()

  // A forrás bank kiürült, a kérdés a cél bankban van.
  await expect(rows).toHaveCount(0)
  await expect(page.getByText(/Moved into/)).toBeVisible()

  await go(page, `/question-bank?id=${banks.target}`)
  await expect(page.locator('[data-question-id]')).toHaveCount(2)
  await expect(page.getByText('Áthelyezendő kérdés')).toBeVisible()
})
