import { expect, test } from '@playwright/test'

/**
 * Játékeredmények oldal: a lejátszott vetítés utólag böngészhető.
 *
 * A játék mentését a színpad végzi; ez a próba a **megjelenítést** méri a valódi
 * tárolón át: kérdésenkénti mátrix, sikeresség, csoportátlag, törlés.
 */

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => window.localStorage.setItem(entry.name, entry.value), HUNGARIAN)
})

async function seed(page: import('@playwright/test').Page) {
  await page.goto('/about')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.evaluate(async () => {
        const { saveResult } = (await import(
          /* @vite-ignore */ '/src/game/results-store.ts'
        )) as typeof import('../src/game/results-store')
        await saveResult({
          id: 'classic-1-123456',
          mode: 'classic',
          title: 'Biológia alapok',
          startedAt: Date.parse('2026-03-04T09:00:00Z'),
          endedAt: Date.parse('2026-03-04T09:20:00Z'),
          players: [
            { nickname: 'Anna', points: 30, correct: 2, answered: 3, cells: ['right', 'right', 'wrong'] },
            { nickname: 'Bence', points: 10, correct: 1, answered: 2, cells: ['wrong', 'right', 'skipped'] },
          ],
          questions: [
            { id: 'q1', prompt: 'Első kérdés', correct: 1, answered: 2 },
            { id: 'q2', prompt: 'Második kérdés', correct: 2, answered: 2 },
            { id: 'q3', prompt: 'Harmadik kérdés', correct: 0, answered: 1 },
          ],
        })
      })
      return
    } catch {
      await page.waitForTimeout(700)
      await page.goto('/about')
    }
  }
  throw new Error('nem sikerült az eredmény vetése')
}

/** A vetés utáni első betöltést a service worker újratöltése elviheti, ezért
 *  addig nyitjuk az oldalt, amíg a fejléc meg nem jelenik. */
async function openResults(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // A vetés utáni újratöltés közben a navigáció elakadhat (ERR_ABORTED):
    // ilyenkor várunk és újrapróbáljuk.
    await page.goto('/eredmenyek').catch(() => undefined)
    const heading = page.getByRole('heading', { name: 'Játékeredmények' })
    if (await heading.isVisible().catch(() => false)) return
    await page.waitForTimeout(400)
  }
}

test('a lejátszott játék eredménye böngészhető', async ({ page }) => {
  // A teljes készlet együtt fut, és a vetés utáni újratöltés lassabb lehet.
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await seed(page)
  await openResults(page)

  // A lista a játékot mutatja, csoportátlaggal (Anna 2 + Bence 1 = 3 helyes / 6 cella = 50%).
  await expect(page.getByRole('heading', { name: 'Játékeredmények' })).toBeVisible()
  const chip = page.locator('.result-chip').first()
  await expect(chip).toContainText('Biológia alapok')
  await expect(chip).toContainText('50%')

  // A mátrix: 3 kérdés-oszlop, 2 diák, a cellák jelentése helyes/hibás/kihagyott.
  await expect(page.locator('.results-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.results-table tbody tr').first()).toContainText('Anna')
  const anna = page.locator('.results-table tbody tr', { hasText: 'Anna' }).first()
  await expect(anna.locator('td[data-cell="right"]')).toHaveCount(2)
  await expect(anna.locator('td[data-cell="wrong"]')).toHaveCount(1)

  // Kérdésenkénti sikeresség a fejlécben: q1 = 1/2, q2 = 2/2, q3 = 0/1.
  const rates = await page.locator('.results-question-rate').allInnerTexts()
  expect(rates).toEqual(['50%', '100%', '0%'])

  // Törlés: az első kattintás megerősítést kér, a második töröl.
  const actions = page.locator('.results-actions')
  await actions.getByRole('button', { name: 'Eredmény törlése' }).click()
  await actions.getByRole('button', { name: 'Eredmény törlése' }).click()
  await expect(page.getByText('Még nem játszottál le játékot.')).toBeVisible()
})
