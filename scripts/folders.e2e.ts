import { expect, test, type Page } from '@playwright/test'

// Mappák: a kérdésbankok és a dolgozatok virtuális mappákba rendezhetők. A mappa
// nézet-rendezés (böngésző-tároló), a bank adata érintetlen — a törölt mappa
// tartalma „mappa nélkül” marad.

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }

async function seedBanks(page: Page) {
  await page.goto('/about')
  await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    for (const name of ['Biológia', 'Történelem']) {
      const bank = await banks.create()
      await banks.commit(bank.id, { kind: 'rename', name })
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, ENGLISH)
})

test('a bank mappába tehető, a mappa szűr, és a törlés nem viszi el a bankot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBanks(page)
  await page.goto('/question-banks')

  const cards = page.locator('.question-bank-card')
  await expect(cards).toHaveCount(2)

  // Új mappa: a sáv azonnal rá is szűr, tehát üres.
  await page.getByRole('button', { name: '+ New folder' }).click()
  await page.getByLabel('Folder name').fill('Első félév')
  await page.locator('.folder-new').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('button', { name: /^Első félév/ })).toBeVisible()
  await expect(page.getByText('Nothing in this folder yet.')).toBeVisible()

  // A kártya menüjéből mappába tevés.
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Biológia actions' }).click()
  await page.getByRole('menuitemradio', { name: 'Első félév' }).click()

  const folder = page.getByRole('button', { name: /^Első félév/ })
  await expect(folder).toContainText('1')
  await folder.click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Biológia')

  // Újratöltés után is megvan a hely.
  await page.reload()
  await expect(page.getByRole('button', { name: /^Első félév/ })).toContainText('1')
  await page.getByRole('button', { name: /^Első félév/ }).click()
  await expect(cards).toHaveCount(1)

  // A Mappa nélkül a másik bankot mutatja.
  await page.getByRole('button', { name: /^No folder/ }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Történelem')

  // Mappa törlése: a bank megmarad, mappa nélkül.
  await page.getByRole('button', { name: /^Első félév/ }).click()
  await page.getByRole('button', { name: 'Delete folder' }).click()
  await expect(page.getByRole('button', { name: /^Első félév/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^No folder/ }).click()
  await expect(cards).toHaveCount(2)
})

test('a mappanév átnevezhető, és a dolgozatok külön mappát kapnak', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBanks(page)

  // Ugyanaz a név a két gyűjteményben külön mappa: nem ütköznek.
  await page.goto('/question-banks')
  await page.getByRole('button', { name: '+ New folder' }).click()
  await page.getByLabel('Folder name').fill('Félév')
  await page.locator('.folder-new').getByRole('button', { name: 'Create' }).click()
  await page.getByLabel('Rename', { exact: true }).fill('Első félév')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Első félév/ })).toBeVisible()

  await page.goto('/exams')
  await page.getByRole('button', { name: '+ New folder' }).click()
  await page.getByLabel('Folder name').fill('Félév')
  await page.locator('.folder-new').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('button', { name: /^Félév/ })).toBeVisible()
})
