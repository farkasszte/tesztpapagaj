import { go } from './navigate'
import { expect, test } from '@playwright/test'

test('Ctrl/Cmd+Z undo and Ctrl/Cmd+Shift+Z redo workspace edits', async ({ page }) => {
  await go(page, '/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  const title = page.getByRole('textbox', { name: 'Exam name' })
  const original = await title.inputValue()

  await title.fill('Control shortcut edit')
  await page.keyboard.press('Control+z')
  await expect(title).toHaveValue(original)
  await page.keyboard.press('Control+Shift+z')
  await expect(title).toHaveValue('Control shortcut edit')

  await title.fill('Command shortcut edit')
  await page.keyboard.press('Meta+z')
  await expect(title).toHaveValue('Control shortcut edit')
})

test('Ctrl/Cmd+Enter saves the question dialog', async ({ page }) => {
  await go(page, '/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()

  // Új dolgozatban még nincs nyitott kérdésbank: azt előbb létre kell hozni.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeVisible()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeHidden()
  // A bank-panelben született kérdés még nincs a dolgozaton: fel kell tenni.
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  await expect(page.locator('.exam-question')).toHaveCount(1)

  // A második kérdés is a bank paneljében születik (a kérdés menüje már nem
  // kínál „Add question below"-t), és onnan kerül a lapra.
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()
  // A gyorsítótár a párbeszéd fogási fázisában figyel: előbb a szerkesztőbe kell
  // kattintani, különben a billentyű a menü után nem oda érkezik.
  await page.getByRole('dialog', { name: 'Question editor' }).locator('.ProseMirror').first().click()
  await page.keyboard.press('Meta+Enter')
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeHidden()
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  await expect(page.locator('.exam-question')).toHaveCount(2)
})
