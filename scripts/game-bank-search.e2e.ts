import { expect, test, type Page } from '@playwright/test'

// tp#44: száz kérdésbank fölött a legördülő nem elég — a játék oldalán a
// bankválasztó fölött kereső szűri a listát. A kereső csak sok banknál jelenik
// meg, a kiválasztott bank pedig mindig látszik (különben a legördülő értéke
// eltűnne a szűrés alatt).

async function seedBanks(page: Page, names: string[]): Promise<void> {
  // A vetés utáni navigációt (service worker) elviheti, ezért újrapróbáljuk; a
  // vetés **idempotens**: csak a hiányzó neveket hozza létre, különben a
  // második kör duplikálná a bankokat.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto('/about').catch(() => undefined)
    try {
      await page.evaluate(async (given) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const existing = new Set((await banks.recent()).map((summary) => summary.name))
        for (const name of given) {
          if (existing.has(name)) continue
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name })
        }
      }, names)
      return
    } catch {
      await page.waitForTimeout(700)
    }
  }
  throw new Error('a bankok vetése nem sikerült')
}

const NAMES = [
  'Biológia — sejt',
  'Biológia — növény',
  'Fizika — mozgás',
  'Fizika — fény',
  'Földrajz — Európa',
  'Földrajz — Ázsia',
  'Irodalom — Ady',
  'Irodalom — József Attila',
  'Kémia — savak',
  'Matematika — függvények',
  'Történelem — reformkor',
  'Nyelvtan — ige',
]

test('a bankok között kereső szűr, és a választott bank megmarad', async ({ page }) => {
  await seedBanks(page, NAMES)

  // A vetés utáni első navigációt a service worker újratöltése elviheti
  // (`ERR_ABORTED`); a láthatóságra várás ezt helyre teszi.
  await page.goto('/jatek').catch(() => undefined)
  const search = page.getByRole('searchbox', { name: 'Search the question banks…' })
  await expect(search).toBeVisible()

  const select = page.locator('#gq-bank')
  await expect(select.locator('option')).toHaveCount(NAMES.length)
  await expect(page.getByRole('status').filter({ hasText: 'of' })).toHaveText('12 of 12 banks')

  // Szűrés szóra: a két fizika illeszkedik, és a kiválasztott (első) bank is a
  // listában marad, megjelölve — így a legördülő értéke nem veszik el.
  await search.fill('fizika')
  await expect(select.locator('option')).toHaveCount(3)
  await expect(select.locator('option').first()).toContainText('the current one')
  await expect(page.getByRole('status').filter({ hasText: 'of' })).toHaveText('2 of 12 banks')

  // A kiválasztott (első) bank a szűrés alatt is látszik, ha nem illeszkedik:
  // a legördülő értéke nem veszhet el.
  await search.fill('irodalom')
  await expect(select.locator('option')).toHaveCount(3)
  const values = await select.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value),
  )
  expect(values[0]).toBe(await select.inputValue())

  // Nincs találat: kimondja; a listában csak a kiválasztott bank marad.
  await search.fill('kvantum')
  await expect(page.getByRole('status').filter({ hasText: 'No bank matches' })).toBeVisible()
  await expect(select.locator('option')).toHaveCount(1)
  await expect(select.locator('option').first()).toContainText('the current one')

  // Törlés: újra a teljes lista.
  await search.fill('')
  await expect(select.locator('option')).toHaveCount(NAMES.length)
})
