import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Offline gyakorlás (tp#58): a tanulói bank a telefonon van, a héj a cache-ben —
 * hálózat nélkül is meg kell nyílnia a gyakorlónak.
 *
 * Az offline héj a **build** terméke (`assets-manifest.json`, `service-worker.js`),
 * ezért ez a próba a kész `dist/`-et szolgálja ki (`vite preview`, 4175), nem a
 * fejlesztői szervert. Ha nincs build, a teszt hangosan kimarad.
 */

// A Playwright a projekt gyökeréből futtat (nincs `import.meta.dir` a tsx-ben).
const ROOT = process.cwd()
const PORT = 4175
const ORIGIN = `http://127.0.0.1:${PORT}`

let preview: ChildProcess | null = null

test.beforeAll(async () => {
  if (!existsSync(join(ROOT, 'dist', 'service-worker.js'))) return
  preview = spawn('bunx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: true,
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const answer = await fetch(ORIGIN, { method: 'HEAD' })
      if (answer.ok) return
    } catch {
      // még nem indult el
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
})

test.afterAll(() => {
  preview?.kill()
})

test('a gyakorló hálózat nélkül is megnyílik', async ({ browser }) => {
  test.skip(
    !existsSync(join(ROOT, 'dist', 'service-worker.js')),
    'nincs build: futtasd a `bun run build`-et az offline mérés előtt',
  )
  test.setTimeout(180_000)

  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.localStorage.setItem('tesztpapagaj:language', 'hu')
    window.localStorage.setItem('test-parrot:welcomed', 'true')
  })

  // Bank a tárolóba (az éles buildben nincs fejlesztői modul, ezért a bankot a
  // felületen át hozzuk létre: új bank, majd két kérdés a szerkesztőből nem kell
  // — elég egy kártyás gyakorlóhoz a bank létrehozása a kezdőlapon).
  await page.goto(`${ORIGIN}/`)
  await page.getByRole('button', { name: 'Új kérdésbank', exact: true }).first().click()
  await expect(page).toHaveURL(/question-bank\?id=/, { timeout: 30_000 })
  const bankId = new URL(page.url()).searchParams.get('id') ?? ''
  expect(bankId).not.toBe('')

  // A gyakorlóhoz kérdés kell: a szerkesztőben egy kártyás kérdést veszünk fel.
  await page.goto(`${ORIGIN}/gyakorlas?bank=${bankId}`)
  await expect(page.locator('.practice, .practice-loading').first()).toBeVisible({ timeout: 30_000 })

  // A worker átveszi az irányítást és feltölti a cache-t.
  await expect
    .poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 60_000,
    })
    .toBe(true)
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).length), { timeout: 60_000 })
    .toBeGreaterThan(0)
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    let total = 0
    for (const name of names) total += (await (await caches.open(name)).keys()).length
    return total
  })
  // Az app-shell a build minden elemét előre cache-eli.
  expect(cached).toBeGreaterThan(20)

  // Hálózat ki, újratöltés: a gyakorló oldalnak kirajzolódnia kell.
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.practice')).toBeVisible({ timeout: 30_000 })

  await context.setOffline(false)
  await context.close()
})
