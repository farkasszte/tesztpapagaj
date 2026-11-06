import { expect, test, type Page } from '@playwright/test'

// tp#45: differenciált kvíz — két bank egyszerre, a diák a belépésnél választ
// oldalt. A két oldal ugyanannyi kérdést játszik: a hosszabbat a rövidebbre
// vágjuk, és ezt a beállítás ki is mondja.
//
// A két diák együttes játékához a szoba-relay kell (a `game-devices.e2e.ts`
// mintája); ez a spec a választás és a vágás felületét méri.

const question = (id: string, stem: string) => ({
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

async function seedBanks(page: Page): Promise<void> {
  await page.goto('/about')
  await page.evaluate(async (given) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const existing = new Set((await banks.recent()).map((summary) => summary.name))
    for (const one of given) {
      if (existing.has(one.name)) continue
      const bank = await banks.create()
      await banks.commit(bank.id, { kind: 'rename', name: one.name })
      await banks.commit(bank.id, { kind: 'create-questions', questions: one.questions as never })
    }
  }, [
    {
      name: 'Split alap',
      questions: [question('a1', 'Első alap kérdés'), question('a2', 'Második alap kérdés'), question('a3', 'Harmadik alap kérdés')],
    },
    {
      name: 'Split haladó',
      questions: [question('b1', 'Első haladó kérdés'), question('b2', 'Második haladó kérdés')],
    },
  ])
}

test('a differenciált mód két bankot kér, és a hosszabbat a rövidebbre vágja', async ({ page }) => {
  await seedBanks(page)
  await page.goto('/jatek').catch(() => undefined)

  await page.getByRole('button', { name: /^Split quiz/ }).click()
  // Két bankválasztó: bal és jobb oldal.
  await expect(page.locator('#gq-bank')).toBeVisible()
  await expect(page.locator('#gq-bank-b')).toBeVisible()

  // 3 és 2 kérdés: a közös kör 2 kérdés.
  await expect(page.getByText('2 questions in the shared round')).toBeVisible()
  await expect(page.getByText('Only single-answer questions can be played: the other types are left out.')).toBeVisible()

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  // A belépő link viszi az oldalválasztást: a QR ugyanaz, a link jelzi a módot.
  await expect(lobby.locator('.gq-lobby-url')).toContainText('oldal=1')
})

test('a diák a belépésnél oldalt választ, oldal nélkül nem lép be', async ({ page }) => {
  // A belépő űrlap relay nélkül is kirajzolódik: a választó és a kötelezőség
  // itt mérhető.
  await page.goto('/jatek?kod=123456&oldal=1')
  const sides = page.locator('.gq-stu-side')
  await expect(sides).toHaveCount(2)
  await expect(sides.first()).toHaveText('Side A')

  await page.getByPlaceholder('For example: Panni').fill('Panni')
  await page.getByRole('button', { name: 'Join the game' }).click()
  // Oldal nélkül kimondja, mit kell tenni.
  await expect(page.getByText('Pick a side to join.')).toBeVisible()

  await sides.nth(1).click()
  await expect(sides.nth(1)).toHaveAttribute('data-picked', 'true')
  await expect(page.getByText('Pick a side to join.')).toHaveCount(0)
})
