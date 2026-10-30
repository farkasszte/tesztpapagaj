import { expect, test, type Page } from '@playwright/test'

async function seedBanks(page: Page) {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'A projektről' })).toBeVisible()
  return page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    ) as typeof import('../src/question-bank-workspaces')
    const ids = ['bank-biology', 'bank-chemistry', 'bank-physics']
    const service = createQuestionBankWorkspaceService({ createId: () => ids.shift()! })
    const biology = await service.create()
    await service.commit(biology.id, { kind: 'rename', name: 'Biology' })
    await service.commit(biology.id, {
      kind: 'create-question',
      question: {
        id: 'question-mitosis', type: 'open', columns: 1, difficulty: 'hard', topics: ['Cells'],
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Describe mitosis.' }] }] },
      },
    })
    const chemistry = await service.create()
    await service.commit(chemistry.id, { kind: 'rename', name: 'Chemistry' })
    await service.commit(chemistry.id, {
      kind: 'create-question',
      question: {
        id: 'question-oxygen', type: 'open', columns: 1, difficulty: 'easy', topics: ['Atoms'],
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Describe oxygen.' }] }] },
      },
    })
    const physics = await service.create()
    await service.commit(physics.id, { kind: 'rename', name: 'Physics' })
    return { biology: biology.id, chemistry: chemistry.id, physics: physics.id }
  })
}

const bank = (page: Page) => page.getByRole('region', { name: 'Kérdésbank' })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Kérdésszöveg keresése' })

/** The editor edits an Exam, so every tab test starts by opening one. */
async function newExam(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).waitFor()
}

async function openBankTab(page: Page, name: RegExp) {
  await page.getByRole('button', { name: 'Kérdésbank megnyitása' }).click()
  await page.getByRole('dialog', { name: 'Kérdésbank megnyitása' }).getByRole('button', { name }).click()
}

test('opening a Question Bank goes to its own page and creates no Exam', async ({ page }) => {
  const ids = await seedBanks(page)
  await page.goto(`/question-bank?id=${ids.biology}`)

  await expect(page.getByRole('textbox', { name: 'Kérdésbank neve' })).toHaveValue('Biology')
  await expect(page.getByRole('navigation', { name: 'Morzsamenü' })).toContainText('Question Banks')
  await expect(bank(page)).toContainText('Describe mitosis.')
  // No Exam, and therefore no tabs and nothing to add a Question to.
  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(bank(page).getByRole('button', { name: 'Describe mitosis. felvétele a dolgozatba' })).toHaveCount(0)

  const exams = await page.evaluate(async () => {
    const { createExamWorkspaceService } = await import(
      /* @vite-ignore */ '/src/exam-workspaces.ts'
    ) as typeof import('../src/exam-workspaces')
    return createExamWorkspaceService().recent()
  })
  expect(exams).toHaveLength(0)
})

test('the Question Bank page filters and opens a Question for editing', async ({ page }) => {
  const ids = await seedBanks(page)
  await page.goto(`/question-bank?id=${ids.biology}`)

  await search(page).fill('oxygen')
  await expect(bank(page)).not.toContainText('Describe mitosis.')
  await search(page).fill('mitosis')
  await expect(bank(page)).toContainText('Describe mitosis.')

  await bank(page).getByRole('listitem').filter({ hasText: 'Describe mitosis.' }).dblclick()
  await expect(page.getByRole('dialog', { name: 'Kérdés' })).toBeVisible()
})

test('an Exam with no bank tabs offers opening or creating a Question Bank', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)

  await expect(page.getByRole('button', { name: 'Kérdésbank megnyitása' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create new Question Bank' })).toBeVisible()
  await page.getByRole('button', { name: 'Create new Question Bank' }).click()

  await expect(page.getByRole('tab', { name: 'Untitled Question Bank' })).toHaveAttribute('aria-selected', 'true')
  await expect(bank(page)).toContainText('No questions yet')
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
})

test('the bank picker owns focus and restores it when dismissed', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  const openBank = page.getByRole('button', { name: 'Kérdésbank megnyitása' })
  await openBank.click()
  const closePicker = page.getByRole('button', { name: 'Kérdésbank-választó bezárása' })
  await expect(closePicker).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(openBank).toBeFocused()
  await openBankTab(page, /Chemistry/)
  const chemistryTab = page.getByRole('tab', { name: 'Chemistry' })
  await expect(chemistryTab).toBeFocused()
  await expect(bank(page)).toContainText('Describe oxygen.')
})

