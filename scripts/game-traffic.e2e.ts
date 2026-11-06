import { expect, test, type Page } from '@playwright/test'
import { Room } from './room-mock'

/**
 * Mérés: mennyi relay-üzenetet küld a tanár egy játék alatt?
 *
 * A Cloudflare ingyenes kerete kérésben számol, a WebSocket-üzenet pedig kérés —
 * ezért a körözés darabszáma pénz (illetve keret) kérdése. A próba a tanár
 * gépének kimenő forgalmát számolja a valódi játékon át, a valódi protokollal.
 */

const ENGLISH = { name: 'tesztpapagaj:language', value: 'en' }

async function seed(page: Page, count: number) {
  await page.goto('/about')
  await page.evaluate(async (total) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Traffic bank' })
    await banks.commit(bank.id, {
      kind: 'create-questions',
      questions: Array.from({ length: total }, (_, index) => ({
        id: `q${index + 1}`,
        type: 'multiple-choice',
        columns: 1,
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: `Question ${index + 1}?` }] },
            {
              type: 'multipleChoice',
              content: [
                { type: 'multipleChoiceChoice', attrs: { id: `q${index + 1}-a`, correct: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'multipleChoiceChoice', attrs: { id: `q${index + 1}-b`, correct: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
                { type: 'multipleChoiceChoice', attrs: { id: `q${index + 1}-c`, correct: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
              ],
            },
          ],
        },
      })),
    } as never)
  }, count)
}

test('a tanár körözéseinek száma egy játék alatt', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.addInitScript((entry) => window.localStorage.setItem(entry.name, entry.value), ENGLISH)
  await seed(page, 2)

  const room = new Room()
  await page.context().routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))

  // A tanár gépének kimenő üzeneteit számoljuk.
  await page.addInitScript(() => {
    const store = { views: 0, total: 0, perQuestion: [] as number[] }
    ;(window as unknown as { __relay: typeof store }).__relay = store
    const original = WebSocket.prototype.send
    WebSocket.prototype.send = function send(this: WebSocket, data: ArrayBuffer | ArrayBufferView | string) {
      try {
        if (typeof data === 'string') {
          const parsed = JSON.parse(data) as { type?: string }
          if (parsed.type === 'view') store.total += 1
          if (parsed.type === 'view' && parsed.kind === undefined) store.views += 1
        }
      } catch {
        // bináris keret: nem számoljuk külön
      }
      return original.call(this, data as never)
    }
  })

  await page.goto('/jatek')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  // Egy diák: a körözés darabszáma diákonként lineáris, a minta ugyanaz.
  const students = []
  const student = await page.context().newPage()
  await student.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  await expect(student.getByText('You are in.')).toBeVisible()
  students.push(student)
  await expect(lobby.getByText('1 joined')).toBeVisible()
  await lobby.getByRole('button', { name: 'Start the game' }).click()

  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  for (let index = 0; index < 2; index += 1) {
    await expect(stage.locator('.gq-answer')).toHaveCount(3)
    for (const student of students) {
      const choices = student.locator('.gq-stu-choice')
      await expect(choices).toHaveCount(3)
      await choices.filter({ hasText: 'B' }).click()
    }
    await expect(stage.locator('.gq-answer[data-state="correct"]')).toHaveCount(1)
    if (index === 0) await stage.getByRole('button', { name: 'Next question' }).click()
  }
  await stage.getByRole('button', { name: 'Finish' }).click()
  await expect(stage.getByText('That is every question!')).toBeVisible()

  const measured = await page.evaluate(() => (window as unknown as { __relay: { views: number; total: number } }).__relay)
  console.log('KÖRÖZÉS:', JSON.stringify(measured))
  // A régi viselkedés 3 válasz × 3 diák = 9 nézet lett volna kérdésenként; most
  // a válasz nem köröz, csak a fázisváltás.
  // Kérdésenként három körözés (nyitás, felfedés, továbblépés) + a belépés és a
  // zárás: **válaszonként nincs körözés**. Diákonként ez a szám szorzódik, tehát
  // húsz diák húsz válasza nem húsz teljes körözés (ez volt a keret felelőse).
  expect(measured.total).toBeLessThanOrEqual(8)
  for (const student of students) await student.close()
})
