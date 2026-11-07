import { go } from './navigate'
import { expect, test, type Page } from '@playwright/test'

async function seedResources(page: Page) {
  await go(page, '/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  return page.evaluate(async () => {
    const { createExamWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/exam/exam-workspaces.ts'
    )) as typeof import('../src/exam/exam-workspaces')
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const exams = createExamWorkspaceService()
    const banks = createQuestionBankWorkspaceService()

    // 2 banks:
    const b1 = await banks.create()
    await banks.commit(b1.id, { kind: 'rename', name: 'Biology Bank' })
    await banks.commit(b1.id, {
      kind: 'create-question',
      question: {
        id: 'q1',
        type: 'open',
        columns: 1,
        topics: ['Genetics'],
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DNA' }] }] },
      },
    })

    const b2 = await banks.create()
    await banks.commit(b2.id, { kind: 'rename', name: 'Chemistry Bank' })

    // 2 exams:
    const e1 = await exams.create()
    const be1 = exams.backendFor(e1.id)
    const w1 = (await be1.read())!
    w1.workingCopy.title = 'Algebra Midterm'
    await be1.write(w1)

    const e2 = await exams.create()
    const be2 = exams.backendFor(e2.id)
    const w2 = (await be2.read())!
    w2.workingCopy.title = 'Geometry Final'
    await be2.write(w2)
  })
}

test('Kezdőlap táblázat nézet: szűrés, valós idejű keresés és nézetváltó', async ({ page }) => {
  await seedResources(page)

  // Explicitly set table view
  await page.addInitScript(() => {
    localStorage.setItem('test-parrot:home-view', 'table')
  })
  await go(page, '/')

  // 1. Table structure
  const table = page.locator('.home-table')
  await expect(table).toBeVisible()
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 2. Tabs filtering
  // Exams tab
  await page.getByRole('tab', { name: /Exams/i }).click()
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table).toContainText('Algebra Midterm')
  await expect(table).toContainText('Geometry Final')
  await expect(table).not.toContainText('Biology Bank')

  // Banks tab
  await page.getByRole('tab', { name: /Question Banks/i }).click()
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table).toContainText('Biology Bank')
  await expect(table).toContainText('Chemistry Bank')
  await expect(table).not.toContainText('Algebra Midterm')

  // All tab
  await page.getByRole('tab', { name: /All/i }).click()
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 3. Search
  const searchInput = page.getByRole('searchbox', { name: /Search/i })
  await searchInput.fill('algebra')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('Algebra Midterm')

  // Search by topic
  await searchInput.fill('genetics')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('Biology Bank')

  // Clear search
  await page.getByRole('button', { name: /Clear search/i }).click()
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 4. View toggle: Switch to Cards view
  await page.getByRole('button', { name: 'Cards' }).click()
  await expect(page.locator('.home-table')).toHaveCount(0)
  await expect(page.locator('.exam-card').first()).toBeVisible()

  // Switch back to Table view
  await page.getByRole('button', { name: 'Table' }).click()
  await expect(page.locator('.home-table')).toBeVisible()
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 5. Open an item
  await page.getByRole('button', { name: /^Open Algebra Midterm\./ }).click()
  await expect(page).toHaveURL(/\/editor$/)
})

