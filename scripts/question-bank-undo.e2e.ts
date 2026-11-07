import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// Bankonkénti előzmény (C6): a legutóbbi lépés visszavonható a bank oldaláról.

const openQuestion = (id: string, stem: string) => ({
  id,
  type: 'open' as const,
  columns: 1 as const,
  doc: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: stem }] }],
  },
})

/**
 * A bank két kérdéssel. A vetés maga is lépéseket hoz létre az előzményben, és
 * minden próbálkozás **saját** azonosítókat és nevet kap: az első futás írása
 * után a böngésző elviheti a választ, és a kérdés-azonosítók nem ismételhetők.
 */
async function seedBank(page: Page): Promise<{ id: string; name: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    const name = `Undo bank ${tag}`
    try {
      const id = await page.evaluate(
        async ({ questions, bankName }) => {
          const { createQuestionBankWorkspaceService } = (await import(
            /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
          )) as typeof import('../src/bank/question-bank-workspaces')
          const banks = createQuestionBankWorkspaceService()
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name: bankName })
          await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
          return bank.id
        },
        { questions: [openQuestion(`u1-${tag}`, 'Első kérdés'), openQuestion(`u2-${tag}`, 'Második kérdés')], bankName: name },
      )
      return { id, name }
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test('a bankon a legutóbbi lépés visszavonható', async ({ page }) => {
  test.setTimeout(120_000)
  const bank = await seedBank(page)

  await go(page, `/question-bank?id=${bank.id}`)
  const rows = page.locator('[data-question-id]')
  await expect(rows).toHaveCount(2)

  // A felület nyelve a teszt-konfigurációból angol, de magyarul is működik.
  await page.getByRole('button', { name: /^(Visszavonás|Undo)$/ }).click()

  // A vetés utolsó lépése a két kérdés hozzáadása volt: a visszavonás után
  // üres a bank, a neve marad.
  await expect(rows).toHaveCount(0)
  await expect(page.getByText(bank.name).first()).toBeVisible()
})
