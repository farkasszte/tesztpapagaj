import { expect, test, type Page } from '@playwright/test'

// A Veszély! táblájának kézi beosztása: a tanár a játék előtt dönti el, melyik
// kérdés melyik értékes mezőre kerül (a Class Gauntlet táblaépítője nyomán).
//
// A szerkesztő az automatikus táblával indul, tehát minden kérdés már kint van:
// a tanár **helyet cserél**, **levesz**, vagy a készletből **feltesz** egy
// kérdést, ha előbb levesz egyet.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

async function seedBank(page: Page): Promise<void> {
  await page.goto('/about')
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Veszély bank' })
    const question = (index: number) => ({
      id: `v${index}`,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Veszély kérdés ${index}` }] },
          {
            type: 'multipleChoice',
            content: [
              ['Oxigén', false],
              ['Szén-dioxid', true],
              ['Hélium', false],
            ].map(([text, correct], choiceIndex) => ({
              type: 'multipleChoiceChoice',
              attrs: { id: `v${index}-${choiceIndex}`, correct },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }],
            })),
          },
        ],
      },
    })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [1, 2, 3, 4, 5, 6].map(question),
    } as never)
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

/** A Veszély! előkészítő képernyője, a tábla-szerkesztővel. */
async function openSetup(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBank(page)
  await page.goto('/jatek')
  await page.getByRole('button', { name: /^Veszély/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const stage = page.getByRole('dialog', { name: 'Veszély!' })
  await stage.waitFor()
  const builder = stage.locator('.gq-builder')
  await expect(builder).toBeVisible()
  return { stage, builder }
}

test('a tanár az 500-as mezőre cseréli az első kérdést, és ott is jelenik meg', async ({ page }) => {
  const { stage, builder } = await openSetup(page)

  // Hat kérdés az automatikus táblán: két oszlop, három-három sor. A negyedik
  // és ötödik sor üres, tehát az 500-as mező fogad egy cserét.
  const firstColumn = builder.locator('.gq-builder-column').first()
  const first = firstColumn.locator('.gq-builder-tile').nth(0)
  const fiveHundred = firstColumn.locator('.gq-builder-tile').nth(4)
  const moved = (await first.innerText()).replace(/\s+/g, ' ').trim()
  const movedPrompt = moved.replace(/^100\s*/, '')
  await expect(fiveHundred).toHaveAttribute('data-filled', 'no')

  await first.click()
  await expect(first).toHaveAttribute('data-picked', 'yes')
  await fiveHundred.click()

  // A mezők helyet cseréltek: a kérdés az 500-on áll, a 100-as megüresedett.
  await expect(fiveHundred).toHaveAttribute('data-filled', 'yes')
  await expect(fiveHundred).toContainText(movedPrompt)
  await expect(fiveHundred).toContainText('500')
  await expect(first).toHaveAttribute('data-filled', 'no')

  // A tábla elindul, és az 500-as mezőn ugyanaz a kérdés olvasható.
  await stage.getByLabel('1. csapat').fill('Rókák')
  await stage.getByLabel('2. csapat').fill('Baglyok')
  await stage.getByRole('button', { name: 'Tábla indítása' }).click()

  const tiles = stage.locator('.gq-tile')
  await expect(tiles.first()).toBeVisible()
  const values = (await tiles.allInnerTexts()).map((text) => text.trim())
  const index = values.indexOf('500')
  expect(index).toBeGreaterThanOrEqual(0)
  await tiles.nth(index).click()

  // A kincsesbarlang bármelyik első sor alatti mezőre eshet: ha az 500-as kapta,
  // előbb a tétet kell lezárni.
  if (await stage.getByText('Nagy tét!').isVisible()) {
    await stage.getByLabel('Nagy tét!').fill('100')
    await stage.getByRole('button', { name: 'Tét rögzítése' }).click()
  }
  // A színpad a felolvasás fázisát mutatja: a kérdés a tanár kezében van, a
  // tábla csak az értéket mondja — ezért azt mérjük, hogy az 500-as mező nyílt.
  await expect(stage.getByRole('heading', { name: /500 pontos mező/ })).toBeVisible()
})

test('a levett kérdés visszakerül a készletbe, az automatikus feltöltés pedig helyreállít', async ({
  page,
}) => {
  const { builder } = await openSetup(page)

  const firstColumn = builder.locator('.gq-builder-column').first()
  const first = firstColumn.locator('.gq-builder-tile').nth(0)
  const fiveHundred = firstColumn.locator('.gq-builder-tile').nth(4)
  const moved = (await first.innerText()).replace(/\s+/g, ' ').trim()
  const prompt = moved.replace(/^100\s*/, '')

  // Kijelölés, majd levesz: a kérdés a készletbe kerül, a mező megüresedik.
  await first.click()
  await builder.getByRole('button', { name: 'Levesz' }).click()
  await expect(first).toHaveAttribute('data-filled', 'no')
  await expect(builder.getByText('Minden kérdés a táblán van.')).toBeHidden()

  // A készletből az 500-as mezőre tesszük.
  await fiveHundred.click()
  await builder.locator('.gq-builder-question', { hasText: prompt }).click()
  await expect(fiveHundred).toHaveAttribute('data-filled', 'yes')
  await expect(fiveHundred).toContainText(prompt)

  // Az automatikus feltöltés visszaadja a készletből épített táblát.
  await builder.getByRole('button', { name: 'Automatikus feltöltés' }).click()
  await expect(fiveHundred).toHaveAttribute('data-filled', 'no')
  await expect(builder.locator('.gq-builder-tile[data-filled="yes"]')).toHaveCount(6)
  await expect(builder.getByText('Minden kérdés a táblán van.')).toBeVisible()
})
