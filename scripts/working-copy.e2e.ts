import { expect, test } from '@playwright/test'

test('Save, local recovery, and Discard keep an Exam Working Copy distinct from its saved Exam', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  const name = page.getByRole('textbox', { name: 'Dolgozat neve' })
  await name.fill('Saved composition')

  await page.keyboard.press('Control+S')
  const workingCopyStatus = page.getByLabel('Munkapéldány állapota')
  await expect(workingCopyStatus).toHaveText('Elmentve'))
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()

  await name.fill('Recovered Working Copy')
  await expect(workingCopyStatus).toHaveText('Mentetlen módosítások · helyben mentve'))

  await page.reload()
  await expect(name).toHaveValue('Recovered Working Copy')
  await expect(workingCopyStatus).toHaveText('Mentetlen módosítások · helyben mentve'))

  await page.getByRole('button', { name: 'Fájl' }).click()
  await page.getByRole('menuitem', { name: 'Módosítások elvetése' }).click()
  await expect(name).toHaveValue('Saved composition')
  await expect(workingCopyStatus).toHaveText('Elmentve'))
})

test('Save As moves a changed Working Copy into a named independent Exam', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  const name = page.getByRole('textbox', { name: 'Dolgozat neve' })
  await name.fill('Original exam')
  await page.keyboard.press('Control+S')
  await name.fill('Changed exam')

  await page.getByRole('button', { name: 'Fájl' }).click()
  await page.getByRole('menuitem', { name: 'Mentés másként' }).click()

  await expect(name).toHaveValue('Changed exam Copy')
  await expect(page.getByLabel('Munkapéldány állapota')).toHaveText('Elmentve'))

  // The current editing session moved with the new Exam: its earlier rename
  // remains undoable and is now unsaved relative to the copied initial state.
  await page.keyboard.press('Control+Z')
  await expect(name).toHaveValue('Original exam')
  await expect(page.getByLabel('Munkapéldány állapota')).toHaveText('Mentetlen módosítások · helyben mentve'))
  await page.keyboard.press('Control+Shift+S')
  await expect(name).toHaveValue('Original exam Copy')

  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await expect(page.getByRole('button', { name: 'Changed exam Copy' })).toBeVisible()
  await page.locator('.exam-card').filter({
    has: page.getByRole('heading', { name: 'Original exam', exact: true }),
  }).click()
  await expect(name).toHaveValue('Original exam')
})