test('bank tabs support Arrow, Home, and End keyboard navigation', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)

  const chemistryTab = page.getByRole('tab', { name: 'Chemistry' })
  await chemistryTab.press('ArrowLeft')
  const biologyTab = page.getByRole('tab', { name: 'Biology' })
  await expect(biologyTab).toBeFocused()
  await biologyTab.press('End')
  await expect(chemistryTab).toBeFocused()
  await chemistryTab.press('Home')
  await expect(biologyTab).toBeFocused()
  await biologyTab.press('ArrowRight')
  await expect(chemistryTab).toBeFocused()
})

test('search, difficulty, and topic filters remain independent per bank tab', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)
  const chemistryTab = page.getByRole('tab', { name: 'Chemistry' })
  await expect(chemistryTab).toHaveAttribute('aria-selected', 'true')
  await search(page).fill('oxygen')

  const biologyTab = page.getByRole('tab', { name: 'Biology' })
  await biologyTab.click()
  await search(page).fill('mitosis')
  await bank(page).getByRole('button', { name: 'Nehézség' }).click()
  await page.getByRole('group', { name: 'Nehézség' }).getByText('Nehéz').click()
  await bank(page).getByRole('button', { name: 'Téma' }).click()
  await page.getByRole('group', { name: 'Téma' }).getByText('Cells').click()

  await chemistryTab.click()
  await expect(chemistryTab).toHaveAttribute('aria-selected', 'true')
  await expect(search(page)).toHaveValue('oxygen')
  await biologyTab.click()
  await expect(search(page)).toHaveValue('mitosis')
  await expect(bank(page).getByRole('button', { name: 'Nehézség' })).toContainText('1')
  await expect(bank(page).getByRole('button', { name: 'Téma' })).toContainText('1')
})

test('a bare editor refresh restores open tabs, the active bank, and its filter', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'true')
  await search(page).fill('oxygen')
  await page.reload()
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'true')
  await expect(search(page)).toHaveValue('oxygen')

  await expect(page.getByRole('tab', { name: 'Biology' })).toBeVisible()
})

test('opening and closing bank tabs does not touch the Exam', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Chemistry bezárása' }).click()
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Biology' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Biology bezárása' }).click()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kérdésbank megnyitása' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create new Question Bank' })).toBeVisible()
  await expect(page.getByText('Húzz ide kérdést egy megnyitott kérdésbankból')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Visszavonás' })).toBeDisabled()
})

test('opening an Exam inside the editor carries the current tabs and external reopening restores them', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).fill('Destination Exam')
  await page.getByRole('button', { name: 'Mentés', exact: true }).click()
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()

  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)
  await page.getByRole('button', { name: 'Fájl' }).click()
  await page.getByRole('menuitem', { name: 'Dolgozat megnyitása' }).click()
  await page.getByRole('dialog', { name: 'Dolgozat megnyitása' }).getByRole('button', { name: /Destination Exam/ }).click()

  await expect(page.getByRole('tab', { name: 'Biology' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Tesztpapagáj kezdőlap' }).click()
  await page.getByRole('button', { name: 'Open Destination Exam' }).click()
  await expect(page.getByRole('tab', { name: 'Biology' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'true')
})

test('one Exam composes Questions from multiple banks without duplicate identity', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await bank(page).getByRole('button', { name: 'Describe mitosis. felvétele a dolgozatba' }).click()
  await openBankTab(page, /Chemistry/)
  await bank(page).getByRole('button', { name: 'Describe oxygen. felvétele a dolgozatba' }).click()

  await expect(page.locator('.exam-question')).toHaveCount(2)
  await expect(page.locator('.exam-question')).toContainText(['Describe mitosis.', 'Describe oxygen.'])
  await expect(bank(page).getByRole('button', { name: 'Describe oxygen. felvétele a dolgozatba' })).toHaveCount(0)
  await expect(bank(page).getByRole('button', { name: 'Describe oxygen. eltávolítása a dolgozatból' })).toBeVisible()
})

test('adding a bank Question raises the Working Copy and Discard puts it back', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await bank(page).getByRole('button', { name: 'Describe mitosis. felvétele a dolgozatba' }).click()

  await expect(page.locator('.exam-question')).toContainText('Describe mitosis.')
  await expect(page.getByLabel('Munkapéldány állapota')).toHaveText('Unsaved changes · backed up locally')
  await page.getByRole('button', { name: 'Fájl' }).click()
  await page.getByRole('menuitem', { name: 'Módosítások elvetése' }).click()
  await expect(page.locator('.exam-question')).toHaveCount(0)
  await expect(page.getByLabel('Munkapéldány állapota')).toHaveText('Saved')
})

test('an Exam offers composition from banks but not direct creation or automatic Replace', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)

  await expect(page.getByRole('button', { name: 'Add Question' })).toBeVisible()
  await bank(page).getByRole('button', { name: 'Describe mitosis. felvétele a dolgozatba' }).click()
  await page.locator('.exam-question').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Replace with equivalents' })).toHaveCount(0)
})

