import { expect, test, type Page } from '@playwright/test'
import { connectRelay } from './room-mock'

// Grand Prix és Szörnytámadás: ugyanaz a Klasszikus napló, más jelentéssel.
// A futamban a helyes válasz távot ad (a gyors nitrót), a szörnyet a többség
// helyes válasza sebzi, a rossz a pajzsot rágja.

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }

const choice = (id: string, stem: string, choices: { text: string; correct: boolean }[]) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: choices.map((entry, index) => ({
          type: 'multipleChoiceChoice',
          attrs: { id: `${id}-${index}`, correct: entry.correct },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: entry.text }] }],
        })),
      },
    ],
  },
})

const QUESTIONS = [
  choice('m1', 'Which gas do plants take in?', [
    { text: 'Oxygen', correct: false },
    { text: 'Carbon dioxide', correct: true },
    { text: 'Helium', correct: false },
  ]),
  choice('m2', 'What is the closest star to Earth?', [
    { text: 'Sirius', correct: false },
    { text: 'The Sun', correct: true },
    { text: 'Polaris', correct: false },
  ]),
]

async function seedBank(page: Page) {
  await page.goto('/about')
  await page.evaluate(async (questions) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Mode bank' })
    await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
  }, QUESTIONS)
}

/** A tanár szobát nyit, a diák bejön, és elindul a játék. */
async function joinRoom(page: Page, mode: RegExp) {
  await page.goto('/jatek')
  await page.getByRole('button', { name: mode }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')
  const student = await page.context().newPage()
  await student.setViewportSize({ width: 390, height: 844 })
  await student.goto(new URL(`/diak?kod=${code}`, page.url()).toString())
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  await expect(student.getByText('You are in.')).toBeVisible()
  await lobby.getByRole('button', { name: 'Start the game' }).click()
  return student
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, ENGLISH)
})

test('a Grand Prix a helyes válaszért távot ad, a végén győztest hirdet', async ({ page }) => {
  await seedBank(page)
  await connectRelay(page.context())
  const student = await joinRoom(page, /^Grand Prix/)

  const stage = page.getByRole('dialog', { name: 'Grand Prix' })
  await expect(stage).toBeVisible()
  // A mód minden választ számol: a beállításban ezt ki is mondja.
  const lanes = stage.locator('.gq-lane')
  await expect(lanes).toHaveCount(1)
  await expect(lanes.first()).toContainText('Panni')

  // A mezőny egyetlen ovál pályán fut: egy futó, a startvonalon (fent).
  const oval = stage.locator('.gq-oval')
  await expect(oval).toBeVisible()
  await expect(oval.locator('.gq-runner')).toHaveCount(1)
  const startTop = await oval.locator('.gq-runner').evaluate((node) => node.getBoundingClientRect().top)

  // Helyes válasz a telefonon: a futó elindul, és nitrót kap.
  const choices = student.locator('.gq-stu-choice')
  await choices.filter({ hasText: 'Carbon dioxide' }).click()
  await expect(stage.locator('.gq-lane-nitro')).toHaveCount(1)
  await expect(lanes.first()).toContainText('%')
  const halfway = await lanes.first().locator('.gq-lane-meters').innerText()
  expect(Number(halfway.replace('%', ''))).toBeGreaterThan(0)

  // A pályán is elmozdult: a futó már nem a startvonalon áll.
  await expect
    .poll(async () =>
      Math.abs(
        (await oval.locator('.gq-runner').evaluate((node) => node.getBoundingClientRect().top)) -
          startTop,
      ),
    )
    .toBeGreaterThan(10)
  await expect(oval.locator('.gq-runner')).toHaveAttribute('data-lead', 'yes')

  // A második kérdésre is jó válasz: a futam végére a táv nő.
  await stage.getByRole('button', { name: 'Next question' }).click()
  await expect(choices.filter({ hasText: 'The Sun' })).toBeVisible()
  await choices.filter({ hasText: 'The Sun' }).click()
  await stage.getByRole('button', { name: 'Finish' }).click()

  await expect(stage.getByText('Winner: Panni')).toBeVisible()
  const result = stage.locator('.gq-lane-meters').first()
  expect(Number((await result.innerText()).replace('%', ''))).toBeGreaterThan(
    Number(halfway.replace('%', '')),
  )

  // A telefonon nincs értelme pontot mutatni ebben a módban.
  await expect(student.locator('.gq-stu-points')).toHaveCount(0)
  await student.close()
})

test('a Szörnytámadásban a helyes válasz sebzi a szörnyet, a rossz a pajzsot rágja', async ({
  page,
}) => {
  await seedBank(page)
  await connectRelay(page.context())
  const student = await joinRoom(page, /^Boss battle/)

  const stage = page.getByRole('dialog', { name: 'Boss battle' })
  await expect(stage).toBeVisible()
  await expect(stage.locator('.gq-boss-name')).toHaveText('Dragon')
  await expect(stage.locator('.gq-boss-hp')).toHaveText('100 / 100')

  // Első kérdés: jó válasz → a szörny tíz életerőt veszít.
  const choices = student.locator('.gq-stu-choice')
  await choices.filter({ hasText: 'Carbon dioxide' }).click()
  await expect(stage.locator('.gq-boss-hp')).toHaveText('90 / 100')
  await expect(stage.locator('.gq-boss-bites')).toContainText('1 hits')

  // Második kérdés: rossz válasz → a pajzs egy pipát veszít.
  await stage.getByRole('button', { name: 'Next question' }).click()
  await expect(choices.filter({ hasText: 'Sirius' })).toBeVisible()
  await choices.filter({ hasText: 'Sirius' }).click()
  await expect(stage.locator('.gq-boss-bites')).toContainText('1 bites')
  await expect(stage.locator('.gq-boss-pip[data-on="yes"]')).toHaveCount(2)

  await stage.getByRole('button', { name: 'Finish' }).click()
  // Két kérdés: a szörny talpon maradt, de a pajzs is kitartott.
  await expect(stage.getByText('The monster is still standing')).toBeVisible()
  await student.close()
})
