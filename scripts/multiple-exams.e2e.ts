import { expect, test } from '@playwright/test'

async function newExam(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toBeVisible()
}

test('Home opens independently persisted recent Exams and restores the active Exam', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Folytasd ott, ahol abbahagytad' })).toContainText('Készítsd el az első dolgozatodat'))
  await page.getByRole('button', { name: 'Új kérdésbank' }).first().click()
  await page.getByRole('button', { name: 'Add Question' }).click()
  await page.getByRole('menuitem', { name: 'Feleletválasztós' }).click()
  await page.keyboard.type('First question preview')
  await page.keyboard.press('Control+Enter')
  await page.getByRole('button', { name: /^Add First question preview to the exam$/ }).click()
  const name = page.getByRole('textbox', { name: 'Dolgozat neve' })
  await name.fill('First Exam')
  await expect(page.locator('.exam-question')).toHaveCount(1)
  await page.reload()
  await expect(name).toHaveValue('First Exam')
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  const first = page.getByRole('button', { name: 'First Exam' })
  await expect(first).toContainText('1 Q')
  await expect(first).toContainText('First question preview')
  await newExam(page)
  await name.fill('Second Exam')
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await page.getByRole('button', { name: 'First Exam' }).click()
  await expect(name).toHaveValue('First Exam')
  await expect(page).toHaveURL(/\/editor$/)
})

test('Recent Exams are ordered by opening, not background authoring writes', async ({ page }) => {
  await page.goto('/')
  await newExam(page)
  const name = page.getByRole('textbox', { name: 'Dolgozat neve' })
  await name.fill('First Exam')
  await page.reload()
  const firstId = await page.evaluate(async () => {
    const { createExamWorkspaceService } = await import(
      /* @vite-ignore */ '/src/exam-workspaces.ts'
    ) as typeof import('../src/exam-workspaces')
    return createExamWorkspaceService().activeId()
  })
  expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await newExam(page)
  await name.fill('Second Exam')
  await page.reload()
  const secondId = await page.evaluate(async () => {
    const { createExamWorkspaceService } = await import(
      /* @vite-ignore */ '/src/exam-workspaces.ts'
    ) as typeof import('../src/exam-workspaces')
    return createExamWorkspaceService().activeId()
  })
  expect(secondId).not.toBe(firstId)
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  const cards = page.getByRole('region', { name: 'Folytasd ott, ahol abbahagytad' }).locator('.exam-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('Second Exam')
  await expect(cards.nth(1)).toContainText('First Exam')

  // Opening First moves it to the top. Renaming it later is background
  // authoring state, so it must not rewrite the recency order.
  await page.getByRole('button', { name: 'First Exam' }).click()
  await name.fill('First renamed')
  await page.reload()
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await expect(cards.nth(0)).toContainText('First renamed')
  await expect(cards.nth(1)).toContainText('Second Exam')
})

test('a stale launch restores and warns about the active valid Exam without creating another', async ({ page }) => {
  await page.goto('/')
  await newExam(page)
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).fill('Active Exam')
  await page.goto('/editor?exam=unavailable')
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByRole('alert')).toHaveText('Ez a dolgozat nem érhető el ezen az eszközön.'))
  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toHaveValue('Active Exam')
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await expect(page.getByRole('button', { name: 'Active Exam' })).toHaveCount(1)
})

test('a bare editor reload retains an active pristine workspace, while Home startup cleans it up', async ({ page }) => {
  await page.goto('/')
  await newExam(page)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toHaveValue('Névtelen dolgozat'))
  // Simulates closing the editor and later starting at Home, rather than using
  // the Home action which intentionally cleans placeholders immediately.
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Folytasd ott, ahol abbahagytad' })).toContainText('Készítsd el az első dolgozatodat'))
})

test('client-side About navigation returns to refreshed Home cards without replaying editor state', async ({ page }) => {
  await page.goto('/')
  await newExam(page)
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).fill('Renamed through editor')
  await page.getByRole('link', { name: 'a projektről' }).click()
  await expect(page.getByRole('heading', { name: 'A projektről' })).toBeVisible()
  await page.getByRole('link', { name: 'Kezdőlap' }).click()
  const card = page.getByRole('button', { name: 'Renamed through editor' })
  await expect(card).toContainText('0 Qs')
  await expect(card).toContainText('Empty Exam')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'A projektről' })).toBeVisible()
})
