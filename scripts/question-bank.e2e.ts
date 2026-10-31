// The split authoring workspace, in a real browser.
//
// The store's own tests cover what each authoring action does to the Question
// Bank and the Working Copy. These cover the things only a browser can show: that
// the two panes open side by side with the bank the narrower one, that the popup writes into
// the bank without putting the question on the exam, that cancelling writes
// nothing at all, and that a refresh brings all of it back.

import { expect, test, type Page } from '@playwright/test'

const bank = (page: Page) => page.getByRole('region', { name: 'Question Bank' })
const bankRows = (page: Page) => bank(page).getByRole('listitem')
const addToExam = (page: Page) =>
  // A sor saját gombja; az "Add all questions to the exam" fejlécgomb nem az.
  page.getByRole('button', { name: /^Add (?!all ).* to the exam$/ })
const inExamMarkers = (page: Page) => bank(page).getByText('In exam')
// The rendered Working Copy is addressed the way the existing browser tests
// address it, so this suite and the interaction regressions stay one harness.
const examQuestions = (page: Page) => page.locator('.exam-question')

/** A fresh exam, with a Question Bank open beside it. An exam opens on its
 *  Question Bank picker, so the pane only appears once a bank exists: the
 *  picker's own New Question Bank makes one and opens it. */
async function newExamWithBank(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  await page.getByRole('button', { name: 'New Question Bank' }).first().click()
  await expect(bank(page)).toBeVisible()
}

/** Writes one question through the popup, from whichever button opened it. */
/** The bank's New question, and the Question Section it asks for. A question's
 *  type is settled when it is created, so this is where it is said. */
async function newBankQuestion(page: Page, type = 'Multiple choice') {
  await page.getByRole('button', { name: 'Add Question' }).click()
  await page.getByRole('menuitem', { name: type }).click()
}

async function writeQuestion(page: Page, stem: string) {
  const editor = page.getByRole('dialog', { name: 'Question editor' })
  await expect(editor).toBeVisible()
  // A második kérdésnél a fókusz a bank során maradhat: a szerkesztőbe kell
  // kattintani, majd a dokumentum elejére állni — a kattintás a válaszlistára
  // is eshet, a kérdésszöveg pedig a dokumentum eleje.
  await editor.locator('.ProseMirror').first().click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type(stem)
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeHidden()
}

test('the Question Bank opens beside the Working Copy as the narrower pane', async ({ page }) => {
  await newExamWithBank(page)

  await expect(bank(page)).toBeVisible()

  // Geometry is the claim, so this is measured rather than asserted by role.
  const workspace = await page.locator('.authoring-workspace').boundingBox()
  const bankBox = await bank(page).boundingBox()
  expect(bankBox!.width).toBeGreaterThan(workspace!.width * 0.28)
  expect(bankBox!.width).toBeLessThan(workspace!.width * 0.38)
})

test('a question written in the bank stays off the exam until it is added', async ({ page }) => {
  await newExamWithBank(page)

  await newBankQuestion(page)
  await writeQuestion(page, 'Which is a mammal?')

  await expect(bankRows(page)).toHaveCount(1)
  await expect(examQuestions(page)).toHaveCount(0)
  await expect(inExamMarkers(page)).toHaveCount(0)

  await addToExam(page).click()

  await expect(examQuestions(page)).toHaveCount(1)
  await expect(examQuestions(page).first()).toContainText('Which is a mammal?')
  // Referenced, not copied: one bank record, marked as being on the exam, and
  // no second way to add it.
  await expect(bankRows(page)).toHaveCount(1)
  await expect(inExamMarkers(page)).toHaveCount(1)
  await expect(addToExam(page)).toHaveCount(0)
})

test('the slot that says a question is on the exam is also how it comes off', async ({ page }) => {
  await newExamWithBank(page)

  await newBankQuestion(page)
  await writeQuestion(page, 'Which is a mammal?')
  await addToExam(page).click()
  await expect(examQuestions(page)).toHaveCount(1)

  // The tick a row wears while it is on the exam is the control that takes it
  // off again — the bank record itself is untouched, so the row stays and
  // offers the plus back.
  await page.getByRole('button', { name: /^Remove .* from the exam$/ }).click()

  await expect(examQuestions(page)).toHaveCount(0)
  await expect(bankRows(page)).toHaveCount(1)
  await expect(inExamMarkers(page)).toHaveCount(0)
  await expect(addToExam(page)).toHaveCount(1)
})

test('cancelling the popup leaves the Question Bank and the Working Copy alone', async ({ page }) => {
  await newExamWithBank(page)

  await newBankQuestion(page)
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeVisible()
  await page.keyboard.type('Abandoned question')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeHidden()
  await expect(bankRows(page)).toHaveCount(0)
  await expect(examQuestions(page)).toHaveCount(0)
})

test('a refresh restores the Question Bank, the Working Copy and its order', async ({ page }) => {
  await newExamWithBank(page)

  await newBankQuestion(page)
  await writeQuestion(page, 'On the exam')
  await addToExam(page).click()
  await newBankQuestion(page)
  await writeQuestion(page, 'Kept in the bank')

  await expect(bankRows(page)).toHaveCount(2)
  await expect(examQuestions(page)).toHaveCount(1)

  await page.reload()

  await expect(bankRows(page)).toHaveCount(2)
  await expect(examQuestions(page)).toHaveCount(1)
  await expect(examQuestions(page).first()).toContainText('On the exam')
  // Newest first, so the question just written is the one at the top.
  await expect(bankRows(page).first()).toContainText('Kept in the bank')
  await expect(inExamMarkers(page)).toHaveCount(1)
})

test('editing canonical Question Content updates the rendered Working Copy', async ({ page }) => {
  await newExamWithBank(page)

  await newBankQuestion(page)
  await writeQuestion(page, 'Original wording')
  await addToExam(page).click()
  await expect(examQuestions(page).first()).toContainText('Original wording')

  await page.getByRole('button', { name: /^Edit / }).click()
  await writeQuestion(page, 'Edited ')

  await expect(examQuestions(page).first()).toContainText('Edited Original wording')
  await expect(bankRows(page)).toHaveCount(1)
})
