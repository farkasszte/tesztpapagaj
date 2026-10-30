import { expect, test } from '@playwright/test'

test('Home creates a blank Exam that composes only from an open Question Bank', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Folytasd ott, ahol abbahagytad', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Folytasd ott, ahol abbahagytad' })).toContainText('Create your first Exam')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await expect(page).toHaveURL(/\/editor$/)

  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toHaveValue('Untitled Exam')
  await expect(page.getByRole('main')).toContainText('Drag or add a Question from an open Question Bank')
  await expect(page.getByRole('button', { name: 'Insert your first question' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kérdésbank megnyitása' })).toBeVisible()
})
