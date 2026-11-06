import { expect, test, type Page } from '@playwright/test'

// A legördülő menük kontrasztja: a zárt mező szövege a saját hátterén legalább
// 4,5:1 (WCAG AA normál szövegre), és a vásznon a mező **átlátszatlan**, mert a
// nyitott lista színeit a böngésző a mező színeiből veszi — áttetsző alapon a
// krémes felirat olvashatatlan listát ad.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

const MEASURE = `(() => {
  const parse = (value) => {
    const match = value.match(/[\\d.]+/g)
    if (!match) return [0, 0, 0, 1]
    const [r, g, b, a] = match.map(Number)
    return [r, g, b, a === undefined ? 1 : a]
  }
  const lum = ([r, g, b]) => {
    const channel = (value) => {
      const v = value / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  return [...document.querySelectorAll('select')]
    .filter((node) => node.offsetParent !== null)
    .map((node) => {
      const style = getComputedStyle(node)
      const color = parse(style.color)
      const background = parse(style.backgroundColor)
      const first = lum(color)
      const second = lum(background)
      const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      return {
        where: node.className || node.id || 'select',
        ratio: Math.round(ratio * 100) / 100,
        alpha: background[3],
        color: style.color,
        background: style.backgroundColor,
      }
    })
})()`

type Measured = { where: string; ratio: number; alpha: number; color: string; background: string }

async function seedBank(page: Page): Promise<string> {
  await page.goto('/about')
  return page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Kontraszt bank' })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [
        {
          id: 'c1',
          type: 'multiple-choice',
          columns: 2,
          doc: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Kontraszt kérdés' }] },
              {
                type: 'multipleChoice',
                content: ['Egy', 'Kettő'].map((text, index) => ({
                  type: 'multipleChoiceChoice',
                  attrs: { id: `c1-${index}`, correct: index === 0 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                })),
              },
            ],
          },
        },
      ],
    } as never)
    return bank.id
  })
}

function assertReadable(items: Measured[], screen: string): void {
  expect(items.length, `${screen}: nincs mérhető legördülő`).toBeGreaterThan(0)
  for (const item of items) {
    expect(item.ratio, `${screen} / ${item.where}: ${item.color} a ${item.background} alapon`).toBeGreaterThanOrEqual(4.5)
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('a legördülő menük olvashatók minden képernyőn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const bankId = await seedBank(page)

  // A bank listája: a rendezés legördülője (világos papíron).
  await page.goto(`/question-bank?id=${bankId}`)
  const sort = page.locator('.bank-sort select')
  await expect(sort).toBeVisible()
  assertReadable(await page.evaluate(MEASURE), 'bank')

  // A játék beállításai: a bankválasztó (világos papíron).
  await page.goto('/jatek')
  await expect(page.locator('.gq-setup')).toBeVisible()
  assertReadable(await page.evaluate(MEASURE), 'jatek')

  // A vásznon a tanulókártya üteme: **átlátszatlan** mező, mert a nyitott lista
  // a mező színeit örökli — a korábbi áttetsző változat 1,13:1 volt.
  await page.getByRole('button', { name: /^Tanulókártya/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const deck = page.getByRole('dialog', { name: 'Tanulókártya' })
  await expect(deck).toBeVisible()
  const cardSpeed = await page.evaluate(MEASURE)
  assertReadable(cardSpeed, 'kartya')
  for (const item of cardSpeed) expect(item.alpha, `kartya / ${item.where}: áttetsző háttér`).toBe(1)
  await deck.getByRole('button', { name: 'Játék vége' }).click()

  // A Veszély! csapatszáma ugyanilyen mező a vásznon.
  await page.getByRole('button', { name: /^Veszély/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const peril = page.getByRole('dialog', { name: 'Veszély!' })
  await expect(peril).toBeVisible()
  const teamCount = await page.evaluate(MEASURE)
  assertReadable(teamCount, 'veszely')
  for (const item of teamCount) expect(item.alpha, `veszely / ${item.where}: áttetsző háttér`).toBe(1)
})
