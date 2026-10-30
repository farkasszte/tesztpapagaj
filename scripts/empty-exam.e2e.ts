import { expect, test } from '@playwright/test'

test('Home creates a blank Exam that composes only from an open Question Bank', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Folytasd ott, ahol abbahagytad', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Folytasd ott, ahol abbahagytad' })).toContainText('Készítsd el az első dolgozatodat')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await expect(page).toHaveURL(/\/editor$/)

  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toHaveValue('Névtelen dolgozat')
  await expect(page.getByRole('main')).toContainText('Húzz ide kérdést egy megnyitott kérdésbankból')
  await expect(page.getByRole('button', { name: 'Insert your first question' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kérdésbank megnyitása' })).toBeVisible()
})
