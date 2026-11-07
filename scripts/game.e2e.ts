import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// A kvízjáték kivetítős útja: a három mód színpada végigjátszható a tanár
// kattintásaival, eszköz nélkül. A bankot a valódi IndexedDB-szolgáltatáson
// keresztül vetjük be, hogy a játék ugyanazt az utat járja, mint élesben.

type Choice = { text: string; correct: boolean }

const multiChoice = (id: string, stem: string, choices: Choice[]) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: choices.map((choice, index) => ({
          type: 'multipleChoiceChoice',
          attrs: { id: `${id}-${index}`, correct: choice.correct },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: choice.text }] }],
        })),
      },
    ],
  },
})

const THREE = (id: string, stem: string) =>
  multiChoice(id, stem, [
    { text: 'Oxygen', correct: false },
    { text: 'Carbon dioxide', correct: true },
    { text: 'Helium', correct: false },
  ])

/** Egy igazi kérdésbank a beépített szolgáltatással, a kérdésekkel együtt. */
async function seedBank(
  page: Page,
  seed: { name: string; questions: ReturnType<typeof multiChoice>[] },
): Promise<void> {
  await go(page, '/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await page.evaluate(async (given) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: given.name })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: given.questions as never,
    })
  }, seed)
}

async function openGame(page: Page, mode: string): Promise<void> {
  await go(page, '/jatek')
  await expect(page.getByRole('heading', { name: 'Quiz game' })).toBeVisible()
  if (mode !== 'Classic') await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
}

test('a klasszikus színpad végigjátszható: kérdés, felfedés, jelentés', async ({ page }) => {
  await seedBank(page, {
    name: 'Classic bank',
    questions: [THREE('c1', 'Which gas do plants take in?'), THREE('c2', 'Which gas do plants give off?')],
  })
  await go(page, '/jatek')
  await expect(page.getByText('2 of 2 questions can be played.')).toBeVisible()
  await openGame(page, 'Classic')

  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  await expect(stage).toBeVisible()
  await expect(stage.getByText('Question 1 of 2')).toBeVisible()
  await expect(stage.getByText('Which gas do plants take in?')).toBeVisible()
  // A három válasz mind kint van, betűvel a színpadon — a sorrend kevert.
  await expect(stage.locator('.gq-answer')).toHaveCount(3)

  // A játék szövege Lexend (tp#46): a betűtípus tényleg betöltődik, nem esik
  // vissza a rendszer-sansra, és a szélesebb betű sem lóg ki a kártyából.
  const font = await stage.locator('.gq-prompt').evaluate((node) => {
    const style = getComputedStyle(node)
    return { family: style.fontFamily, width: node.scrollWidth, box: node.clientWidth }
  })
  expect(font.family).toContain('Lexend')
  expect(font.width).toBeLessThanOrEqual(font.box + 1)
  // A magyar ékezetek a latin-ext részhalmazból jönnek: enélkül az ő/ű
  // rendszer-sansra esne vissza. A böngésző a részhalmazt csak akkor tölti le,
  // ha kell, ezért előbb kérjük (`fonts.load`), és csak utána ellenőrzünk.
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('16px Lexend', 'Árvíztűrő')
    return document.fonts.check('16px Lexend', 'Árvíztűrő')
  })
  expect(loaded).toBe(true)

  // A visszaszámláló száma és mértékegysége külön sorban áll, nem csúszik
  // egymásra: a korong közepén egy oszlopban ülnek, köztük valódi rés van.
  const numberBox = (await stage.locator('.gq-timer-number').boundingBox())!
  const unitBox = (await stage.locator('.gq-timer-unit').boundingBox())!
  expect(unitBox.y).toBeGreaterThanOrEqual(numberBox.y + numberBox.height)
  // Válasz előtt semmi nem árulja el a helyes választ.
  await expect(stage.locator('.gq-answer[data-state="correct"]')).toHaveCount(0)

  await stage.getByRole('button', { name: 'Show the answer' }).click()
  const right = stage.locator('.gq-answer[data-state="correct"]')
  await expect(right).toHaveCount(1)
  await expect(right).toHaveAttribute('aria-label', /^[A-D]: Carbon dioxide$/)
  await expect(stage.locator('.gq-answer[data-state="faded"]')).toHaveCount(2)
  // Kivetítésnél nincs kit rangsorolni: nincs köreredmény-lépés, a gomb a
  // következő kérdésre visz.
  await expect(stage.getByRole('button', { name: 'Show the round results' })).toHaveCount(0)
  await expect(stage.getByRole('button', { name: 'Next question' })).toBeVisible()

  await stage.getByRole('button', { name: 'Next question' }).click()
  await expect(stage.getByText('Question 2 of 2')).toBeVisible()
  await stage.getByRole('button', { name: 'Show the answer' }).click()
  await stage.getByRole('button', { name: 'Finish' }).click()
  await expect(stage.getByText('That is every question!')).toBeVisible()

  await stage.getByRole('button', { name: 'Back to the quiz game' }).click()
  await expect(page.getByRole('heading', { name: 'Quiz game' })).toBeVisible()
})

