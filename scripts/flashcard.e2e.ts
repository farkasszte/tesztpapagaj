import { go } from './navigate'
import { expect, test, type Page } from '@playwright/test'

// A tanulókártya a bank oldaláról indul (`/jatek?bank=<id>&mod=kartya`): elől a
// kérdés, koppintásra a helyes válasz, a nyilak lapoznak.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

async function seedBank(page: Page): Promise<string> {
  await go(page, '/about')
  return page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
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

test('a bankból indított tanulókártya megfordul, és a helyes választ mutatja', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const bankId = await seedBank(page)

  // A tanulókártya a játék oldaláról indul: a bank a címen jön, a mód készen.
  await go(page, `/jatek?bank=${bankId}&mod=kartya`)

  // A mód már kiválasztva érkezik; a tanár indítja a paklit.
  await expect(page.getByRole('button', { name: /^Tanulókártya/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()

  const deck = page.getByRole('dialog', { name: 'Tanulókártya' })
  await expect(deck).toBeVisible()

  const card = deck.locator('.gq-card')
  await expect(card).toHaveAttribute('data-flipped', 'no')
  await expect(card).toContainText('Kártya kérdés 1')
  await expect(deck.locator('.gq-where')).toContainText('1 / 2')

  // Koppintás = fordítás: a hátlapon a kérdés saját helyes válasza áll.
  await card.click()
  await expect(card).toHaveAttribute('data-flipped', 'yes')
  await expect(deck.locator('.gq-card-answer')).toContainText('Második válasz')

  // A következő kártya újra elől van, és a saját válaszát hozza.
  await deck.getByRole('button', { name: 'Következő →' }).click()
  await expect(deck.locator('.gq-where')).toContainText('2 / 2')
  await expect(card).toHaveAttribute('data-flipped', 'no')
  await card.click()
  await expect(deck.locator('.gq-card-answer')).toContainText('Harmadik válasz')
  await expect(deck.locator('.gq-card-answer')).not.toContainText('Második válasz')

  // A keverés ugyanazt a két kártyát tartja, csak más sorrendben.
  await deck.getByRole('button', { name: 'Keverés' }).click()
  await expect(deck.locator('.gq-where')).toContainText('1 / 2')
})

test('a tanulókártya szóközre is fordul', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const bankId = await seedBank(page)
  await go(page, `/jatek?bank=${bankId}&mod=kartya`)
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()

  const deck = page.getByRole('dialog', { name: 'Tanulókártya' })
  const card = deck.locator('.gq-card')
  await expect(card).toHaveAttribute('data-flipped', 'no')
  await page.keyboard.press('Space')
  await expect(card).toHaveAttribute('data-flipped', 'yes')
  await page.keyboard.press('ArrowRight')
  await expect(deck.locator('.gq-where')).toContainText('2 / 2')
})