test('an Exam can browse bank tabs without changing its saved state or Undo', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Visszavonás' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Exportálás' })).toBeEnabled()
  await page.getByRole('button', { name: 'Exportálás', exact: true }).click()
  const previewBefore = await page.getByLabel('Export előnézete').innerText()
  await expect(page.getByLabel('Export előnézete')).not.toContainText('Describe mitosis.')
  await page.getByRole('dialog', { name: 'Exportálás' }).getByRole('button', { name: 'Mégsem' }).click()

  await page.getByRole('button', { name: 'Kérdésbank megnyitása' }).click()
  const picker = page.getByRole('dialog', { name: 'Kérdésbank megnyitása' })
  await expect(picker).toContainText('Biology')
  await picker.getByRole('button', { name: /Biology/ }).click()
  await expect(picker).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Biology' })).toHaveAttribute('aria-selected', 'true')
  await expect(bank(page)).toContainText('Describe mitosis.')
  await search(page).fill('mitosis')
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Visszavonás' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Exportálás' })).toBeEnabled()
  await page.getByRole('button', { name: 'Exportálás', exact: true }).click()
  await expect(page.getByLabel('Export előnézete')).toHaveText(previewBefore)
  await expect(page.getByLabel('Export előnézete')).not.toContainText('Describe mitosis.')
})

test('closing an Exam bank tab leaves Questions referenced by the Exam unchanged', async ({ page }) => {
  await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await bank(page).getByRole('button', { name: 'Describe mitosis. felvétele a dolgozatba' }).click()
  await page.getByRole('button', { name: 'Mentés', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: 'Biology bezárása' }).click()

  await expect(page.locator('.exam-question')).toContainText('Describe mitosis.')
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeDisabled()
})

test('a missing bank address reports the problem and returns to the collection', async ({ page }) => {
  await seedBanks(page)
  await page.goto('/question-bank?id=missing-bank')
  await expect(page).toHaveURL(/\/question-banks$/)
  await expect(page.getByRole('alert')).toHaveText('That Question Bank is unavailable on this device.')
})

test('a bank that disappears is dropped from an Exam workspace on restore', async ({ page }) => {
  const ids = await seedBanks(page)
  await newExam(page)
  await openBankTab(page, /Biology/)
  await openBankTab(page, /Chemistry/)
  await openBankTab(page, /Physics/)
  await expect(page.getByRole('tab', { name: 'Physics' })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(async (bankId) => {
    const { QUESTION_BANK_REGISTRY_STORE, STORAGE_NAME, STORAGE_VERSION } = await import(
      /* @vite-ignore */ '/src/storage-schema.ts'
    ) as typeof import('../src/storage-schema')
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(STORAGE_NAME, STORAGE_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction(QUESTION_BANK_REGISTRY_STORE, 'readwrite')
        transaction.objectStore(QUESTION_BANK_REGISTRY_STORE).delete(bankId)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, ids.chemistry)

  await page.goto('/editor')
  await expect(page.getByRole('alert')).toHaveText('A Question Bank in this workspace is unavailable on this device.')
  await expect(page.getByRole('tab')).toHaveText(['Biology', 'Physics'])
  await expect(page.getByRole('tab', { name: 'Chemistry' })).toHaveCount(0)
})