test('a bajnok színpad végigviszi a menetet: osztály tippje, bajnok válasza, felfedés', async ({ page }) => {
  await seedBank(page, {
    name: 'Champion bank',
    questions: [THREE('b1', 'Which gas do plants take in?'), THREE('b2', 'Which gas do plants give off?')],
  })
  await openGame(page, 'Champion')

  const stage = page.getByRole('dialog', { name: 'Champion' })
  await expect(stage).toBeVisible()
  await expect(stage.getByText('Who takes on the class?')).toBeVisible()
  await stage.getByPlaceholder('Name…').fill('Bence')
  await stage.getByRole('button', { name: 'Start', exact: true }).click()

  // A kérdés először az osztályé: a bajnok nem láthatja.
  await expect(stage.getByText('Question 1 of 2')).toBeVisible()
  await stage.getByRole('button', { name: 'Open the question' }).click()
  await expect(stage.getByText('The Champion looks away — the class reads the question!')).toBeVisible()
  await stage.getByRole('button', { name: 'The class sees it' }).click()

  // Az osztály tippje: a tanár a többség válaszát koppintja.
  await expect(stage.getByText('Which answer did most of the class give?')).toBeVisible()
  // Eszköz nélkül a tanár koppintása maga a többség: nincs külön zárás.
  await stage.getByRole('button', { name: /^[A-D]: Carbon dioxide$/ }).click()
  await expect(stage.getByText('The class has answered')).toBeVisible()
  await stage.getByRole('button', { name: 'The Champion answers' }).click()

  // A bajnok válasza és a felfedés.
  await expect(stage.getByText('Which answer did the Champion give?')).toBeVisible()
  await stage.getByRole('button', { name: /^[A-D]: Carbon dioxide$/ }).click()
  await stage.getByRole('button', { name: 'Show the answer' }).click()
  await expect(stage.getByText('Bence got it right!')).toBeVisible()
  await expect(stage.getByText(/to the pot/)).toBeVisible()
  await stage.getByRole('button', { name: /Close the round|Next round|Next question/ }).click()
  // A következő kérdés ugyanazzal a bajnokkal jön, megint az osztály felé fordulva.
  await expect(stage.getByText('The Champion looks away — the class reads the question!')).toBeVisible()
  await stage.getByRole('button', { name: 'The class sees it' }).click()
  await expect(stage.getByText('Which gas do plants give off?')).toBeVisible()
})

test('a veszély! táblája mezőt nyit, és a kör végigvihető', async ({ page }) => {
  await seedBank(page, {
    name: 'Peril bank',
    questions: Array.from({ length: 6 }, (_, index) =>
      THREE(`p${index + 1}`, `Peril question ${index + 1}?`),
    ),
  })
  await openGame(page, 'Peril!')

  const stage = page.getByRole('dialog', { name: 'Peril!' })
  // A táblaépítőben az azonos sorban álló mezők egy magasságban ülnek, és a kártyák
  // szélessége nem lóg ki az oszlopból (nem csúsznak egymásra a kártyák).
  const builderSlots = await stage.locator('.gq-builder-slot').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      const col = node.closest('.gq-builder-column')?.getBoundingClientRect()
      return { top: Math.round(rect.top), colWidth: col?.width ?? 0, slotWidth: rect.width }
    }),
  )
  expect(builderSlots.length).toBeGreaterThan(0)
  for (const slot of builderSlots) {
    expect(slot.slotWidth).toBeLessThanOrEqual(slot.colWidth + 1)
  }
  await expect(stage).toBeVisible()
  // Két csapat, nevesítve — enélkül a tábla nem indul.
  await stage.getByLabel('Team 1').fill('Rókák')
  await stage.getByLabel('Team 2').fill('Baglyok')
  await stage.getByRole('button', { name: 'Open the board' }).click()
  await expect(stage.getByText('Board 1')).toBeVisible()

  const tiles = stage.locator('.gq-tile')
  // Hat kérdés: a két oszlop közül a második csak egy mezőt kap.
  await expect(tiles).toHaveCount(6)
  // A legkisebb tétű mező: ott a fogadás ritkább, de ha mégis jön, kezeljük.
  const values = (await tiles.allTextContents()).map((text) => Number(text.trim()))
  const smallest = Math.min(...values)
  await tiles.nth(values.indexOf(smallest)).click()
  if (await stage.getByText('Big stake!').isVisible()) {
    await stage.getByLabel('Big stake!').fill('100')
    await stage.getByRole('button', { name: 'Lock the wager' }).click()
  }
  await expect(stage.getByText(new RegExp(`${smallest}-point tile — read the question aloud!`))).toBeVisible()
  await stage.getByRole('button', { name: 'Arm the buzzers' }).click()
  await expect(stage.getByText('Which team buzzed first?')).toBeVisible()

  await stage.getByRole('button', { name: 'Rókák' }).click()
  await expect(stage.getByRole('button', { name: /^[A-D]: Carbon dioxide$/ })).toBeVisible()
  await stage.getByRole('button', { name: /^[A-D]: Carbon dioxide$/ }).click()
  await expect(stage.getByText(/Rókák: \d+/)).toBeVisible()
  await stage.getByRole('button', { name: 'Next question' }).click()
  await expect(stage.getByText('Board 1')).toBeVisible()
  await expect(stage.locator('.gq-tile[data-played="true"]')).toHaveCount(1)
})

