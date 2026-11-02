// Rewording and resizing an Exam's section headings, in a real browser.
//
// A heading is typed where it prints, the way the Exam title is; a part cleared
// prints nothing; the margin offers the default back; and Format → Heading size
// sets every heading on the Exam at once. What the teacher sees on the sheet is
// what the Export Preview — the output — prints.

import { expect, test, type Page } from '@playwright/test'
import { seedAuthoringState } from './seed-authoring'

const choice = (id: string, correct: boolean) => ({
  type: 'multipleChoiceChoice',
  attrs: { correct, id },
  content: [{ type: 'paragraph', content: [{ type: 'text', text: id }] }],
})

const QUESTION = {
  id: 'q1',
  type: 'multiple-choice',
  columns: 1,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Which particle is neutral?' }] },
      { type: 'multipleChoice', content: [choice('q1-a', false), choice('q1-b', true)] },
    ],
  },
}

async function openExam(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await seedAuthoringState(page, {
    questionBank: { questions: [QUESTION] },
    workingCopy: { title: 'Headings', questionIds: ['q1'] },
    dirty: false,
  })
  await expect(page.locator('.exam-question[data-question-id]')).toHaveCount(1)
}

// A szakasz címe és útmutatója a saját feliratát viseli (`page.sectionHeading`
// / `page.sectionDirections`), nem a szakasz típusát — a típus a szövegében van.
const heading = (page: Page) => page.getByRole('textbox', { name: 'Section heading' }).first()
const directions = (page: Page) => page.getByRole('textbox', { name: 'Section directions' }).first()

/** What the Export Preview prints for the test's first section. */
async function previewSection(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Export' }).getByLabel('Export Preview')
  await expect(preview).toBeVisible()
  return preview.locator('.exam-page').first().locator('.exam-section')
}

test('a heading and its directions are reworded where they print, and the output says the same', async ({ page }) => {
  await openExam(page)
  await expect(heading(page)).toHaveValue('Multiple choice')

  await heading(page).fill('Choose One')
  await directions(page).fill('Circle the best answer.')
  await directions(page).press('Enter')

  // Reworded Exam presentation is an unsaved change, like the title.
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()

  const section = await previewSection(page)
  await expect(section.locator('.section-title')).toHaveText('Choose One')
  await expect(section.locator('.section-instructions')).toHaveText('Circle the best answer.')
})

test('the wording survives a reload', async ({ page }) => {
  await openExam(page)
  await heading(page).fill('Choose One')
  await heading(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()

  await page.reload()
  await expect(heading(page)).toHaveValue('Choose One')
})

test('a cleared part prints nothing, and the margin offers the heading again', async ({ page }) => {
  await openExam(page)

  await directions(page).fill('')
  // Still open to type into while it has focus; gone once the teacher leaves it.
  await expect(directions(page)).toBeVisible()
  await directions(page).press('Enter')
  await expect(directions(page)).toHaveCount(0)

  const section = await previewSection(page)
  await expect(section.locator('.section-instructions')).toHaveCount(0)
  await expect(section.locator('.section-title')).toHaveText('Multiple choice')
  await page.keyboard.press('Escape')

  // A cím sértetlen marad, és továbbra is szerkeszthető a lapon.
  await expect(heading(page)).toHaveValue('Multiple choice')
})

test('a cleared directions part comes back from the margin', async ({ page }) => {
  await openExam(page)

  await directions(page).fill('')
  await directions(page).press('Enter')
  await expect(directions(page)).toHaveCount(0)
  await expect(heading(page)).toHaveValue('Multiple choice')

  // A szakasz fölé állva a margó felkínálja az alapértelmezett szöveget: a
  // tanár egy kattintással visszakapja, amit akaratlanul törölt.
  await page.locator('.exam-question').first().hover()
  await page.getByRole('button', { name: 'Restore the default heading' }).click()
  await expect(directions(page)).toHaveValue(
    'Identify the choice that best completes the statement or answers the question.',
  )

  // A visszaállítás után nincs mit visszaállítani, a gomb eltűnik.
  await page.locator('.exam-question').first().hover()
  await expect(page.getByRole('button', { name: 'Restore the default heading' })).toHaveCount(0)
})

test('a heading cleared of both prints nothing and can still be brought back', async ({ page }) => {
  await openExam(page)

  await heading(page).fill('')
  await heading(page).press('Enter')
  await directions(page).fill('')
  await directions(page).press('Enter')
  await expect(heading(page)).toHaveCount(0)
  await expect(directions(page)).toHaveCount(0)

  // A margó üres címet kínál: a szakasz felirata a tanáré, nem a gyári szöveg.
  await page.locator('.exam-question').first().hover()
  await page.getByRole('button', { name: 'Add a section heading' }).click()
  await expect(heading(page)).toHaveValue('')
  await heading(page).fill('Multiple choice')
  await heading(page).press('Enter')
  await expect(heading(page)).toHaveValue('Multiple choice')
})

test('an editable heading takes exactly the room the printed one does', async ({ page }) => {
  await openExam(page)
  // Long enough to wrap: the field has to wrap where the printed text does.
  await directions(page).fill(
    'Read every question carefully, then circle the one answer that best completes the statement or answers the question asked.',
  )
  await directions(page).press('Enter')
  // Layout heights, not on-screen boxes: the preview may be drawn scaled.
  const onSheet = await page.locator('.exam-section--editable').evaluate(
    (element) => (element as HTMLElement).offsetHeight,
  )
  const printed = await (await previewSection(page)).evaluate(
    (element) => (element as HTMLElement).offsetHeight,
  )
  expect(Math.abs(onSheet - printed)).toBeLessThanOrEqual(1)
})

test('Format → Heading size sets how large the Exam’s section headings print', async ({ page }) => {
  await openExam(page)
  const printedSize = async () => {
    const section = await previewSection(page)
    const size = await section.locator('.section-title').evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize))
    await page.keyboard.press('Escape')
    return size
  }
  const normal = await printedSize()

  await page.getByRole('button', { name: 'Format' }).click()
  await page.getByRole('menuitem', { name: 'Heading size' }).hover()
  await page.getByRole('menuitemradio', { name: 'Large' }).click()

  expect(await printedSize()).toBeGreaterThan(normal)

  await page.getByRole('button', { name: 'Format' }).click()
  await page.getByRole('menuitem', { name: 'Heading size' }).hover()
  await expect(page.getByRole('menuitemradio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Small' }).click()

  expect(await printedSize()).toBeLessThan(normal)
})

test('a heading’s underline is as wide as its words, not the page', async ({ page }) => {
  await openExam(page)
  const width = async () => (await heading(page).boundingBox())!.width
  const sheet = (await page.locator('.exam-workspace .page-content').first().boundingBox())!.width
  expect(await width()).toBeLessThan(sheet / 2)
  await heading(page).fill('MC')
  const short = await width()
  await heading(page).fill('Multiple Choice Questions')
  expect(await width()).toBeGreaterThan(short)
})
