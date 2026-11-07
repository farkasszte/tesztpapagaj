import { expect, test } from '@playwright/test'
import { go } from './navigate'

// A készlet-választó mérése: az oktató választása **egy** készletet tölt le
// (a dinamikus import miatt a többi a hálózaton sem jelenik meg), és a diák
// lapján a figura valóban megrajzolódik.

test('az oktató választása csak a kiválasztott készletet tölti le', async ({ page }) => {
  const asked: string[] = []
  const external: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (/\.min-[\w-]+\.js|\.min\.json/.test(url)) asked.push(url)
    // A kép helyben készül: a stílus-definíció nem jöhet külső CDN-ről.
    if (!/^https?:\/\/127\.0\.0\.1:4174\//.test(url) && !url.startsWith('data:') && !url.startsWith('ws:')) {
      external.push(url)
    }
  })

  await go(page, '/jatek')
  const picker = page.locator('.gq-avatar-style select')
  await expect(picker).toBeVisible()

  await picker.selectOption('bottts')
  // A dinamikus import hálózati kérése: a kiválasztott készlet jön.
  await expect
    .poll(() => asked.some((url) => /bottts/.test(url)), { timeout: 15_000 })
    .toBe(true)

  // A választó értéke megmarad, és a beállítás a tárolóba is kerül.
  expect(await page.evaluate(() => localStorage.getItem('testparrot.avatar-style'))).toBe('bottts')

  // Csak a kiválasztott (és az alap) készlet jött le: a többi nem.
  expect(asked.some((url) => /bottts/.test(url))).toBe(true)
  expect(asked.some((url) => /^.*(personas|miniavs|fun-emoji|pixel-art)/.test(url))).toBe(false)

  // A választó mellett minta áll: három figura a kiválasztott készletből,
  // és váltáskor ezek is átrajzolódnak (nem kell fejből ismerni a neveket).
  const sample = page.locator('.gq-avatar-sample .gq-avatar svg')
  await expect(sample).toHaveCount(3)
  const before = await sample.first().innerHTML()
  await picker.selectOption('pixel-art')
  await expect
    .poll(async () => (await sample.first().innerHTML()) !== before, { timeout: 15_000 })
    .toBe(true)
  await expect.poll(() => asked.some((url) => /pixel-art/.test(url)), { timeout: 15_000 }).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('testparrot.avatar-style'))).toBe('pixel-art')

  // A definíció a bundle-ben van: nincs külső kérés (CSP, offline, költség).
  expect(external.filter((url) => /dicebear|hopjs|cdn/i.test(url))).toEqual([])
  if (process.env.PROBE_SHOT) await page.locator('.gq-avatar-style').screenshot({ path: 'avatar-picker.png' })
})

test('a diák lapján a figura megrajzolódik, és a kocka másikat ad', async ({ page }) => {
  await go(page, '/jatek?kod=123456')
  const figure = page.locator('.gq-avatar svg')
  await expect(figure).toHaveCount(1, { timeout: 20_000 })

  const before = await figure.innerHTML()
  expect(before.length).toBeGreaterThan(200)

  await page.locator('.gq-avatar-roll').click()
  await expect
    .poll(async () => (await figure.innerHTML()).length > 200 && (await figure.innerHTML()) !== before, {
      timeout: 10_000,
    })
    .toBe(true)

  // A mag a telefonon marad (a tanár csak a magot kapja meg a belépéskor).
  const stored = await page.evaluate(() => localStorage.getItem('testparrot.game-avatar.123456'))
  expect(stored).toMatch(/^[a-z0-9]{8}$/)
  if (process.env.PROBE_SHOT) await page.screenshot({ path: 'avatar-join.png', fullPage: true })
})
