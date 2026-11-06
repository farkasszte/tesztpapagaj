import { expect, test, type Page } from '@playwright/test'

// Mérési segéd: a Grand Prix ovál pályájának képe három futóval, hogy a
// takarás és a méretek szemmel is ellenőrizhetők legyenek. Nem része a
// készletnek (nincs a `test:e2e:fast` listában).

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }

const choice = (id: string, stem: string, choices: { text: string; correct: boolean }[]) => ({
  id,
  type: 'multiple-choice' as const,
  columns: 2 as const,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: stem }] },
      {
        type: 'multipleChoice',
        content: choices.map((entry, index) => ({
          type: 'multipleChoiceChoice',
          attrs: { id: `${id}-${index}`, correct: entry.correct },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: entry.text }] }],
        })),
      },
    ],
  },
})

const QUESTIONS = [
  choice('o1', 'Which gas do plants take in?', [
    { text: 'Oxygen', correct: false },
    { text: 'Carbon dioxide', correct: true },
    { text: 'Helium', correct: false },
  ]),
  choice('o2', 'What is the closest star to Earth?', [
    { text: 'Sirius', correct: false },
    { text: 'The Sun', correct: true },
    { text: 'Polaris', correct: false },
  ]),
  choice('o3', 'Which element has the symbol H?', [
    { text: 'Helium', correct: false },
    { text: 'Hydrogen', correct: true },
    { text: 'Hafnium', correct: false },
  ]),
]

async function seedBank(page: Page) {
  await page.goto('/about')
  await page.evaluate(async (questions) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Oval meres' })
    await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
  }, QUESTIONS)
}

// Mérési segéd: a teljes készletben kimarad, csak `PROBE=1` mellett fut.
test.skip(!process.env.PROBE, 'mérési segéd — PROBE=1 nélkül kimarad')

