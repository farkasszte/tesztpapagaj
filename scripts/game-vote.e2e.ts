import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'
import { connectRelay } from './room-mock'

// Szavazás (B5): a helyes válasz nélküli kérdés játszható, a diák szavaz, a
// tanár színpada a megoszlást mutatja — pont és jó/rossz jelölés nélkül.

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }

const voteQuestion = (id: string, stem: string, choices: string[]) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: choices.map((text, index) => ({
          type: 'multipleChoiceChoice',
          // Szavazás: egyik válasz sincs megjelölve helyesként.
          attrs: { id: `${id}-${index}`, correct: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      },
    ],
  },
})

const QUESTIONS = [
  voteQuestion('v1', 'Melyik hőmérséklet kellemes az osztálynak?', ['18 °C', '21 °C', '24 °C']),
]

async function seedBank(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    try {
      await page.evaluate(async (questions) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const existing = new Set((await banks.recent()).map((one) => one.name))
        if (existing.has('Vote bank')) return
        const bank = await banks.create()
        await banks.commit(bank.id, { kind: 'rename', name: 'Vote bank' })
        await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
      }, QUESTIONS)
      return
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, ENGLISH)
})

test('szavazás: a diák szavaz, a színpad a megoszlást mutatja', async ({ page }) => {
  test.setTimeout(120_000)
  await seedBank(page)
  await connectRelay(page.context())
  await go(page, '/jatek')

  await page.getByRole('button', { name: /^Straw poll/ }).click()
  await expect(page.locator('#gq-bank')).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  const phone = await page.context().newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await phone.getByPlaceholder('For example: Panni').fill('Panni')
  await phone.getByRole('button', { name: 'Join the game' }).click()
  await expect(phone.getByText('You are in.')).toBeVisible({ timeout: 15_000 })

  await lobby.getByRole('button', { name: 'Start the game' }).click()
  const stage = page.locator('.gq-stage').first()
  await expect(stage).toBeVisible()
  await expect(stage.getByText('Melyik hőmérséklet kellemes az osztálynak?')).toBeVisible()

  // A diák szavaz — nincs jó vagy rossz válasz.
  await expect(phone.locator('.gq-stu-choice')).toHaveCount(3)
  await phone.locator('.gq-stu-choice').filter({ hasText: '21 °C' }).click()

  // A tanár felfedi: a szavazat a betű helyén számként látszik. Ha mindenki
  // szavazott, a motor magától felfed — a gombot csak akkor nyomjuk meg, ha van.
  const show = stage.getByRole('button', { name: 'Show the answer' })
  if (await show.isVisible().catch(() => false)) await show.click()
  const counted = stage.locator('.gq-answer[data-counts="true"]')
  await expect(counted).toHaveCount(3, { timeout: 15_000 })
  await expect(stage.locator('.gq-answer').filter({ hasText: '21 °C' })).toContainText('1')
  // Nincs jó válasz, ezért nincs pipa sem.
  await expect(stage.locator('.gq-tick')).toHaveCount(0)
  // Pont nincs: a szavazás nem verseny.
  await expect(phone.locator('.gq-stu-points')).toHaveCount(0)
  await phone.close()
})
