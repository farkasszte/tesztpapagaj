import { expect, test, type Page } from '@playwright/test'
import { go } from './navigate'

// A bajnok mód magyar felületének jelképei: a nagycím ékezetei nem lógnak a
// felső sorba, az életjelzők piros szívek, a díjalap aranytallér.
// A mérés a valódi Oswald-metrikákon fut (canvas TextMetrics), nem szemre.

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

/** Egy igazi kérdésbank a beépített szolgáltatással, két játszható kérdéssel. */
async function seedBank(page: Page, name: string): Promise<void> {
  await go(page, '/about')
  await page.evaluate(async (bankName) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: bankName })
    const question = (id: string, stem: string) => ({
      id,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: stem }] },
          {
            type: 'multipleChoice',
            content: [
              ['Oxigén', false],
              ['Szén-dioxid', true],
              ['Hélium', false],
            ].map(([text, correct], index) => ({
              type: 'multipleChoiceChoice',
              attrs: { id: `${id}-${index}`, correct },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }],
            })),
          },
        ],
      },
    })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: [question('c1', 'Melyik gáz kell a növényeknek?'), question('c2', 'Melyik gáz keletkezik?')],
    } as never)
  }, name)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

/** A bajnok színpada az első kérdés felnyitása előtt. */
async function openChampion(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1024 })
  await seedBank(page, 'Bajnok bank')
  await go(page, '/jatek')
  await page.getByRole('button', { name: /^Bajnok/ }).click()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()
  const stage = page.getByRole('dialog', { name: 'Bajnok' })
  await stage.waitFor()
  return stage
}

/** A bajnok megnevezése és a menet indítása: innentől van fejlécsáv. */
async function startRound(stage: ReturnType<Page['getByRole']>) {
  await stage.getByPlaceholder('Név…').fill('Panni')
  await stage.getByRole('button', { name: 'Indítás', exact: true }).click()
}

test('a bajnok nagycímének ékezetei nem érnek a felső sorba', async ({ page }) => {
  const stage = await openChampion(page)
  await startRound(stage)
  await stage.getByRole('button', { name: 'Jöhet a kérdés' }).click()

  const heading = stage.locator('.gq-big')
  await expect(heading).toBeVisible()
  await expect(heading).toContainText('bajnok')
  await expect(heading).toContainText('osztály')

  const metrics = await heading.evaluate((node) => {
    const style = getComputedStyle(node)
    const size = parseFloat(style.fontSize)
    const lineHeight = parseFloat(style.lineHeight)
    const range = document.createRange()
    range.selectNodeContents(node)
    const lines = [...range.getClientRects()].filter((rect) => rect.height > 1).length

    // A valódi betűmetrika: az ékezet (Ő) tintája mennyire nyúlik a betűtörzs fölé.
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('nincs 2d kontextus')
    context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
    const accent = context.measureText('Ő')
    const ink = accent.actualBoundingBoxAscent + accent.actualBoundingBoxDescent
    return {
      size,
      lineHeight,
      lines,
      ink: Math.round(ink * 10) / 10,
      room: Math.round((lineHeight - ink) * 10) / 10,
      text: (node.textContent ?? '').trim(),
    }
  })

  // Két sor, és a sorköz több, mint az ékezetes betű tintája: marad látható hézag.
  expect(metrics.lines).toBeGreaterThanOrEqual(2)
  expect(metrics.room).toBeGreaterThan(4)
})

test('az életjelző piros szív, a díjalap aranytallér', async ({ page }) => {
  const stage = await openChampion(page)
  await startRound(stage)

  const hearts = stage.locator('.gq-pip')
  await expect(hearts.first()).toBeVisible()
  expect(await hearts.count()).toBeGreaterThan(0)
  // A szív valódi SVG, nem korong: íves felső része és csúcsa van.
  expect(await hearts.first().evaluate((node) => node.tagName.toLowerCase())).toBe('svg')
  expect(await hearts.first().getAttribute('data-used')).toBe('yes')
  const fill = await stage.locator('.gq-pip path').first().evaluate((node) => getComputedStyle(node).fill)
  expect(fill).toBe('rgb(196, 64, 47)')

  // Az elveszített élet kontúr: az élő szív teli, az elveszett üres.
  const lost = await stage.locator('.gq-pip path').first().evaluate((node) => {
    node.closest('svg')?.setAttribute('data-used', 'no')
    return getComputedStyle(node).fill
  })
  expect(lost).toBe('rgba(0, 0, 0, 0)')

  // A díjalap jelképe aranytallér: peremes érme, világos csillaggal.
  const coin = stage.locator('.gq-coin')
  await expect(coin).toBeVisible()
  const face = await stage.locator('.gq-coin-face').evaluate((node) => getComputedStyle(node).fill)
  expect(face).toBe('rgb(240, 192, 74)')
  const star = await stage.locator('.gq-coin-star').evaluate((node) => getComputedStyle(node).fill)
  expect(star).toBe('rgb(253, 241, 201)')
})
