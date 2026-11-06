// The shape of the authoring workspace, in a real browser.
//
// Geometry is the claim here, so it is measured rather than asserted by role:
// that the bank opens as the narrower pane, that the divider moves — and,
// throughout, that the sheet is still a sheet. The paper keeps the exact size
// `export-plan.ts` packed against; a pane too narrow for it scrolls, because a
// page scaled to fit would be showing a layout the printer will not produce.

import { expect, test, type Page } from '@playwright/test'
import { seedAuthoringState } from './seed-authoring'
import { PAGE_WIDTH } from '../src/export/export-plan'
import type { Question } from '../src/exam/exam'

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    type: 'open',
    columns: 2,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Explain osmosis' }] }],
    },
  },
]

const workspace = (page: Page) => page.locator('.authoring-workspace')
const bank = (page: Page) => page.getByRole('region', { name: 'Question Bank' })
const sheet = (page: Page) => page.locator('.exam-page').first()
const divider = (page: Page) => page.getByRole('separator', { name: 'Resize the Question Bank' })

async function openWorkspace(page: Page) {
  await seedAuthoringState(page, {
    questionBank: { questions: QUESTIONS },
    workingCopy: { title: 'Layout', questionIds: ['q1'] },
    dirty: false,
  })
  await expect(page.locator('.exam-question[data-question-id]')).toHaveCount(1)
}

/** How wide the Question Bank pane is, as a share of the whole workspace. */
async function bankShare(page: Page): Promise<number> {
  const whole = (await workspace(page).boundingBox())!
  const pane = (await bank(page).boundingBox())!
  return pane.width / whole.width
}

test('the workspace opens with the bank as the narrower pane, and the divider moves it', async ({ page }) => {
  await openWorkspace(page)

  // The bank is picked from rather than read, so the sheet gets the room.
  expect(await bankShare(page)).toBeGreaterThan(0.28)
  expect(await bankShare(page)).toBeLessThan(0.38)

  const whole = (await workspace(page).boundingBox())!
  const handle = (await divider(page).boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
  await page.mouse.down()
  // A választó a bal széltől 45%-ra kerül, a bank pedig a jobb oldalon így a
  // munkaterület ~55%-át kapja.
  await page.mouse.move(whole.x + whole.width * 0.45, handle.y + 200, { steps: 8 })
  await page.mouse.up()

  const widened = await bankShare(page)
  expect(widened).toBeGreaterThan(0.5)
  expect(widened).toBeLessThan(0.6)
  // The paper is not the thing that gave way: it is exactly the sheet the
  // export was packed against, whatever the split does.
  expect(Math.round((await sheet(page).boundingBox())!.width)).toBe(PAGE_WIDTH)
})

test('scrolling the Working Copy keeps the Question Bank docked below the document bar', async ({ page }) => {
  await openWorkspace(page)

  // A dolgozat sávja görget, nem az ablak: a munkaterület kitölti a nézetet.
  const bankBefore = (await bank(page).boundingBox())!
  const draft = (await page.locator('.exam-workspace').boundingBox())!
  await page.mouse.move(draft.x + draft.width / 2, draft.y + 200)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.locator('.editor-output').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0)

  const bankAfter = (await bank(page).boundingBox())!
  expect(bankAfter.y).toBe(bankBefore.y)
  expect(bankAfter.height).toBe(bankBefore.height)
})

test('the footer stays in the Working Copy lane without dislodging the Question Bank', async ({ page }) => {
  await openWorkspace(page)

  const bankBefore = (await bank(page).boundingBox())!
  const footer = page.locator('.site-footer')
  const footerBounds = (await footer.boundingBox())!
  // A lábléc a dolgozat sávjában áll, tehát a banktól balra.
  expect(footerBounds.x).toBeLessThan(bankBefore.x)
  expect(footerBounds.x + footerBounds.width).toBeLessThanOrEqual(bankBefore.x + 1)
  // A lábléc a saját oldalaira visz (a korábbi teacher.dev hivatkozás helyett).
  await expect(footer.getByRole('link', { name: 'about' })).toHaveAttribute('href', '/about')

  // A lábléc a dolgozat sávjának végén áll, a bank pedig közben sem mozdul.
  await page.locator('.editor-output').evaluate((node) => { node.scrollTop = node.scrollHeight })
  await expect.poll(() => page.locator('.editor-output').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0)
  expect((await bank(page).boundingBox())!.y).toBe(bankBefore.y)
})

