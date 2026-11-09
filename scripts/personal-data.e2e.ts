import { expect, test } from '@playwright/test'

/**
 * Beállítások → Saját adataim (tp#60): a diák a telefonján maradt adatait
 * egy helyen látja és törölheti.
 *
 * A mérés a valódi tárolón megy: háromféle adatot vetünk be, megnézzük a
 * számokat, törlünk egy sort, majd mindent — és ellenőrizzük, hogy a bank és a
 * felület nyelve megmaradt.
 */

const SEED = `
  localStorage.setItem('tesztpapagaj:language', 'hu')
  localStorage.setItem('test-parrot:welcomed', 'true')
  localStorage.setItem('testparrot.practice-results', JSON.stringify([
    { bankId: 'b1', name: 'Első bank', total: 3, right: 2, at: 1 },
    { bankId: 'b2', name: 'Második bank', total: 5, right: 5, at: 2 },
  ]))
  localStorage.setItem('tesztpapagaj:review-decks', JSON.stringify([
    { id: 'd1', title: 'Hibalista', createdAt: 1, expiresAt: Date.now() + 60000,
      cards: [{ id: 'c1', front: 'Kérdés', back: 'Válasz' }] },
  ]))
  localStorage.setItem('testparrot.game-avatar.ABC123', 'anna')
`

test('a saját adatokat látni és törölni lehet', async ({ page }) => {
  await page.addInitScript(SEED)
  await page.goto('/settings')

  const row = (part: string) => page.locator(`.personal-data-row[data-part="${part}"]`)
  await expect(row('practice').locator('.personal-data-count')).toHaveText('2')
  await expect(row('reviews').locator('.personal-data-count')).toHaveText('1')
  await expect(row('avatars').locator('.personal-data-count')).toHaveText('1')
  await expect(page.getByRole('heading', { name: 'Saját adataim ezen a gépen' })).toBeVisible()
  if (process.env.PROBE_SHOT) await page.screenshot({ path: 'personal-data.png', fullPage: true })

  // Egy sor törlése: megerősítés után csak az a tétel tűnik el.
  await row('practice').getByRole('button', { name: 'Törlés' }).click()
  const dialog = page.locator('.destructive-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Gyakorló eredmények: 2')
  await dialog.getByRole('button', { name: 'Törlés' }).click()
  await expect(row('practice').locator('.personal-data-count')).toHaveText('0')
  await expect(row('reviews').locator('.personal-data-count')).toHaveText('1')
  expect(await page.evaluate(() => localStorage.getItem('testparrot.practice-results'))).toBeNull()

  // Mindent töröl: a figura és a hibalista is elmegy, a nyelv marad.
  await page.getByRole('button', { name: 'Mindent töröl' }).click()
  await expect(page.getByRole('heading', { name: 'Törlöd az összes adatod?' })).toBeVisible()
  await page.locator('.destructive-dialog').getByRole('button', { name: 'Törlés' }).click()
  await expect(row('reviews').locator('.personal-data-count')).toHaveText('0')
  await expect(row('avatars').locator('.personal-data-count')).toHaveText('0')
  const left = await page.evaluate(() => ({
    decks: localStorage.getItem('tesztpapagaj:review-decks'),
    avatar: localStorage.getItem('testparrot.game-avatar.ABC123'),
    language: localStorage.getItem('tesztpapagaj:language'),
  }))
  expect(left.decks).toBeNull()
  expect(left.avatar).toBeNull()
  expect(left.language).toBe('hu')

  // Üres állapotban a „Mindent töröl" nem kattintható.
  await expect(page.getByRole('button', { name: 'Mindent töröl' })).toBeDisabled()
})
