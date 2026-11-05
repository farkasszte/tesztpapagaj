import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/** Creates a Question Bank holding one Question with an image in it. */
async function seedAccount(page: Page, bankName: string) {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  // Az első látogatás regisztrálja a képkezelő service workert, és amíg át nem
  // veszi az irányítást, a lap egyszer újratöltődik: a vetés előtt ezt kivárjuk,
  // különben a későbbi lapváltások egy félkész oldalon történnek.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15000 })
  await page.evaluate(async (name) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const { saveImage } = (await import(
      /* @vite-ignore */ '/src/local-images.ts'
    )) as typeof import('../src/local-images')
    const canvas = new OffscreenCanvas(4, 3)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#9f5037'
    context.fillRect(0, 0, 4, 3)
    const src = await saveImage(await canvas.convertToBlob({ type: 'image/png' }))
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name })
    await banks.commit(bank.id, {
      kind: 'create-question',
      question: {
        id: `question-${crypto.randomUUID()}`,
        type: 'open',
        columns: 1,
        topics: [],
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Label the cell.' }] },
            { type: 'image', attrs: { src, alt: '', title: '' } },
          ],
        },
      },
    })
  }, bankName)
}

async function bankNames(page: Page) {
  return page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    return (await createQuestionBankWorkspaceService().recent()).map((bank) => bank.name).sort()
  })
}

async function mediaCount(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('test-parrot-exams-v1')
    const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result) })
    const count = database.transaction('media-assets').objectStore('media-assets').count()
    const result = await new Promise<number>((resolve) => { count.onsuccess = () => resolve(count.result) })
    database.close()
    return result
  })
}

async function renameOnlyBank(page: Page, name: string) {
  await page.evaluate(async (next) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const [bank] = await banks.recent()
    await banks.commit(bank!.id, { kind: 'rename', name: next })
  }, name)
}

function panel(page: Page) {
  return page.getByRole('region', { name: 'Where your work is stored' })
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Where your work is stored' }).click()
  await expect(panel(page)).toBeVisible()
}

function backupCard(page: Page) {
  return page.getByRole('region', { name: 'Back up your work' })
}

test('a downloaded account backup restores every Question Bank and image', async ({ page }) => {
  await seedAccount(page, 'Biology Bank')
  await page.goto('/question-banks')
  await openPanel(page)
  // A jelző a helyi tárolást és a Drive-lehetőséget is kimondja.
  await expect(panel(page)).toContainText('Your work lives in this browser')
  await expect(panel(page)).toContainText('connect your Google Drive')
  await panel(page).getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)

  const downloading = page.waitForEvent('download')
  await backupCard(page).getByRole('button', { name: 'Download backup' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^test-parrot-account-\d{4}-\d{2}-\d{2}\.zip$/)
  const backup = await readFile((await download.path())!)

  // Work that happens after the backup is what a restore replaces.
  await renameOnlyBank(page, 'Renamed after backup')
  await seedAccount(page, 'Made after backup')
  expect(await bankNames(page)).toEqual(['Made after backup', 'Renamed after backup'])
  expect(await mediaCount(page)).toBe(1)

  // Settings is also a destination in the left nav.
  await page.goto('/question-banks')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Choose an account backup to restore').setInputFiles({
    name: 'test-parrot-account.zip', mimeType: 'application/zip', buffer: backup,
  })
  const confirm = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(confirm).toContainText('replaces every Exam, Question Bank')
  // A visszaállítás a következő betöltés elején fut le, tehát a gombnyomás
  // után meg kell várni az újratöltést: enélkül a következő lapváltás a régi
  // dokumentumon indul, és a visszaállítás előtti állapotot látni.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    confirm.getByRole('button', { name: 'Replace and reload' }).click(),
  ])

  await expect(backupCard(page)).toBeVisible()
  await page.goto('/question-banks')
  // A kártya neve a „Open {név}." kezdet után a bank nevét és a kérdésszámot is
  // hordozza, ezért a névre illesztünk, a számot pedig a kártyán mérjük.
  const biology = page.getByRole('button', { name: /^Open Biology Bank\./ })
  await expect(biology).toBeVisible()
  await expect(biology).toContainText('1 Question')
  await expect(page.getByRole('button', { name: /^Open Made after backup\./ })).toHaveCount(0)
  expect(await bankNames(page)).toEqual(['Biology Bank'])
  expect(await mediaCount(page)).toBe(1)
})

test('a file that is not a backup is refused without changing anything', async ({ page }) => {
  await seedAccount(page, 'Keep me')
  await page.goto('/settings')
  await page.getByLabel('Choose an account backup to restore').setInputFiles({
    name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip'),
  })
  await expect(backupCard(page).getByRole('alert')).toHaveText('This file is not a Tesztpapagáj account backup.')
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toHaveCount(0)
  expect(await bankNames(page)).toEqual(['Keep me'])
})

test('a mappába rendezés is átmegy a biztonsági másolatba', async ({ page }) => {
  await seedAccount(page, 'Foldered Bank')
  await page.goto('/question-banks')

  // Mappa, és a bank bele: a hely a böngésző tárolójában van, tehát a mentésnek
  // ezt is vinnie kell — különben a visszaállítás után a tanár rendezése elveszne.
  await page.getByRole('button', { name: '+ New folder' }).click()
  await page.getByLabel('Folder name').fill('Autumn')
  await page.locator('.folder-new').getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Foldered Bank actions' }).click()
  await page.getByRole('menuitemradio', { name: 'Autumn' }).click()
  await expect(page.getByRole('button', { name: /^Autumn/ })).toContainText('1')

  await page.goto('/settings')
  const downloading = page.waitForEvent('download')
  await backupCard(page).getByRole('button', { name: 'Download backup' }).click()
  const backup = await readFile((await (await downloading).path())!)

  // A mappa törlése: a hely is elvész, tehát a visszaállításnak kell visszahoznia.
  await page.goto('/question-banks')
  await page.getByRole('button', { name: /^Autumn/ }).click()
  await page.getByRole('button', { name: 'Delete folder' }).click()
  await expect(page.getByRole('button', { name: /^Autumn/ })).toHaveCount(0)
  expect(await page.evaluate(() => window.localStorage.getItem('tesztpapagaj:folders'))).not.toContain(
    'Autumn',
  )

  await page.goto('/settings')
  await page.getByLabel('Choose an account backup to restore').setInputFiles({
    name: 'test-parrot-account.zip',
    mimeType: 'application/zip',
    buffer: backup,
  })
  const confirm = page.getByRole('dialog', { name: 'Restore this backup?' })
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    confirm.getByRole('button', { name: 'Replace and reload' }).click(),
  ])

  await page.goto('/question-banks')
  const folder = page.getByRole('button', { name: /^Autumn/ })
  await expect(folder).toContainText('1')
  await folder.click()
  const card = page.getByRole('button', { name: /^Open Foldered Bank\./ })
  await expect(card).toBeVisible()
})
