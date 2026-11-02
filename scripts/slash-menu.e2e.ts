import { expect, test } from '@playwright/test'

test('on a short screen the slash menu’s Advanced group can still be reached and used', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 560 })
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add Question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  await expect(dialog).toBeVisible()
  await page.keyboard.type('Which of these is a table?')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  const menu = dialog.locator('.milkdown-slash-menu')
  await expect(menu).toBeVisible()

  // A csoport felirata a szótárból jön (`editor.groupAdvanced`), mai szövege: More.
  await menu.locator('.tab-group li', { hasText: 'More' }).click()

  // A menü a nézetben marad (nem lóg ki alul), a csoportjai pedig a saját
  // területükön belül görgethetők: így az „Egyéb" csoport elemei is elérhetők.
  const menuBox = (await menu.boundingBox())!
  const viewport = page.viewportSize()!
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height)
  // A lényeg, hogy a csoport elérhető és használható: a Táblázat bekerül.
  const table = menu.locator('.menu-group li', { hasText: 'Table' })
  await table.scrollIntoViewIfNeeded()
  await table.click()
  // A Crepe táblázat-blokkja jön létre (a méretválasztóval együtt).
  await expect(dialog.locator('.milkdown-table-block')).toHaveCount(1)
})
