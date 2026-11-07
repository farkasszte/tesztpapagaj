import { expect, test } from '@playwright/test'
import { go } from './navigate'

/**
 * Mérés és őr: mit játszik a differenciált kvíz a kettéosztott táblán.
 *
 * A két panel egyszerű szöveget rajzol (kérdés + válaszok), ezért a mód ma
 * **csak az egyszeres választású** kérdéseket viszi be (feleletválasztós,
 * igaz/hamis). Ez a teszt ezt a szerződést méri: vegyes bankból hány kör lesz,
 * elfér-e a panel, és a felfedés egy kártyát jelöl-e.
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
    doc: [paragraph('Melyik gáz kell a növényeknek?'), {
      type: 'multipleChoice',
      content: [choice('Szén-dioxid'), choice('Oxigén', true), choice('Hélium')],
    }],
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

test('a kettéosztott tábla csak az egyszeres választást viszi be, és a panel elfér', async ({
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

  // Vegyes bankból **két** kör lesz: a feleletválasztós és az igaz/hamis.
  const header = await panel.innerText()
  const rounds = Number(/Round 1 of (\d+)/.exec(header)?.[1] ?? '0')
  expect(rounds).toBe(2)

  const measured: { answers: number; overflow: boolean; marked: number }[] = []
  for (let round = 0; round < rounds; round += 1) {
    const before = await panel.evaluate((node) => ({
      answers: node.querySelectorAll('.gq-split-answer').length,
      overflow: node.scrollHeight > node.clientHeight + 1,
    }))
    await stage.getByRole('button', { name: 'Show the answer' }).click()
    const marked = await panel.locator('.gq-split-answer[data-right="true"]').count()
    measured.push({ ...before, marked })
    if (round < rounds - 1) await stage.getByRole('button', { name: 'Next round' }).click()
  }

  // Elfér: a panel tartalma nem lóg túl a kereten (1920×1080).
  expect(measured.every((one) => one.overflow === false)).toBe(true)
  // Egyszeres választás: 3 és 2 kártya, felfedéskor pontosan egy jelölés.
  expect(measured.map((one) => one.answers)).toEqual([3, 2])
  expect(measured.map((one) => one.marked)).toEqual([1, 1])
})
