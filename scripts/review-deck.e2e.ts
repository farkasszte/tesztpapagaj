import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import type { ClientMessage, PeerId, RoomRole } from '../src/game/room-protocol'

// Hibalista: a Klasszikus játék végén a tanár gépe mindenkinek kiküldi a saját
// elrontott kérdéseit, a diák telefonja eltárolja hét napra, és a tanulókártya-
// nézővel átnézhető. A szoba-relay itt a Playwright WebSocket-útvonala (ugyanaz
// a huzalprotokoll, `src/game/room-protocol.ts`).

type Seat = { socket: WebSocketRoute; role: RoomRole }

class Room {
  private readonly seats = new Map<PeerId, Seat>()
  private host: PeerId | null = null
  private counter = 0

  private players(): number {
    return [...this.seats.values()].filter((seat) => seat.role === 'player').length
  }

  handle(socket: WebSocketRoute): void {
    const id = `peer-${(this.counter += 1)}`
    socket.onMessage((raw) => {
      if (typeof raw !== 'string') return
      const message = JSON.parse(raw) as ClientMessage
      switch (message.type) {
        case 'hello': {
          this.seats.set(id, { socket, role: message.role })
          if (message.role === 'host') this.host = id
          socket.send(JSON.stringify({ type: 'welcome', id, role: message.role, players: this.players() }))
          const host = this.host
          if (host && host !== id) {
            this.seats
              .get(host)
              ?.socket.send(JSON.stringify({ type: 'welcome', id: host, role: 'host', players: this.players() }))
          }
          return
        }
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }))
          return
        case 'view': {
          const text = JSON.stringify({ type: 'view', view: message.view })
          if (message.to === 'everyone') {
            for (const [peer, seat] of this.seats) if (peer !== id) seat.socket.send(text)
          } else {
            this.seats.get(message.to)?.socket.send(text)
          }
          return
        }
        case 'reply': {
          const host = this.host
          if (!host) return
          this.seats.get(host)?.socket.send(JSON.stringify({ type: 'reply', from: id, view: message.view }))
          return
        }
        default:
          return
      }
    })
    socket.onClose(() => {
      this.seats.delete(id)
      const host = this.host
      if (id === host) this.host = null
      else if (host) this.seats.get(host)?.socket.send(JSON.stringify({ type: 'left', id }))
    })
  }
}

async function connectRelay(context: Page['context']): Promise<void> {
  const room = new Room()
  await context.routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))
}

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

const GAS = choice('r1', 'Which gas do plants take in?', [
  { text: 'Oxygen', correct: false },
  { text: 'Carbon dioxide', correct: true },
  { text: 'Helium', correct: false },
])
const STAR = choice('r2', 'What is the closest star to Earth?', [
  { text: 'Sirius', correct: false },
  { text: 'The Sun', correct: true },
  { text: 'Polaris', correct: false },
])

async function seedBank(page: Page) {
  await page.goto('/about')
  await page.evaluate(async (questions) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Review bank' })
    await banks.commit(bank.id, { kind: 'create-questions', questions: questions as never })
  }, [GAS, STAR])
}

test('a játék végén a diák telefonján marad a hibalista, és átnézhető', async ({ page }) => {
  await seedBank(page)
  await connectRelay(page.context())

  await page.goto('/jatek')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  const student = await page.context().newPage()
  await student.setViewportSize({ width: 390, height: 844 })
  await student.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  await expect(student.getByText('You are in.')).toBeVisible()
  await lobby.getByRole('button', { name: 'Start the game' }).click()

  // 1. kérdés: Panni rosszat válaszol — ez kerül a hibalistára.
  const choices = student.locator('.gq-stu-choice')
  await expect(choices).toHaveCount(3)
  await choices.filter({ hasText: 'Oxygen' }).click()
  await expect(student.getByText(/Not this time/)).toBeVisible()

  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  await stage.getByRole('button', { name: 'Next question' }).click()

  // 2. kérdés: eltalálja — ez nem kerül a listára.
  await expect(choices.filter({ hasText: 'The Sun' })).toBeVisible()
  await choices.filter({ hasText: 'The Sun' }).click()
  await expect(student.getByText('Right!')).toBeVisible()

  await stage.getByRole('button', { name: 'Finish' }).click()
  await expect(stage.getByText('That is every question!')).toBeVisible()
  await expect(student.getByText('The game is over')).toBeVisible()

  // A telefonon megjelenik a hibalista gombja: pontosan egy kérdés.
  const review = student.getByRole('button', { name: 'Review my mistakes (1)' })
  await expect(review).toBeVisible()
  await expect(student.getByText(/kept on this phone for seven days/)).toBeVisible()

  // A pakli eltárolódott a telefonon.
  const stored = await student.evaluate(() => window.localStorage.getItem('tesztpapagaj:review-decks'))
  expect(stored).toBeTruthy()
  const decks = JSON.parse(stored ?? '[]') as { id: string; cards: { prompt: string }[] }[]
  expect(decks).toHaveLength(1)
  expect(decks[0].cards).toHaveLength(1)
  expect(decks[0].cards[0].prompt).toContain('Which gas do plants take in?')

  // A gomb a kártyanézetet nyitja: elől a kérdés, hátul a helyes válasz.
  await review.click()
  const deck = student.getByRole('dialog', { name: 'Flashcards' })
  await expect(deck).toBeVisible()
  const card = deck.locator('.gq-card')
  await expect(card).toContainText('Which gas do plants take in?')
  await card.click()
  await expect(deck.locator('.gq-card-answer')).toContainText('Carbon dioxide')
  await deck.getByRole('button', { name: 'End game' }).click()
  await expect(deck).toBeHidden()

  // A diák saját oldalán (`/diak`) a megőrzött pakli a szoba után is ott van.
  await student.goto(new URL('/diak', page.url()).toString())
  await expect(student.getByRole('heading', { name: 'Your mistake lists' })).toBeVisible()
  const saved = student.locator('.gq-deck-open').first()
  await expect(saved).toContainText('Review bank')
  await expect(saved).toContainText('1 card')
  await saved.click()
  await expect(student.getByRole('dialog', { name: 'Flashcards' })).toBeVisible()

  await student.close()
})
