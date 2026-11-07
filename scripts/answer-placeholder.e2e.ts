import { go } from './navigate'
import { expect, test } from '@playwright/test'

// A szerkesztő üres válasz-sora a tanár nyelvén szól: magyar felületen nem
// „Answer" áll a mintaszöveg helyén (a CSS angol tartaléka csak végső eset).
test('magyar felületen a válasz mintaszövege magyar', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tesztpapagaj:language', 'hu'))
  await go(page, '/')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await page.getByRole('button', { name: 'Új kérdésbank' }).first().click()
  await page.getByRole('button', { name: 'Kérdés hozzáadása' }).click()
  await page.getByRole('menuitem', { name: 'Feleletválasztós' }).click()

  const dialog = page.getByRole('dialog', { name: 'Kérdésszerkesztő' })
  await expect(dialog).toBeVisible()
  await dialog.locator('.dialog-editor[data-ready="true"]').waitFor()

  const placeholder = await dialog
    .locator('.mc-choice-body')
    .first()
    .evaluate((node) => getComputedStyle(node, '::before').content)
  expect(placeholder).toBe('"Válasz"')
})