test('a válaszok sorrendje kevert, és a tanár visszaadhatja a bank sorrendjét', async ({ page }) => {
  await seedBank(page, {
    name: 'Answer order bank',
    questions: [THREE('k1', 'Which gas do plants take in?')],
  })
  await go(page, '/jatek')
  await expect(page.getByText('1 of 1 questions can be played.')).toBeVisible()

  /** A színpadon álló válaszok szövege, a betűjel nélkül. */
  const answers = (stage: ReturnType<Page['getByRole']>) =>
    stage.locator('.gq-answer').evaluateAll((nodes) =>
      nodes.map((node) => (node.getAttribute('aria-label') ?? '').replace(/^[A-D]: /, '')),
    )

  // Alapból kevert: a kártyák sorrendje nem a banké.
  await expect(page.getByLabel('Shuffle the answers')).toBeChecked()
  await openGame(page, 'Classic')
  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  const shuffled = await answers(stage)
  expect([...shuffled].sort()).toEqual(['Carbon dioxide', 'Helium', 'Oxygen'])
  expect(shuffled).not.toEqual(['Oxygen', 'Carbon dioxide', 'Helium'])
  // A felfedés a helyes választ a kevert helyén jelöli.
  await stage.getByRole('button', { name: 'Show the answer' }).click()
  await expect(stage.locator('.gq-answer[data-state="correct"]')).toHaveText(/Carbon dioxide/)
  await stage.getByRole('button', { name: 'Finish' }).click()
  await stage.getByRole('button', { name: 'Back to the quiz game' }).click()
  await expect(page.getByRole('heading', { name: 'Quiz game' })).toBeVisible()

  // Kikapcsolva a bank saját sorrendje áll a színpadon.
  await page.getByLabel('Shuffle the answers').uncheck()
  await expect(page.getByLabel('Shuffle the answers')).not.toBeChecked()
  // Ugyanezen a lapon indul a második játék: egy újratöltés visszaállítaná a
  // jelölőt az alapértelmezettre, és nem azt mérnénk, amit kértünk.
  await page.getByRole('button', { name: /^Classic/ }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const kept = page.getByRole('dialog', { name: 'Quiz game' })
  expect(await answers(kept)).toEqual(['Oxygen', 'Carbon dioxide', 'Helium'])
  await expect(kept.locator('.gq-answer').first()).toHaveAttribute('aria-label', 'A: Oxygen')
})

test('a színpad fókuszcsapdája: a Tab nem visz ki a párbeszédből', async ({ page }) => {
  await seedBank(page, {
    name: 'Focus bank',
    questions: [THREE('f1', 'Which gas do plants take in?'), THREE('f2', 'Which gas do plants give off?')],
  })
  await openGame(page, 'Classic')
  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  await expect(stage).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.gq-stage'))))
    .toBe(true)

  // Negyven Tab: a fókusz végig a színpadon marad (a színpad kevesebb fogható
  // elemet tartalmaz, tehát többször körbeér).
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('.gq-stage')))
    expect(inside).toBe(true)
  }
})


test('a színpadon a háttérzene vezérlője elérhető és kezeli a némítást valamint a hangerőt', async ({ page }) => {
  await seedBank(page, {
    name: 'Music bank',
    questions: [THREE('m1', 'What is ambient music?')],
  })
  await openGame(page, 'Classic')
  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  await expect(stage).toBeVisible()

  const ambient = stage.locator('.gq-ambient-control')
  await expect(ambient).toBeVisible()

  // Alapból néma (20%)
  const btn = ambient.locator('.gq-ambient-btn')
  await expect(btn).toContainText('🔇')
  await expect(ambient.locator('.gq-ambient-val')).toContainText('20%')

  // Gombnyomásra elindul / némítás megszűnik
  await btn.click()
  // Mentés a localStorage-ba
  const saved = await page.evaluate(() => window.localStorage.getItem('tesztpapagaj:game-ambient'))
  expect(saved).toBeTruthy()
  expect(JSON.parse(saved!).playing).toBe(true)
  expect(JSON.parse(saved!).volume).toBe(0.2)
})
