import { go } from './navigate'
import { expect, test } from '@playwright/test'

// Mérési segéd (A2): a héj offline is indul-e. Éles buildet szolgál ki a
// `vite preview` (4175), ezért a teszt a saját abszolút címét használja.
// Futtatás: PROBE=1 PREVIEW=1 bunx playwright test scripts/probe-offline.e2e.ts

test.skip(!process.env.PROBE, 'mérési segéd — PROBE=1 nélkül kimarad')

const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4175'

test('a héj offline is betölt', async ({ page, context }) => {
  test.setTimeout(120_000)

  await go(page, `${PREVIEW}/`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })

  // A service worker aktív, és a cache feltöltődött az első (online) látogatáskor.
  const cached = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) return { active: false, entries: 0, css: 0, gameCss: false, missing: [] }
    // A cache nevét a build azonosítója zárja, ezért előtag alapján keressük.
    const caches0 = await caches.keys()
    const shell = caches0.find((name) => name.startsWith('test-parrot-shell-'))
    if (!shell) return { active: true, entries: 0, css: 0, gameCss: false, missing: [] }
    const cache = await caches.open(shell)
    const keys = await cache.keys()
    const names = keys.map((key) => new URL(key.url).pathname)
    return {
      active: true,
      entries: keys.length,
      css: names.filter((name) => name.endsWith('.css')).length,
      gameCss: names.some((name) => name.includes('game-') && name.endsWith('.css')),
      missing: names.filter((name) => name.includes('game-')).slice(0, 4),
    }
  })
  console.log(`service worker aktív: ${cached.active}, cache-elt kérés: ${cached.entries}, css: ${cached.css}, game css: ${cached.gameCss}`)
  expect(cached.active).toBe(true)
  expect(cached.entries).toBeGreaterThan(2)

  // Hálózat nélkül: a főoldal és a játék beállító oldala is nyílik.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await go(page, `${PREVIEW}/jatek`)
  await page.waitForTimeout(1500)
  console.log('offline /jatek oldal:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 220) || '(üres)')
  console.log('hibák:', errors.slice(0, 3).join(' | ') || 'nincs')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
  // A preview a böngésző nyelvét használja (alapból magyar), ezért mindkét
  // feliratot elfogadjuk.
  const mode = await page.getByRole('button', { name: /^(Classic|Klasszikus)/ }).isVisible()
  console.log(`offline /jatek: a módlista látszik: ${mode}`)
  expect(mode).toBe(true)

  await context.setOffline(false)
})
