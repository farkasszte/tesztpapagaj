import { expect, test } from '@playwright/test'
import { go } from './navigate'

/**
 * Gyakorló (tp#53): a végén a rossz kérdések átnézhetők, és a „csak a
 * hibásakat" újrajátszás ugyanazt a paklit szűri.
 */

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

const QUESTIONS = [
  { stem: 'Első kérdés: melyik gáz kell a növényeknek?', right: 'Oxigén' },
  { stem: 'Második kérdés: mi keletkezik a fotoszintézisben?', right: 'Oxigén' },
  { stem: 'Harmadik kérdés: mi a klorofill színe?', right: 'Zöld' },
]

async function seed(page: import('@playwright/test').Page): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    try {
      return await page.evaluate(async ({ suffix, questions }) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const bank = await banks.create()
        await banks.commit(bank.id, { kind: 'rename', name: 'Hibalista próba' })
        await banks.commit(bank.id, {
          kind: 'create-questions',
          questions: questions.map((item, index) => ({
            id: `pr-${suffix}-${index}`,
            type: 'multiple-choice',
            columns: 1,
            doc: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: item.stem }] },
                {
                  type: 'multipleChoice',
                  content: ['Oxigén', 'Zöld', 'Hélium'].map((text) => ({
                    type: 'multipleChoiceChoice',
                    attrs: { correct: text === item.right, id: text },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                  })),
                },
              ],
            },
          })) as never,
        })
        return bank.id
      }, { suffix: tag, questions: QUESTIONS })
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('a végén a rossz kérdés átnézhető, és csak azt lehet újrajátszani', async ({ page }) => {
  test.setTimeout(120_000)
  const bankId = await seed(page)
  await go(page, `/gyakorlas?bank=${bankId}`)

  // Első kettő helyes, a harmadik rossz.
  const answer = async (text: string) => {
    await page.locator('.practice-choice').filter({ hasText: text }).click()
  }
  await answer('Oxigén')
  await page.getByRole('button', { name: 'Következő kérdés' }).click()
  await answer('Oxigén')
  await page.getByRole('button', { name: 'Következő kérdés' }).click()
  await answer('Hélium') // rossz: a helyes a Zöld
  await page.getByRole('button', { name: 'Eredmény' }).click()

  // 2/3 — 67%, és a rossz kérdés a helyes válasszal.
  await expect(page.locator('.practice-score-fraction')).toHaveText('2/3')
  await expect(page.locator('.practice-score-percent')).toHaveText('67%')
  const review = page.locator('.practice-review li')
  await expect(review).toHaveCount(1)
  await expect(review.first()).toContainText('Harmadik kérdés')
  await expect(review.first()).toContainText('Zöld')

  // „Csak ezeket gyakorlom": egyetlen kérdés marad, és most sikerül.
  await page.getByRole('button', { name: 'Csak ezeket gyakorlom' }).click()
  await expect(page.locator('.practice-count')).toContainText('1')
  await answer('Zöld')
  await page.getByRole('button', { name: 'Eredmény' }).click()
  await expect(page.locator('.practice-score-fraction')).toHaveText('1/1')
  await expect(page.locator('.practice-score-percent')).toHaveText('100%')
  // Nincs több rossz: nincs hibalista.
  await expect(page.locator('.practice-review')).toHaveCount(0)

  // A megosztás a helyes szöveget adja át (bank, tört, százalék, dátum).
  // A gomb a megosztandó szöveget is hordozza (title + data-share-text): a
  // felület és a felolvasó ugyanazt mondja, amit a megosztás elküld.
  const shareButton = page.getByRole('button', { name: 'Eredmény megosztása' })
  await expect(shareButton).toHaveAttribute(
    'data-share-text',
    /^Hibalista próba — 1\/1 \(100%\) — \d{4}\. \d{2}\. \d{2}\.$/,
  )
})
