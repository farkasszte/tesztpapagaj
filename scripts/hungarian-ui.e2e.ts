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

  // A Szerkesztés menü visszavonás/újra, a Formázás menü a magyar stílusneveket.
  await page.getByRole('button', { name: 'Szerkesztés', exact: true }).click()
  const editMenu = page.getByRole('menu')
  await expect(editMenu).toContainText('Visszavonás')
  await expect(editMenu).toContainText('Újra')
  await expect(editMenu).not.toContainText('Undo')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Formázás', exact: true }).click()
  const formatMenu = page.getByRole('menu')
  await expect(formatMenu).toContainText('Papír stílusa')
  await expect(formatMenu).toContainText('Alap')
  await expect(formatMenu).not.toContainText('Standard')
  // A stílusok almenüje is magyar neveket kínál.
  await formatMenu.getByRole('menuitem', { name: /Papír stílusa/ }).click()
  await expect(page.getByRole('menu').last()).toContainText('Klasszikus')
  await expect(page.getByRole('menu').last()).toContainText('Tömör')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

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
  // A Drive-mentés külön kártyát kap: a munka nem hagyja el a gépet, kivéve a
  // tanár saját Drive-ját, és ezt a lapnak ki kell mondania.
  await expect(page.getByRole('heading', { name: 'Google Drive mentés (nem kötelező)', exact: true })).toBeVisible()
  await expect(page.getByText('a te Drive-odon van')).toBeVisible()
  await expect(page.getByText('Apache License 2.0')).toBeVisible()
  await expect(page.getByRole('link', { name: /farkas\.szte@gmail\.com/ }).first()).toHaveAttribute(
    'href',
    /mailto:farkas\.szte@gmail\.com/,
  )

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Adatvédelem', exact: true })).toBeVisible()
  await expect(page.getByText('nem gyűjt személyes adatot')).toBeVisible()
  // Az adatvédelmi lap kimondja, mi történik a Drive összekötésekor: közvetlen
  // kapcsolat a Google-lal, csak a drive.file engedély, token a memóriában.
  await expect(page.getByRole('heading', { name: 'Google Drive — ha te kötöd össze', exact: true })).toBeVisible()
  await expect(page.getByText('drive.file')).toBeVisible()
  await expect(page.getByText('a böngésző memóriájában él')).toBeVisible()
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

test('a Beállítások biztonsági másolat szakasza magyarul szól', async ({ page }) => {
  await page.goto('/settings')
  const card = page.locator('.account-settings')
  await expect(card).toBeVisible()

  await expect(card).toContainText('A dolgozatok, a kérdésbankok, a munkapéldányok és az exportelőzmények')
  await expect(card).toContainText('biztonsági másolatot')
  await expect(card).not.toContainText('are saved in this browser')
  await expect(card).not.toContainText('Persistent browser storage is enabled')
})

test('az új kérdésbank neve magyar, a margók pedig centiméterben', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Új kérdésbank', exact: true }).first().click()
  await expect(page).toHaveURL(/\/question-bank/)

  // A névtelen név a nyelven követi a felületet.
  await expect(page.getByRole('textbox', { name: 'Kérdésbank neve' })).toHaveValue('Névtelen kérdésbank')

  // A Formázás menü Margók panelje centiméterben mér.
  await page.goto('/')
  await page.getByRole('button', { name: 'Új dolgozat', exact: true }).first().click()
  await expect(page).toHaveURL(/\/editor$/)
  await page.getByRole('button', { name: 'Formázás', exact: true }).click()
  await page.getByRole('menuitem', { name: /Margók/ }).click()

  const panel = page.locator('.margins-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.margins-unit').first()).toHaveText('cm')
  const field = panel.locator('.margins-input').first()
  await expect(field).toHaveValue(/^\d+([.,]\d)?$/)
  await expect(field).toHaveAttribute('aria-label', /cm/)
  // A beírt centiméter a hüvelykes tároláson át kerekítve jön vissza.
  await field.fill('3')
  await field.blur()
  await expect(field).toHaveValue('3')
})

test('az Importok oldal Kahoot linket is kínál, magyar hibával', async ({ page }) => {
  await page.goto('/imports')
  const card = page.locator('.kahoot-link')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Kahoot importálása linkről')

  await card.locator('input').fill('https://example.com/nem-kahoot')
  await card.getByRole('button', { name: 'Kahoot importálása', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('Ez nem Kahoot link')
})

test('a Kahoot mező az import párbeszédben is ott van', async ({ page }) => {
  await page.goto('/imports')
  await page.getByRole('button', { name: 'Importálás', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Ugyanaz a mező, a párbeszéd üres állapotában.
  await expect(dialog.locator('.kahoot-link')).toBeVisible()
  await expect(dialog.locator('.kahoot-link input')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Kahoot importálása', exact: true })).toBeVisible()
})
