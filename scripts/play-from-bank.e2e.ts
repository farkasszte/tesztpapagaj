import { expect, test, type Page } from '@playwright/test'

// A bank oldaláról egy koppintással indul a játék: `/jatek?bank=<id>`.
// Ha a kért bank nincs meg, a játék kimondja, és az első bankra esik vissza.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

async function seedBank(page: Page): Promise<string> {
  await page.goto('/about')
  const id = await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Játszó bank' })
    const question = (index: number) => ({
      id: `p${index}`,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Bank kérdés ${index}` }] },
          {
            type: 'multipleChoice',
            content: [
              ['Oxigén', false],
              ['Szén-dioxid', true],
              ['Hélium', false],
            ].map(([text, correct], choiceIndex) => ({
              type: 'multipleChoiceChoice',
              attrs: { id: `p${index}-${choiceIndex}`, correct },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }],
            })),
          },
        ],
      },
    })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [question(1), question(2)],
    } as never)
    return bank.id
  })
  return id
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('a bank oldaláról indított játék ugyanazt a bankot választja ki', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const bankId = await seedBank(page)

  await page.goto(`/question-bank?id=${bankId}`)
  await page.getByRole('button', { name: 'Játssz ebből a bankból' }).click()

  await expect(page).toHaveURL(new RegExp(`/jatek[?]bank=${bankId}`))
  // A játék oldala a kért bankot állítja be, és látja, hogy játszható.
  await expect(page.getByText('2 kérdésből 2 játszható.')).toBeVisible()
  const select = page.locator('#gq-bank')
  await expect(select).toHaveValue(bankId)
})

test('a nem létező bankot a játék kimondja, és nem némán vált', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBank(page)
  await page.goto('/jatek?bank=nincs-ilyen')
  await expect(page.getByRole('alert').filter({ hasText: 'Ez a bank már nincs meg' })).toBeVisible()
})