test('a pálya képe három futóval', async ({ page, browser }) => {
  test.setTimeout(150_000)
  await seedBank(page)

  await page.goto('/jatek')
  await page.getByRole('button', { name: /^Grand Prix/ }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  const phones = []
  for (const name of ['Anna', 'Bence', 'Csilla']) {
    const context = await browser.newContext()
    await context.addInitScript((entry) => {
      window.localStorage.setItem(entry.name, entry.value)
    }, ENGLISH)
    const phone = await context.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    await phone.goto(new URL(`/diak?kod=${code}`, page.url()).toString())
    await phone.getByPlaceholder('For example: Panni').fill(name)
    await phone.getByRole('button', { name: 'Join the game' }).click()
    await expect(phone.getByText('You are in.')).toBeVisible({ timeout: 15000 })
    phones.push(phone)
  }
  await expect(lobby).toContainText('3 joined')

  await lobby.getByRole('button', { name: 'Start the game' }).click()
  const stage = page.getByRole('dialog', { name: 'Grand Prix' })
  await expect(stage).toBeVisible()

  // Különböző sebesség: Anna gyors, Bence lassabb, Csilla rosszat válaszol.
  await phones[0]!.locator('.gq-stu-choice').filter({ hasText: 'Carbon dioxide' }).click()
  await page.waitForTimeout(300)
  await phones[1]!.locator('.gq-stu-choice').filter({ hasText: 'Carbon dioxide' }).click()
  await page.waitForTimeout(500)
  await phones[2]!.locator('.gq-stu-choice').filter({ hasText: 'Oxygen' }).click()
  await page.waitForTimeout(700)

  await page.waitForTimeout(1200)

  // A szövegméret-állító: hol van, és hat-e a válaszokra?
  const before = await page.evaluate(() => {
    const control = document.querySelector('.gq-textsize-stage')?.getBoundingClientRect()
    const answer = document.querySelector('.gq-answer .doc-content')
    return {
      control: control ? `${Math.round(control.x)},${Math.round(control.y)}` : 'nincs',
      atBottom: control ? control.y > window.innerHeight * 0.75 : false,
      answer: answer ? Number.parseFloat(getComputedStyle(answer).fontSize) : 0,
    }
  })
  await page.locator('.gq-textsize-stage .gq-textsize-button').last().click()
  await page.locator('.gq-textsize-stage .gq-textsize-button').last().click()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const answer = document.querySelector('.gq-answer .doc-content')
    return answer ? Number.parseFloat(getComputedStyle(answer).fontSize) : 0
  })
  console.log(`szövegméret-állító: ${before.control} (alul: ${before.atBottom ? 'igen' : 'nem'}), válasz betű ${before.answer} → ${after}`)

  // Vissza 100%-ra a képhez.
  await page.locator('.gq-textsize-stage .gq-textsize-button').first().click()
  await page.locator('.gq-textsize-stage .gq-textsize-button').first().click()
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'race-oval.png' })

  // Mérés: a jelvények nem csúszhatnak egymásra; a pálya nem túl magas.
  const boxes = await stage.locator('.gq-runner').evaluateAll((nodes) =>
    nodes.map((node) => {
      const dot = node.querySelector('.gq-runner-dot')!.getBoundingClientRect()
      const name = node.querySelector('.gq-runner-name')
      const label = name ? name.getBoundingClientRect() : dot
      return {
        name: (node.textContent ?? '').trim() || '?',
        count: node.getAttribute('data-count'),
        dot: { x: dot.x, y: dot.y, w: dot.width, h: dot.height },
        label: { x: label.x, y: label.y, w: label.width, h: label.height },
      }
    }),
  )
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const problems: string[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i]!.dot, boxes[j]!.dot)) problems.push(`jelvény ütközik: ${boxes[i]!.name} / ${boxes[j]!.name}`)
      if (overlaps(boxes[i]!.label, boxes[j]!.label)) problems.push(`név ütközik: ${boxes[i]!.name} / ${boxes[j]!.name}`)
    }
  }
  for (const box of boxes) {
    console.log(
      `jelvény ${box.name}${box.count ? ` (${box.count})` : ''}: ${Math.round(box.dot.x)},${Math.round(box.dot.y)}`,
    )
  }
  const sizes = await page.evaluate(() => {
    const oval = document.querySelector('.gq-oval')!.getBoundingClientRect()
    const dialog = document.querySelector('.gq-stage, [role=dialog]')!.getBoundingClientRect()
    return { oval: Math.round(oval.height), dialog: Math.round(dialog.height), ovalWidth: Math.round(oval.width) }
  })
  console.log(`pálya ${sizes.ovalWidth}x${sizes.oval} a színpad ${sizes.dialog} magas (${Math.round((sizes.oval / sizes.dialog) * 100)}%)`)
  console.log('ütközés:', problems.length === 0 ? 'nincs' : problems.join('; '))

  // A lebegő szövegméret-pirula ne takarjon semmit a színpadon.
  const cover = await page.evaluate(() => {
    const pill = document.querySelector('[class*=text-size], .gq-text-size, [data-testid=text-size]')
    const targets = Array.from(document.querySelectorAll('.gq-laptimes, .gq-oval, .gq-prompt'))
    if (!pill) return { pill: null, hits: [] as string[] }
    const box = pill.getBoundingClientRect()
    const hits = targets
      .map((node) => ({
        cls: (node.getAttribute('class') ?? '').split(' ')[0] ?? '',
        overlap:
          box.left < node.getBoundingClientRect().right &&
          node.getBoundingClientRect().left < box.left + box.width &&
          box.top < node.getBoundingClientRect().bottom &&
          node.getBoundingClientRect().top < box.top + box.height,
      }))
      .filter((entry) => entry.overlap)
      .map((entry) => entry.cls)
    return { pill: `${Math.round(box.width)}x${Math.round(box.height)} @${Math.round(box.x)},${Math.round(box.y)}`, hits }
  })
  console.log('pirula:', cover.pill, 'takar:', cover.hits.length ? cover.hits.join(', ') : 'semmit')
  for (const phone of phones) await phone.close()
})
