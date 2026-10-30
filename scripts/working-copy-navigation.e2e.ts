import { expect, test } from '@playwright/test'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat' }).first().click()
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).waitFor()
}

test('in-app navigation warns only while a Working Copy backup is pending', async ({ page }) => {
  await openEditor(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'authoring-state') {
        throw new DOMException('Injected Working Copy failure', 'DataCloneError')
      }
      return original.call(this, value, key)
    }
    ;(window as unknown as { confirmCalls: string[] }).confirmCalls = []
    window.confirm = (message) => {
      ;(window as unknown as { confirmCalls: string[] }).confirmCalls.push(message)
      return false
    }
  })

  await page.getByRole('textbox', { name: 'Dolgozat neve' }).fill('Backup fails')
  await expect(page.getByLabel('Munkapéldány állapota')).toHaveText('A mentés nem sikerült')
  await page.getByRole('link', { name: 'a projektről' }).click()
  expect(await page.evaluate(() =>
    (window as unknown as { confirmCalls: string[] }).confirmCalls,
  )).toHaveLength(1)
  await expect(page.getByRole('textbox', { name: 'Dolgozat neve' })).toBeVisible()

  // A healthy backed-up copy changes routes without a confirmation.
  await page.reload()
  await page.getByRole('textbox', { name: 'Dolgozat neve' }).waitFor()
  await page.getByRole('link', { name: 'a projektről' }).click()
  await expect(page.getByRole('link', { name: 'Kezdőlap' })).toBeVisible()
})
