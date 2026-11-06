import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// Mérési segéd a differenciált kvízhez: két diák két oldalon, kép a színpadról,
// és mérés arra, hogy a válaszok színesek-e, illetve a betűméret-állító a
// fejlécben van-e. Nem része a készletnek (nincs a `test:e2e:fast` listában).

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

async function seedBanks(page: Page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/about').catch(() => undefined)
    try {
      await page.evaluate(async (banksToMake) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const existing = new Set((await banks.recent()).map((one) => one.name))
        for (const one of banksToMake) {
          if (existing.has(one.name)) continue
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name: one.name })
          await banks.commit(bank.id, { kind: 'create-questions', questions: one.questions as never })
        }
      }, [
        { name: 'Probe A', questions: [choice('pa1', 'Első A kérdés'), choice('pa2', 'Második A kérdés')] },
        { name: 'Probe B', questions: [choice('pb1', 'Első B kérdés'), choice('pb2', 'Második B kérdés')] },
      ])
      return
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bankok vetése nem sikerült')
}

// Mérési segéd: a teljes készletben kimarad, csak `PROBE=1` mellett fut.
test.skip(!process.env.PROBE, 'mérési segéd — PROBE=1 nélkül kimarad')

test('a differenciált színpad képe és színei', async ({ page, browser }) => {
  test.setTimeout(150_000)
  await seedBanks(page)
  await go(page, '/jatek')
  await page.getByRole('button', { name: /^Split quiz/ }).click()

  const pick = async (selector: string, name: string) => {
    const value = await page
      .locator(`${selector} option`)
      .evaluateAll(
        (nodes, wanted) =>
          (nodes.find((node) => (node.textContent ?? '').includes(wanted)) as HTMLOptionElement)?.value ?? '',
        name,
      )
    expect(value).not.toBe('')
    await page.locator(selector).selectOption(value)
  }
  await pick('#gq-bank', 'Probe A')
  await pick('#gq-bank-b', 'Probe B')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')
  await expect(lobby.locator('.gq-qr-button')).toBeVisible({ timeout: 15000 })

  const join = async (side: 'Side A' | 'Side B', nickname: string) => {
    const context = await browser.newContext()
    const phone = await context.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    await phone.goto(new URL(`/jatek?kod=${code}&oldal=1`, page.url()).toString())
    await expect(phone.locator('.gq-stu-side')).toHaveCount(2)
    await phone.locator('.gq-stu-side').filter({ hasText: side }).click()
    await phone.getByPlaceholder('For example: Panni').fill(nickname)
    await phone.getByRole('button', { name: 'Join the game' }).click()
    await expect(phone.locator('.gq-stu-sides')).toHaveCount(0, { timeout: 20000 })
    return phone
  }
  const anna = await join('Side A', 'Anna')
  const bence = await join('Side B', 'Bence')
  await expect(lobby.getByText('2 joined')).toBeVisible()

  await lobby.getByRole('button', { name: 'Start the game' }).click()
  const stage = page.locator('.gq-split')
  await expect(stage).toBeVisible()
  await expect(stage.locator('.gq-split-prompt').first()).toHaveText('Első A kérdés')

  await page.waitForTimeout(600)
  const measured = await page.evaluate(() => {
    const answers = Array.from(document.querySelectorAll('.gq-split-answer'))
    const colors = answers.map((node) => getComputedStyle(node).backgroundColor)
    const control = document.querySelector('.gq-split .gq-textsize-stage')?.getBoundingClientRect()
    const bar = document.querySelector('.gq-split .gq-stage-bar')?.getBoundingClientRect()
    return {
      count: answers.length,
      distinct: new Set(colors).size,
      colors: colors.slice(0, 4),
      control: control ? `${Math.round(control.x)},${Math.round(control.y)}` : 'nincs',
      inBar: Boolean(control && bar && control.top >= bar.top - 2 && control.bottom <= bar.bottom + 2),
      barBottom: bar ? Math.round(bar.bottom) : 0,
    }
  })
  console.log(
    `válaszok: ${measured.count} db, szín: ${measured.distinct} féle (${measured.colors.join(' | ')})`,
  )
  console.log(`betűméret-állító: ${measured.control}, a fejlécben: ${measured.inBar ? 'igen' : 'nem'}`)

  await page.screenshot({ path: 'split-stage.png' })
  await anna.close()
  await bence.close()
})
