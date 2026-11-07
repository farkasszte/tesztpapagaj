import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// Mérési segéd a Klasszikus színpadhoz: a felső sáv elemei nem csúszhatnak
// egymásra, és a szövegméret-állító a kérdésre és a válaszokra is kell hasson.

const choice = (id: string, stem: string) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: ['Oxygen', 'Carbon dioxide', 'Helium'].map((text, index) => ({
          type: 'multipleChoiceChoice',
          attrs: { id: `${id}-${index}`, correct: index === 1 },
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      },
    ],
  },
})

async function seedBank(page: Page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    try {
      await page.evaluate(async (questions) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const existing = new Set((await banks.recent()).map((one) => one.name))
        if (existing.has('Classic probe')) return
        const bank = await banks.create()
        await banks.commit(bank.id, { kind: 'rename', name: 'Classic probe' })
        await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
      }, [choice('c1', 'Milyen ideológia jellemzi a legendameséket?')])
      return
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

// Mérési segéd: a teljes készletben kimarad, csak `PROBE=1` mellett fut.
test.skip(!process.env.PROBE, 'mérési segéd — PROBE=1 nélkül kimarad')

test('a klasszikus felső sáv és a szövegméret', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1900, height: 930 })
  await seedBank(page)
  await go(page, '/jatek')
  await page.getByRole('button', { name: /^Classic/ }).click()

  const value = await page
    .locator('#gq-bank option')
    .evaluateAll(
      (nodes) =>
        (nodes.find((node) => (node.textContent ?? '').includes('Classic probe')) as HTMLOptionElement)?.value ?? '',
    )
  await page.locator('#gq-bank').selectOption(value)
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // Kivetítés: nincs szoba, a színpad azonnal jön.
  const stage = page.locator('.gq-stage').first()
  await expect(stage).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(800)

  const bar = await page.evaluate(() => {
    const stageEl = document.querySelector('.gq-stage')
    if (!stageEl) return null
    const barEl = stageEl.querySelector('.gq-stage-bar')
    if (!barEl) return null
    const items = Array.from(barEl.children).map((node) => {
      const box = node.getBoundingClientRect()
      return {
        cls: (node.getAttribute('class') ?? '').split(' ').slice(0, 2).join('.'),
        text: (node.textContent ?? '').trim().slice(0, 24),
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      }
    })
    const barBox = barEl.getBoundingClientRect()
    return { items, bar: { x: Math.round(barBox.x), y: Math.round(barBox.y), w: Math.round(barBox.width), h: Math.round(barBox.height) } }
  })
  const overlaps: string[] = []
  if (bar) {
    for (let i = 0; i < bar.items.length; i += 1) {
      for (let j = i + 1; j < bar.items.length; j += 1) {
        const a = bar.items[i]!
        const b = bar.items[j]!
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          overlaps.push(`${a.cls} (${a.text}) × ${b.cls} (${b.text})`)
        }
      }
    }
  }
  console.log('sáv elemei:', bar?.items.map((one) => `${one.cls}[${one.text}] @${one.x},${one.y} ${one.w}×${one.h}`).join(' | '))
  console.log('sáv-átfedés:', overlaps.length ? overlaps.join('; ') : 'nincs')

  const sizes = await page.evaluate(() => {
    const prompt = document.querySelector('.gq-prompt')
    const answer = document.querySelector('.gq-answer .doc-content') ?? document.querySelector('.gq-answer')
    const control = document.querySelector('.gq-textsize-stage')
    const box = control?.getBoundingClientRect()
    return {
      prompt: prompt ? Number.parseFloat(getComputedStyle(prompt).fontSize) : 0,
      answer: answer ? Number.parseFloat(getComputedStyle(answer).fontSize) : 0,
      control: box ? `${Math.round(box.x)},${Math.round(box.y)}` : 'nincs',
    }
  })
  await page.locator('.gq-textsize-button').last().click()
  await page.locator('.gq-textsize-button').last().click()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const prompt = document.querySelector('.gq-prompt')
    const answer = document.querySelector('.gq-answer .doc-content') ?? document.querySelector('.gq-answer')
    return {
      prompt: prompt ? Number.parseFloat(getComputedStyle(prompt).fontSize) : 0,
      answer: answer ? Number.parseFloat(getComputedStyle(answer).fontSize) : 0,
    }
  })
  console.log(
    `betűméret: kérdés ${sizes.prompt} → ${after.prompt}, válasz ${sizes.answer} → ${after.answer}, állító: ${sizes.control}`,
  )

  await page.locator('.gq-textsize-button').first().click()
  await page.locator('.gq-textsize-button').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'classic-stage.png' })
})
