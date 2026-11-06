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
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
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

  // A kincsesbarlang kikapcsolása: így a mezőnyitás a felolvasó fázisba visz.
  await builder.getByRole('checkbox', { name: 'Kincsesbarlang' }).uncheck()
  await expect(builder.getByText('Nincs kincsesbarlang')).toBeVisible()

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

  // A mezőnyitás a felolvasó fázist nyitja: a színpad a mező értékét és a
  // felolvasás kérését mutatja (a kérdés a tanár kezében van).
  await expect(
    stage
      .getByRole('heading', { name: /500 pontos mező/ })
      .or(stage.getByRole('heading', { name: movedPrompt })),
  ).toBeVisible({ timeout: 15000 })
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

test('a tábla beosztása újratöltés után is megmarad, és sablonba menthető', async ({ page }) => {
  const { builder } = await openSetup(page)

  const firstColumn = builder.locator('.gq-builder-column').first()
  const first = firstColumn.locator('.gq-builder-tile').nth(0)
  const fiveHundred = firstColumn.locator('.gq-builder-tile').nth(4)
  const moved = (await first.innerText()).replace(/\s+/g, ' ').trim()
  const prompt = moved.replace(/^100\s*/, '')

  // Áthelyezés az 500-as mezőre, majd sablonba mentés.
  await first.click()
  await fiveHundred.click()
  await expect(fiveHundred).toContainText(prompt)

  await builder.getByLabel('Sablon neve').fill('Földrajz — 6. osztály')
  await builder.getByRole('button', { name: 'Mentés', exact: true }).click()
  await expect(builder.locator('.gq-builder-template .gq-builder-question').first()).toHaveText('Földrajz — 6. osztály')

  // Újratöltés: a terv a böngésző tárolójából visszajön.
  await page.reload()
  await page.getByRole('button', { name: /^Veszély/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const stage = page.getByRole('dialog', { name: 'Veszély!' })
  await stage.waitFor()
  const reopened = stage.locator('.gq-builder')
  await expect(reopened.locator('.gq-builder-column').first().locator('.gq-builder-tile').nth(4)).toContainText(
    prompt,
  )
  await expect(reopened.locator('.gq-builder-template .gq-builder-question').first()).toHaveText('Földrajz — 6. osztály')

  // A sablon betöltése az automatikus táblát hozza vissza.
  await reopened.getByRole('button', { name: 'Automatikus feltöltés' }).click()
  await expect(
    reopened.locator('.gq-builder-column').first().locator('.gq-builder-tile').nth(4),
  ).toHaveAttribute('data-filled', 'no')
  await reopened.locator('.gq-builder-template .gq-builder-question').first().click()
  await expect(
    reopened.locator('.gq-builder-column').first().locator('.gq-builder-tile').nth(4),
  ).toContainText(prompt)
})

test('húzással is a helyére kerül a kérdés', async ({ page }) => {
  const { builder } = await openSetup(page)

  const firstColumn = builder.locator('.gq-builder-column').first()
  const first = firstColumn.locator('.gq-builder-tile').nth(0)
  const target = firstColumn.locator('.gq-builder-slot').nth(4)
  const moved = (await first.innerText()).replace(/\s+/g, ' ').trim()
  const prompt = moved.replace(/^100\s*/, '')

  // A mezőt a célmezőre húzva helyet cserélnek (a fogás a mezőn indul).
  await first.dragTo(target)
  await expect(firstColumn.locator('.gq-builder-tile').nth(4)).toContainText(prompt)

  // A készletből is húzható: előbb leveszünk egy kérdést, hogy legyen a poolban.
  // A csere után az első mező üres, ezért egy foglaltat veszünk le.
  await firstColumn.locator('.gq-builder-tile').nth(1).click()
  await builder.getByRole('button', { name: 'Levesz' }).click()
  const pool = builder.locator('.gq-builder-question').first()
  const free = (await pool.innerText()).trim()
  await pool.dragTo(firstColumn.locator('.gq-builder-slot').nth(0))
  await expect(firstColumn.locator('.gq-builder-tile').nth(0)).toContainText(free)
})

test('a lobbi visszaadja a táblát, és a terv megmarad', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedBank(page)
  await page.goto('/jatek')
  await page.getByRole('button', { name: /^Veszély/ }).click()
  await page.getByRole('checkbox', { name: 'Diákok a saját eszközükön' }).check()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()

  // Eszközös módban előbb a tábla jön, aztán a szoba.
  const builder = page.locator('.gq-builder')
  await expect(builder).toBeVisible()
  await page.getByRole('button', { name: 'Tovább a lobbihoz' }).click()
  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()

  // A lobbiból vissza a táblához, és a beosztás ott van.
  await lobby.getByRole('button', { name: 'Tábla szerkesztése' }).click()
  await expect(builder).toBeVisible()
  await expect(builder.locator('.gq-builder-tile[data-filled="yes"]')).toHaveCount(6)
})

test('a nehézség szerinti feltöltés a nehéz kérdést az 500-as mezőre teszi', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/about')
  await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Nehézség bank' })
    const question = (index: number, difficulty: 'easy' | 'medium' | 'hard') => ({
      id: `d${index}`,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      difficulty,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Nehézség kérdés ${index}` }] },
          {
            type: 'multipleChoice',
            content: [
              ['Oxigén', false],
              ['Szén-dioxid', true],
              ['Hélium', false],
            ].map(([text, correct], choiceIndex) => ({
              type: 'multipleChoiceChoice',
              attrs: { id: `d${index}-${choiceIndex}`, correct },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }],
            })),
          },
        ],
      },
    })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [
        question(1, 'hard'),
        question(2, 'easy'),
        question(3, 'medium'),
        question(4, 'easy'),
        question(5, 'medium'),
        question(6, 'hard'),
      ],
    } as never)
  })

  await page.goto('/jatek')
  await page.getByRole('button', { name: /^Veszély/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const stage = page.getByRole('dialog', { name: 'Veszély!' })
  await stage.waitFor()
  const builder = stage.locator('.gq-builder')
  await expect(builder).toBeVisible()

  await builder.getByRole('button', { name: 'Nehézség szerint' }).click()
  const firstColumn = builder.locator('.gq-builder-column').first()
  const secondColumn = builder.locator('.gq-builder-column').nth(1)
  // A legkönnyebbek a 100-as, a nehezek az 500-as sorban állnak.
  await expect(firstColumn.locator('.gq-builder-tile').nth(0)).toContainText('Nehézség kérdés 2')
  await expect(secondColumn.locator('.gq-builder-tile').nth(0)).toContainText('Nehézség kérdés 4')
  // Hat kérdés három sort tölt meg: a legfelső foglalt sor a nehezeké.
  await expect(firstColumn.locator('.gq-builder-tile').nth(2)).toContainText('Nehézség kérdés 1')
  await expect(secondColumn.locator('.gq-builder-tile').nth(2)).toContainText('Nehézség kérdés 6')
  await expect(firstColumn.locator('.gq-builder-tile').nth(4)).toHaveAttribute('data-filled', 'no')
})
