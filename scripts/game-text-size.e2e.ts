import { expect, test, type Page } from '@playwright/test'

// tp#47: a szövegméret állítható a színpadon és a diák telefonján. A lépcső
// szűk (85 / 100 / 115 / 130%), csak a kérdés és a válaszok betűjét szorozza,
// a váz nem mozdul; a választás a készülék tárolójában marad.

const multiChoice = (id: string, stem: string) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: [
          ['Oxygen', false],
          ['Carbon dioxide', true],
          ['Helium', false],
        ].map(([text, correct], index) => ({
          type: 'multipleChoiceChoice',
          attrs: { id: `${id}-${index}`, correct },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }],
        })),
      },
    ],
  },
})

async function seedBank(page: Page): Promise<void> {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await page.evaluate(async (questions) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Text size bank' })
    await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
  }, [multiChoice('t1', 'Which gas do plants take in, and why does that matter for the classroom?')])
}

test('a színpadon állítható a szövegméret, és megmarad újratöltés után', async ({ page }) => {
  await seedBank(page)
  await page.goto('/jatek')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const stage = page.locator('.gq-stage')
  await expect(stage).toBeVisible()
  const prompt = stage.locator('.gq-prompt')
  await expect(prompt).toBeVisible()
  const base = Number.parseFloat(await prompt.evaluate((node) => getComputedStyle(node).fontSize))

  // A méret a dokumentum gyökerén áll, ezért a színpad és a telefon ugyanazt
  // a lépcsőt használja.
  const scale = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gq-text').trim(),
    )
  expect(await scale()).toBe('1')

  await page.getByRole('button', { name: 'Larger text' }).click()
  await expect.poll(scale).toBe('1.15')
  const bigger = Number.parseFloat(await prompt.evaluate((node) => getComputedStyle(node).fontSize))
  expect(bigger).toBeGreaterThan(base)

  // Kétszer még nagyobb, de a lépcső végén megáll (a gomb letiltva).
  await page.getByRole('button', { name: 'Larger text' }).click()
  await expect.poll(scale).toBe('1.3')
  await expect(page.getByRole('button', { name: 'Larger text' })).toBeDisabled()

  // Újratöltés után is megmarad: a választás a készülék tárolójában él.
  await page.reload()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect.poll(scale).toBe('1.3')

  // Kisebb: vissza a második lépcsőre.
  await page.getByRole('button', { name: 'Smaller text' }).click()
  await expect.poll(scale).toBe('1.15')

  // A válasz szövege is követi a méretet (nem csak a kérdés).
  const answer = page.locator('.gq-answer .doc-content').first()
  const answerSize = Number.parseFloat(
    await answer.evaluate((node) => getComputedStyle(node).fontSize),
  )
  await page.getByRole('button', { name: 'Larger text' }).click()
  await expect
    .poll(async () =>
      Number.parseFloat(await answer.evaluate((node) => getComputedStyle(node).fontSize)),
    )
    .toBeGreaterThan(answerSize)
})
