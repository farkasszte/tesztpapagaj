import { expect, test } from '@playwright/test'
import { go } from './navigate'

/**
 * Mérés és őr: mit játszik a differenciált kvíz a kettéosztott táblán.
 *
 * A panel a bank saját szövegét rajzolja (DocView: kép, matek, táblázat), és
 * ezeket a típusokat viszi be: feleletválasztós, igaz/hamis, több helyes válasz,
 * **sorrendezés** és **párosítás**. A kiegészítés és a rövid válasz kimarad
 * (gépelés). Ezt a szerződést méri: hány kör lesz, elfér-e a panel, hány kártyát
 * jelöl a felfedés, számozódik-e a sorrend, és látszanak-e a párok.
 */

const choice = (said: string, correct = false) => ({
  type: 'multipleChoiceChoice',
  attrs: { correct, id: said },
  content: [{ type: 'paragraph', content: [{ type: 'text', text: said }] }],
})
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Hat típus egy bankban: ebből ma kettő játszható a kettéosztott táblán. */
const QUESTIONS = [
  {
    type: 'multiple-choice',
    doc: [
      paragraph('Melyik gáz kell a növényeknek?'),
      // Táblázat a kérdésben: a panel a bank saját szövegét rajzolja, tehát
      // ennek is meg kell jelennie (nem sima szöveg).
      {
        type: 'table',
        content: [{
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [paragraph('növény')] },
            { type: 'table_cell', content: [paragraph('gáz')] },
          ],
        }],
      },
      {
        type: 'multipleChoice',
        content: [choice('Szén-dioxid'), choice('Oxigén', true), choice('Hélium')],
      },
    ],
  },
  {
    type: 'true-false',
    doc: [paragraph('A fotoszintézis fényt igényel.'), {
      type: 'multipleChoice',
      content: [choice('Igaz', true), choice('Hamis')],
    }],
  },
  {
    type: 'multiple-answer',
    doc: [paragraph('Melyek növények?'), {
      type: 'multipleChoice',
      content: [choice('Tölgy', true), choice('Kő'), choice('Hárs', true)],
    }],
  },
  {
    type: 'ordering',
    doc: [paragraph('Tedd időrendbe!'), {
      type: 'multipleChoice',
      content: [choice('Első'), choice('Második'), choice('Harmadik')],
    }],
  },
  {
    type: 'matching',
    doc: [paragraph('Párosítsd a fogalmakat!'), {
      type: 'matching',
      content: [
        { type: 'matchingPrompt', attrs: { id: 'p1', answer: 'a1' }, content: [paragraph('Fotoszintézis')] },
        { type: 'matchingPrompt', attrs: { id: 'p2', answer: 'a2' }, content: [paragraph('Légzés')] },
        { type: 'matchingAnswer', attrs: { id: 'a1' }, content: [paragraph('Cukrot termel')] },
        { type: 'matchingAnswer', attrs: { id: 'a2' }, content: [paragraph('Oxigént használ')] },
      ],
    }],
  },
  {
    type: 'fill-in-the-blank',
    doc: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'A növények a ' },
        { type: 'blank', content: [{ type: 'text', text: 'szén-dioxidot' }] },
        { type: 'text', text: ' veszik fel.' },
      ],
    }],
  },
] as const

async function seed(page: import('@playwright/test').Page): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    try {
      await page.evaluate(async ({ suffix, questions }) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        for (const name of ['Split A', 'Split B']) {
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name })
          await banks.commit(bank.id, {
            kind: 'create-questions',
            questions: questions.map((item, index) => ({
              id: `${name}-${suffix}-${index}`,
              type: item.type,
              columns: 1,
              doc: { type: 'doc', content: item.doc },
            })),
          } as never)
        }
      }, { suffix: tag, questions: QUESTIONS as unknown as { type: string; doc: unknown[] }[] })
      return
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bankok vetése nem sikerült')
}

