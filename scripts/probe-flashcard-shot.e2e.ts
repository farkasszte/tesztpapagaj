import { expect, test } from '@playwright/test'

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

async function seedBank(page: Page): Promise<string> {
  await page.goto('/about')
  return page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Kártyás bank' })
    const question = (index: number, correct: number) => ({
      id: `k${index}`,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Kártya kérdés ${index}` }] },
          {
            type: 'multipleChoice',
            content: ['Első válasz', 'Második válasz', 'Harmadik válasz'].map((text, choiceIndex) => ({
              type: 'multipleChoiceChoice',
              attrs: { id: `k${index}-${choiceIndex}`, correct: choiceIndex === correct },
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      },
    })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [question(1, 1), question(2, 2)],
    } as never)
    return bank.id
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

// Képernyőképek a tanulókártya két oldaláról (1440×1000), hogy a tipográfia és a
// papírkártya kontrasztja szemmel is ellenőrizhető legyen.
test('tanulókártya képernyőképek', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const bankId = await seedBank(page)
  await page.goto(`/jatek?bank=${bankId}&mod=kartya`)
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const deck = page.getByRole('dialog', { name: 'Tanulókártya' })
  await expect(deck).toBeVisible()
  await page.screenshot({ path: 'E:/AI/hermes/cache/scratch/card-front.png' })
  await deck.locator('.gq-card').click()
  await expect(deck.locator('.gq-card')).toHaveAttribute('data-flipped', 'yes')
  await page.screenshot({ path: 'E:/AI/hermes/cache/scratch/card-back.png' })
})