test('the divider is resizable from the keyboard', async ({ page }) => {
  await openWorkspace(page)

  await divider(page).focus()
  const before = await bankShare(page)
  // A balra nyíl balra viszi a választót, tehát a jobb oldali bank nő.
  for (let press = 0; press < 3; press += 1) await page.keyboard.press('ArrowLeft')

  expect(await bankShare(page)).toBeGreaterThan(before + 0.1)
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '45')
})

test('a pane too narrow for the sheet scrolls rather than shrinking it', async ({ page }) => {
  await openWorkspace(page)

  // Give the bank most of the workspace, so the Working Copy pane is narrower
  // than a piece of US Letter paper.
  await divider(page).focus()
  for (let press = 0; press < 8; press += 1) await page.keyboard.press('ArrowLeft')

  expect(Math.round((await sheet(page).boundingBox())!.width)).toBe(PAGE_WIDTH)
  const scrolls = await page.locator('.exam-workspace').evaluate(
    (node) => node.scrollWidth > node.clientWidth,
  )
  expect(scrolls).toBe(true)
  // Nothing has been scaled to make it fit.
  const transform = await sheet(page).evaluate((node) => getComputedStyle(node).transform)
  expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true)
})

test('pane width is restorable workspace state, not authoring data', async ({ page }) => {
  await openWorkspace(page)
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeDisabled()

  // Koppintás + fókusz: a `focus()` önmagában néha nem viszi át a fókuszt
  // (a lap épp újrarajzol), és akkor a nyíl a semmibe megy — a mért szélesség
  // pedig a korábbi futásból megmaradt érték, tehát a teszt hamisan bukik.
  await divider(page).click()
  await expect(divider(page)).toBeFocused()
  const initial = Number(await divider(page).getAttribute('aria-valuenow'))
  // A választó 20 és 80% között áll, a lépés 4: a határon a másik irányba
  // lépünk, hogy a mozdulat garantált legyen.
  await page.keyboard.press(initial >= 78 ? 'ArrowRight' : 'ArrowLeft')
  await expect.poll(async () => Number(await divider(page).getAttribute('aria-valuenow')))
    .not.toBe(initial)
  const resized = await divider(page).getAttribute('aria-valuenow')

  // Moving the divider is not a change to the exam, so it is not undoable and
  // it dirties nothing.
  await expect(undo).toBeDisabled()

  await page.reload()
  await expect(page.locator('.exam-question[data-question-id]')).toHaveCount(1)
  await expect(bank(page)).toBeVisible()
  await expect(divider(page)).toHaveAttribute('aria-valuenow', resized!)
})

test('focus, selection, the modal and the workspace shortcuts survive the split', async ({ page }) => {
  await openWorkspace(page)

  const question = page.locator('.exam-question[data-question-id]').first()
  await question.click()
  await expect(question).toHaveClass(/exam-question--selected/)
  await page.keyboard.press('Escape')
  await expect(question).not.toHaveClass(/exam-question--selected/)

  await question.dblclick()
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeVisible()
  // A szerkesztő csak készen vesz gépelést (a dokumentumot később veszi át).
  await page.locator('.dialog-editor[data-ready="true"]').waitFor()
  await page.keyboard.type(' now')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('dialog', { name: 'Question editor' })).toBeHidden()
  await expect(question).toContainText('now')

  // A bankban tárolt kérdés tartalmának szerkesztése nem a dolgozat művelete
  // (lásd `canonical-question-propagation`), ezért nincs mit visszavonni.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})
