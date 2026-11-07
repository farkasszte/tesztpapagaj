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

test('Kezdőlap táblázat: tömeges kijelölés és csoportos törlés', async ({ page }) => {
  await seedResources(page)

  await page.addInitScript(() => {
    localStorage.setItem('test-parrot:home-view', 'table')
  })
  await go(page, '/')

  const table = page.locator('.home-table')
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 1. Initially bulk action bar is not visible
  const bulkBar = page.locator('.home-bulk-bar')
  await expect(bulkBar).toHaveCount(0)

  // 2. Select first row checkbox
  const rowCheckboxes = table.locator('.home-td-select input[type="checkbox"]')
  await rowCheckboxes.nth(0).click()
  await expect(bulkBar).toBeVisible()
  await expect(bulkBar).toContainText('1 selected')

  // 3. Select second row checkbox
  await rowCheckboxes.nth(1).click()
  await expect(bulkBar).toContainText('2 selected')

  // 4. Master checkbox: select all
  const selectAll = table.locator('.home-th-select input[type="checkbox"]')
  await selectAll.click()
  await expect(bulkBar).toContainText('4 selected')

  // 5. Clear selection via bulk bar clear button
  await bulkBar.getByRole('button', { name: /Clear selection/i }).click()
  await expect(bulkBar).toHaveCount(0)

  // 6. Select 2 items and bulk delete them
  await rowCheckboxes.nth(0).click()
  await rowCheckboxes.nth(1).click()
  await expect(bulkBar).toContainText('2 selected')

  await bulkBar.getByRole('button', { name: /Delete/i }).click()
  const confirmDialog = page.getByRole('dialog', { name: /Delete selected items/i })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole('button', { name: /Delete/i }).click()

  // Verify 2 items were deleted and table has 2 remaining
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(bulkBar).toHaveCount(0)
})

test('Kezdőlap táblázat: több kijelölésnél az egyedi műveletek inaktívvá válnak és a sorra kattintás kijelöl', async ({ page }) => {
  await seedResources(page)

  await page.addInitScript(() => {
    localStorage.setItem('test-parrot:home-view', 'table')
  })
  await go(page, '/')

  const table = page.locator('.home-table')
  await expect(table.locator('tbody tr')).toHaveCount(4)

  const rows = table.locator('tbody tr')
  const rowCheckboxes = table.locator('.home-td-select input[type="checkbox"]')
  const openButtons = table.locator('.home-btn-open')
  const menuButtons = table.locator('.home-btn-menu')

  // 1. Initially without selection, single-item actions are enabled
  await expect(openButtons.nth(0)).toBeEnabled()
  await expect(menuButtons.nth(0)).toBeEnabled()
  await expect(openButtons.nth(1)).toBeEnabled()
  await expect(menuButtons.nth(1)).toBeEnabled()

  // 2. Select first row
  await rowCheckboxes.nth(0).click()
  await expect(rowCheckboxes.nth(0)).toBeChecked()

  // Selected row's action is enabled, unselected rows are disabled
  await expect(openButtons.nth(0)).toBeEnabled()
  await expect(menuButtons.nth(0)).toBeEnabled()
  await expect(openButtons.nth(1)).toBeDisabled()
  await expect(menuButtons.nth(1)).toBeDisabled()

  // 3. Clicking on row 1 body toggles selection instead of opening the item
  await rows.nth(1).click()
  await expect(page).toHaveURL('/')
  await expect(rowCheckboxes.nth(1)).toBeChecked()

  // 4. Multiple selection (> 1 items): ALL single-item actions are disabled
  await expect(openButtons.nth(0)).toBeDisabled()
  await expect(menuButtons.nth(0)).toBeDisabled()
  await expect(openButtons.nth(1)).toBeDisabled()
  await expect(menuButtons.nth(1)).toBeDisabled()
  await expect(openButtons.nth(2)).toBeDisabled()
  await expect(menuButtons.nth(2)).toBeDisabled()

  // 5. Clicking on row 0 toggles it off
  await rows.nth(0).click()
  await expect(rowCheckboxes.nth(0)).not.toBeChecked()
  await expect(rowCheckboxes.nth(1)).toBeChecked()

  // 6. Clear selection
  await page.locator('.home-bulk-bar').getByRole('button', { name: /Clear selection/i }).click()
  await expect(openButtons.nth(0)).toBeEnabled()
  await expect(menuButtons.nth(0)).toBeEnabled()
  await expect(openButtons.nth(1)).toBeEnabled()
  await expect(menuButtons.nth(1)).toBeEnabled()
})

test('Kezdőlap táblázat: virtuális könyvtárak kezelése (tömeges áthelyezés, sormenü és szűrés)', async ({ page }) => {
  await seedResources(page)

  await page.addInitScript(() => {
    localStorage.setItem('test-parrot:home-view', 'table')
  })
  await go(page, '/')

  const table = page.locator('.home-table')
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 1. Tömeges áthelyezés új mappába (Level A)
  const rowCheckboxes = table.locator('.home-td-select input[type="checkbox"]')
  await rowCheckboxes.nth(0).click()
  await rowCheckboxes.nth(1).click()

  const bulkBar = page.locator('.home-bulk-bar')
  await expect(bulkBar).toContainText('2 selected')

  // Click "Move to folder" button in bulk bar
  await bulkBar.getByRole('button', { name: /Move to folder/i }).click()

  // Context menu opens: choose "+ New folder"
  await page.getByRole('menuitem', { name: /\+ New folder/i }).first().click()

  // Folder dialog opens: type name and submit
  const dialog = page.getByRole('dialog', { name: /New folder/i })
  await expect(dialog).toBeVisible()
  await dialog.locator('input').fill('Midterm Exams')
  await dialog.getByRole('button', { name: /Create/i }).click()

  // Both items now carry the folder badge (Level C)
  const badges = table.locator('.home-item-folder-badge')
  await expect(badges).toHaveCount(2)
  await expect(badges.first()).toContainText('Midterm Exams')

  // 2. Mappa szerinti szűrés a fejlécben (Level C)
  const folderSelect = page.locator('.home-folder-select')
  await folderSelect.selectOption({ label: 'Midterm Exams' })

  // Table now only shows the 2 items in this folder
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table).toContainText('Algebra Midterm')
  await expect(table).toContainText('Geometry Final')

  // Rename folder via toolbar button
  await page.locator('.home-folder-tool-btn[title="Rename"]').click()
  const renameDialog = page.getByRole('dialog', { name: /Rename/i })
  await expect(renameDialog).toBeVisible()
  await renameDialog.locator('input').fill('Math Exams')
  await renameDialog.getByRole('button', { name: /Rename/i }).click()

  // Badge updated to new name
  await expect(badges.first()).toContainText('Math Exams')

  // Reset filter to All folders
  await folderSelect.selectOption({ value: 'all' })
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // 3. Egyedi áthelyezés sormenüből (Level B)
  if (await bulkBar.isVisible()) {
    await bulkBar.getByRole('button', { name: /Clear selection/i }).click()
  }

  // Open 3-dot menu on first row
  const firstRowMenu = table.locator('.home-btn-menu').first()
  await firstRowMenu.click()

  // Submenu: Folder -> No folder
  const folderMenuItem = page.getByRole('menuitem', { name: /Folder/i })
  await folderMenuItem.hover()
  await page.getByRole('menuitemradio', { name: /No folder/i }).click()

  // First item no longer has the folder badge, second item still does
  await expect(table.locator('.home-item-folder-badge')).toHaveCount(1)
})

