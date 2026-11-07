import { expect, test } from '@playwright/test'
import { go } from './navigate'

/**
 * A behozatal kártyájának menüje sok banknál: a sorok a **panelen belül**
 * maradnak (görgethető menü), és a felirat szótárazott — nem beégetett angol.
 */

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('sok bank egy fájlból: a menü a panelen belül görget, a felirat magyar', async ({ page }) => {
  await go(page, '/about')
  await page.evaluate(async () => {
    const { recordImport } = (await import(
      /* @vite-ignore */ '/src/import/import-history.ts'
    )) as typeof import('../src/import/import-history')
    await recordImport(
      { fileName: 'sok-bank.par', kind: 'record' },
      {
        exams: [],
        banks: Array.from({ length: 40 }, (_, index) => ({
          id: `sok-bank-${index}`,
          name: `Kérdésbank ${index + 1}`,
        })),
        questions: 40,
        picturesNeeded: 0,
      },
    )
  })

  await go(page, '/imports')
  const card = page.locator('.import-card').first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  await card.locator('button').first().click()

  const menu = page.locator('.context-menu')
  await expect(menu).toBeVisible()

  const items = menu.locator('.context-menu-item')
  await expect(items).toHaveCount(40)

  // A felirat szótárazott: „Kérdésbank 1 megnyitása", nem beégetett „Open …".
  await expect(items.first()).toHaveText(/megnyitása/)

  // A hosszú menü a panelen belül görgethető, nem lóg ki alóla a lapra.
  const box = await menu.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      overflowY: style.overflowY,
      scrolls: node.scrollHeight > node.clientHeight,
      bottom: rect.bottom,
      viewport: window.innerHeight,
    }
  })
  expect(['auto', 'scroll']).toContain(box.overflowY)
  expect(box.scrolls).toBe(true)
  expect(box.bottom).toBeLessThanOrEqual(box.viewport)
  if (process.env.PROBE_SHOT) await page.screenshot({ path: 'imports-menu.png', fullPage: false })
})