test('a kettéosztott tábla a válaszkártyás kérdéseket viszi be, a szöveget DocView-val rajzolja', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seed(page)
  await go(page, '/jatek')
  await page.getByRole('button', { name: /^Split quiz/ }).click()

  const pick = async (selector: string, name: string) => {
    const value = await page.locator(`${selector} option`).evaluateAll((nodes, wanted) => {
      const hit = nodes.find((node) => (node.textContent ?? '').includes(wanted))
      return (hit as HTMLOptionElement | undefined)?.value ?? ''
    }, name)
    expect(value).not.toBe('')
    await page.locator(selector).selectOption(value)
  }
  await pick('#gq-bank', 'Split A')
  await pick('#gq-bank-b', 'Split B')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // Két diák kell a kör indításához (élő relay).
  const code = (await page.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')
  for (const [index, name] of ['Anna', 'Bence'].entries()) {
    const context = await browser.newContext()
    await context.addInitScript(() => window.localStorage.setItem('tesztpapagaj:language', 'en'))
    const phone = await context.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    await phone.goto(new URL(`/jatek?kod=${code}&oldal=1`, page.url()).toString())
    const sides = phone.locator('.gq-stu-side')
    await expect(sides).toHaveCount(2)
    await (index === 0 ? sides.first() : sides.nth(1)).click()
    await phone.getByPlaceholder('For example: Panni').fill(name)
    await phone.getByRole('button', { name: 'Join the game' }).click()
    await expect(phone.locator('.gq-stu-sides')).toHaveCount(0, { timeout: 20_000 })
  }
  await expect(page.locator('.gq-lobby').getByText('2 joined')).toBeVisible({ timeout: 20_000 })
  await page.locator('.gq-lobby').getByRole('button', { name: 'Start the game' }).click()

  const stage = page.locator('.gq-split')
  await expect(stage).toBeVisible()
  const panel = page.locator('.gq-split-panel[data-side="a"]')

  // Vegyes bankból **öt** kör lesz; csak a kiegészítés marad ki.
  const header = await panel.innerText()
  const rounds = Number(/Round 1 of (\d+)/.exec(header)?.[1] ?? '0')
  expect(rounds).toBe(5)

  // A táblázat a panelen: a DocView rajzolja, nem sima szöveg.
  await expect(panel.locator('.gq-split-prompt .doc-content table')).toHaveCount(1)

  if (process.env.PROBE_SHOT) await page.screenshot({ path: 'split-table.png' })

  const measured: {
    answers: number
    overflow: boolean
    marked: number
    ordered?: boolean
    numbers?: string[]
    pairs?: string[]
  }[] = []

  for (let round = 0; round < rounds; round += 1) {
    const before = await panel.evaluate((node) => ({
      answers: node.querySelectorAll('.gq-split-answer').length,
      overflow: node.scrollHeight > node.clientHeight + 1,
      ordered: Boolean(node.querySelector('.gq-split-answer[data-ordered="true"]')),
      pairs: [...node.querySelectorAll('.gq-split-pair')].map((one) => one.textContent?.trim() ?? ''),
    }))
    await stage.getByRole('button', { name: 'Show the answer' }).click()
    const marked = await panel.locator('.gq-split-answer[data-right="true"]').count()
    // Sorrendnél a felfedés után a sorszámok 1..n sorrendben állnak.
    const numbers = await panel.evaluate((node) =>
      [...node.querySelectorAll('.gq-split-answer[data-ordered="true"] .gq-split-letter')].map(
        (one) => one.textContent ?? '',
      ),
    )
    const pairs = await panel.evaluate((node) =>
      [...node.querySelectorAll('.gq-split-pair')].map((one) => one.textContent?.trim() ?? ''),
    )
    measured.push({ ...before, marked, ...(numbers.length ? { numbers } : {}), ...(pairs.length ? { pairs } : {}) })
    if (process.env.PROBE_SHOT && round === 4) await page.screenshot({ path: 'split-matching.png' })
    if (round < rounds - 1) await stage.getByRole('button', { name: 'Next round' }).click()
  }

  // Elfér: a panel tartalma nem lóg túl a kereten (1920×1080).
  expect(measured.every((one) => one.overflow === false)).toBe(true)
  // Feleletválasztós (3), igaz/hamis (2), több helyes (3), sorrendezés (3),
  // párosítás (2 kártya + 2 fogalom).
  expect(measured.map((one) => one.answers)).toEqual([3, 2, 3, 3, 2])
  // A több helyes válasznál kettő jelölés, a többinél egy (a párosításnál a
  // jelölés a párokon van, nem a kártyákon).
  expect(measured.slice(0, 4).map((one) => one.marked)).toEqual([1, 1, 2, 0])
  // Sorrendezés: felfedéskor a sorszámok 1..3.
  expect(measured[3].numbers).toEqual(['1', '2', '3'])
  expect(measured[3].ordered).toBe(true)
  // Párosítás: felfedéskor a két pár a helyes válasszal.
  expect(measured[4].pairs?.[0]).toContain('Fotoszintézis')
  expect(measured[4].pairs?.[0]).toContain('Cukrot termel')
  expect(measured[4].pairs?.[1]).toContain('Légzés')
  expect(measured[4].pairs?.[1]).toContain('Oxigént használ')
})
