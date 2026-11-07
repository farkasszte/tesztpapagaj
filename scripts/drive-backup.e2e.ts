import { go } from './navigate'
import { expect, test, type Page, type Route } from '@playwright/test'

// A Drive-mentés útja: Google Identity Services (hamis) → token → Drive REST
// (hamis) → csomag feltöltése a mappába. A valódi Google-höz a tanár
// kliens-azonosítója kell, ezért itt a két végpontot a teszt játssza.

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }
const FOLDER = 'Tesztpapagaj biztonsági másolatok'

type Uploaded = { name: string; bytes: number; zip: boolean }

/** A hamis Drive állapota: mappa + fájlok. */
class FakeDrive {
  folderId: string | null = null
  files: { id: string; name: string; createdTime: string }[] = []
  uploads: Uploaded[] = []
  deleted: string[] = []

  async handle(route: Route): Promise<void> {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      const body = request.postDataBuffer() ?? Buffer.alloc(0)
      const name = /"name":"([^"]+)"/.exec(body.toString('latin1'))?.[1] ?? 'unknown.zip'
      const file = { id: `file-${this.files.length + 1}`, name, createdTime: new Date().toISOString() }
      this.files.unshift(file)
      // A multipart törzsben a zip a határoló után jön: a `PK` mágia keresése
      // elég annak bizonyítására, hogy valódi csomag ment fel.
      const asText = body.toString('latin1')
      this.uploads.push({ name, bytes: body.length, zip: asText.includes('PK') })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(file) })
      return
    }

    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      this.folderId = 'folder-1'
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: this.folderId }) })
      return
    }

    if (method === 'DELETE') {
      const id = url.pathname.split('/').pop() ?? ''
      this.deleted.push(id)
      this.files = this.files.filter((file) => file.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const query = url.searchParams.get('q') ?? ''
      const wantsFolder = query.includes('application/vnd.google-apps.folder')
      if (wantsFolder) {
        const files = this.folderId ? [{ id: this.folderId, name: FOLDER }] : []
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: this.files }),
      })
      return
    }

    await route.fulfill({ status: 404, body: '{"error":{"message":"not found"}}' })
  }
}

/** A GIS script helyére kerülő darab: minden kérésre azonnal tokent ad. */
const FAKE_GIS = `
window.google = { accounts: { oauth2: {
  initTokenClient: function (config) {
    return { requestAccessToken: function () {
      setTimeout(function () {
        config.callback({ access_token: 'fake-access-token', expires_in: 3600 })
      }, 0)
    } }
  },
  revoke: function (token, done) { if (done) done() },
} } }
`

async function openSettings(page: Page, drive: FakeDrive) {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, ENGLISH)
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_GIS }),
  )
  await page.route('https://www.googleapis.com/**', (route) => drive.handle(route))
  await go(page, '/settings')
  return page.getByRole('region', { name: 'Backup to Google Drive' })
}

test('a Drive csatlakoztatása feltölti a csomagot, és megjegyzi a mappát', async ({ page }) => {
  const drive = new FakeDrive()
  const card = await openSettings(page, drive)

  // Csatlakozás: a hamis GIS tokent ad, a mentés azonnal lefut.
  await expect(card.getByRole('button', { name: 'Connect Google Drive' })).toBeVisible()
  const badge = page.getByRole('button', { name: 'Where your work is stored' })
  await expect(badge).toHaveAttribute('data-drive', 'off')
  await card.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(card.getByText(/Last backup:/)).toBeVisible()

  expect(drive.folderId).toBe('folder-1')
  expect(drive.uploads).toHaveLength(1)
  expect(drive.uploads[0].name).toMatch(/^tesztpapagaj-biztonsagi-masolat-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/)
  // A feltöltött törzs valódi zip (a mentés csomagja), nem üres.
  expect(drive.uploads[0].zip).toBe(true)
  expect(drive.uploads[0].bytes).toBeGreaterThan(500)

  const state = await page.evaluate(() => window.localStorage.getItem('tesztpapagaj:drive'))
  expect(state).toBeTruthy()
  const parsed = JSON.parse(state ?? '{}') as { enabled: boolean; folderId: string; lastUploadAt: number }
  expect(parsed.enabled).toBe(true)
  expect(parsed.folderId).toBe('folder-1')
  expect(parsed.lastUploadAt).toBeGreaterThan(0)

  // A jobb felső sarok jelzője is átvált: pipás felhő, és a panel az utolsó mentést mondja.
  await expect(badge).toHaveAttribute('data-drive', 'on')
  await badge.click()
  const badgePanel = page.getByRole('region', { name: 'Where your work is stored' })
  await expect(badgePanel).toContainText('backed up to Google Drive')
  await expect(badgePanel).toContainText('Last backup:')
  await badge.click()

  // Kézi mentés: újabb csomag, a mappa nem jön létre újra.
  await card.getByRole('button', { name: 'Back up now' }).click()
  await expect.poll(() => drive.uploads.length).toBe(2)

  // A fejléc paneljén is van mentés-gomb a csatlakoztatott fióknak.
  await badge.click()
  const panel = page.getByRole('region', { name: 'Where your work is stored' })
  await expect(panel.getByRole('button', { name: 'Back up now' })).toBeVisible()
  await panel.getByRole('button', { name: 'Back up now' }).click()
  await expect(panel.getByText('Saved to Google Drive.')).toBeVisible()
  await expect.poll(() => drive.uploads.length).toBe(3)
  await badge.click()

  // A Drive-on lévő csomagok listája a kártyán.
  await card.getByRole('button', { name: 'Restore from Drive' }).click()
  await expect(card.locator('.drive-file')).toHaveCount(3)
  await expect(card.locator('.drive-file-name').first()).toContainText('tesztpapagaj-biztonsagi-masolat')

  // Leválasztás: a könyvelés törlődik, a csomagok a Drive-on maradnak.
  await card.getByRole('button', { name: 'Disconnect' }).click()
  await expect(card.getByRole('button', { name: 'Connect Google Drive' })).toBeVisible()
  expect(await page.evaluate(() => window.localStorage.getItem('tesztpapagaj:drive'))).toBeNull()
  expect(drive.files).toHaveLength(3)
})

test('ha a Google nem ad hozzáférést, a felület kimondja', async ({ page }) => {
  const drive = new FakeDrive()
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, ENGLISH)
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: function (config) {
          return { requestAccessToken: function () {
            setTimeout(function () { config.error_callback({ type: 'access_denied' }) }, 0)
          } }
        },
        revoke: function (token, done) { if (done) done() },
      } } }`,
    }),
  )
  await page.route('https://www.googleapis.com/**', (route) => drive.handle(route))
  await go(page, '/settings')

  const card = page.getByRole('region', { name: 'Backup to Google Drive' })
  await card.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(card.getByRole('alert')).toContainText('Google did not give access')
  expect(drive.uploads).toHaveLength(0)
})
