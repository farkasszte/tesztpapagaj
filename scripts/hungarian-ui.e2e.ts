import { expect, test } from '@playwright/test'

// A nagy e2e-készlet angolul fut (lásd playwright.config.ts), mert az a felület
// viselkedését ellenőrzi. Ezek a specek a magyar terméket fedik: a feliratok, a
// nyelvváltás és a magyar oldalak szövegei. Minden teszt a magyar nyelvet kéri,
// függetlenül a környezet alapértelmezésétől.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('a kezdőlap és a navigáció magyarul szólal meg', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Folytasd ott, ahol abbahagytad', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Új dolgozat', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Új kérdésbank', exact: true })).toBeVisible()
  for (const label of ['Kezdőlap', 'Dolgozatok', 'Kérdésbankok', 'Importok', 'Beállítások']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
})

test('a nyelvváltó a Beállításokban átvált, és a választás megmarad', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Beállítások', exact: true })).toBeVisible()

  const english = page.getByRole('button', { name: 'English', exact: true })
  await english.click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Magyar', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
  await expect(page.getByRole('heading', { name: 'Beállítások', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
  await expect(page.getByRole('heading', { name: 'Beállítások', exact: true })).toBeVisible()
})

test('a szerkesztő magyar címkékkel nyílik', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat', exact: true }).first().click()
  await expect(page).toHaveURL(/\/editor$/)

  await expect(page.getByRole('textbox', { name: 'Dolgozat neve', exact: true })).toBeVisible()
  for (const menu of ['Fájl', 'Szerkesztés', 'Formázás']) {
    await expect(page.getByRole('button', { name: menu, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Mentés', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportálás', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Visszavonás', exact: true })).toBeDisabled()

  // A Fájl menü a magyar műveleteket kínálja.
  await page.getByRole('button', { name: 'Fájl', exact: true }).click()
  const fileMenu = page.getByRole('menu')
  await expect(fileMenu).toContainText('Dolgozat megnyitása')
  await expect(fileMenu).toContainText('Mentés másként')
  await expect(fileMenu).toContainText('Módosítások elvetése')
  await expect(fileMenu).toContainText('Dolgozat törlése')
})

test('az üres dolgozat magyar üzenettel hívja a kérdésbankot', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat', exact: true }).first().click()
  await expect(page).toHaveURL(/\/editor$/)

  await expect(page.getByRole('main')).toContainText('Húzz ide kérdést egy megnyitott kérdésbankból')
  await expect(page.getByRole('button', { name: 'Kérdésbank megnyitása', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kérdésbank importálása', exact: true })).toBeVisible()
  await expect(page.getByText('Vagy húzz ide egy kérdésbank-fájlt.')).toBeVisible()
})

test('a jogi oldalak magyarul, saját névvel és kapcsolattal jelennek meg', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'A projektről', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Forrás és licenc', exact: true })).toBeVisible()
  await expect(page.getByText('Apache License 2.0')).toBeVisible()
  await expect(page.getByRole('link', { name: /farkas\.szte@gmail\.com/ }).first()).toHaveAttribute(
    'href',
    /mailto:farkas\.szte@gmail\.com/,
  )

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Adatvédelem', exact: true })).toBeVisible()
  await expect(page.getByText('nem gyűjt személyes adatot')).toBeVisible()
})

test('a kérdéspárbeszéd fejléce és a válaszgomb magyarul szól', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új kérdésbank', exact: true }).first().click()
  await expect(page).toHaveURL(/\/question-bank/)

  await page.getByRole('button', { name: 'Új kérdés', exact: true }).first().click()
  // A típus választása nyitja a kérdéspárbeszédet.
  await page.getByRole('menuitem', { name: 'Feleletválasztós', exact: true }).click()
  const dialog = page.locator('.question-dialog')
  await expect(dialog).toBeVisible()

  // A fejléc-mezők: a forrás, a típus, a nehézség, a témák és a pontszám.
  const front = dialog.locator('.front-matter')
  await expect(front).toContainText('Típus')
  await expect(front).toContainText('Nehézség')
  await expect(front).toContainText('Témák')
  await expect(front).toContainText('Pontszám')

  // Az üres pontszám helyőrzője és a válaszhívó gomb sem angol.
  await expect(front.locator('input[placeholder]')).toHaveAttribute('placeholder', 'Üres')
  // A válaszhívó gomb a szerkesztőben is magyar, és angolul nem marad belőle.
  await expect(dialog).toContainText('Válasz hozzáadása')
  await expect(dialog).not.toContainText('Add answer')
})

test('az exportálás párbeszéd magyar beállításokat kínál', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat', exact: true }).first().click()
  await expect(page).toHaveURL(/\/editor$/)

  await page.getByRole('button', { name: 'Exportálás', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // A beállítások és a műveletek magyarul, angol törmelék nélkül.
  await expect(dialog).toContainText('Formátum')
  await expect(dialog).toContainText('Tartalom kiválasztása')
  await expect(dialog).toContainText('Kevert változatok')
  await expect(dialog).toContainText('Kérdések sorrendjének keverése')
  await expect(dialog).toContainText('Válaszok sorrendjének keverése')
  await expect(dialog).toContainText('Változatok')
  await expect(dialog).toContainText('Az exportelőzmények csak ebben a böngészőben tárolódnak')
  await expect(dialog.getByRole('button', { name: 'Mégsem', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'PDF letöltése', exact: true })).toBeVisible()
  await expect(dialog).not.toContainText('Shuffle')
  await expect(dialog).not.toContainText('Download')
})
