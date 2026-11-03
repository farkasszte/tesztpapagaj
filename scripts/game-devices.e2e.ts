import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test'
import type { ClientMessage, PeerId, RoomRole } from '../src/game/room-protocol'

// A diák-eszközös út: a tanár füle futtatja a motort, a szoba-relay csak
// továbbít. A relay helyét itt a Playwright WebSocket-útvonala veszi át: a
// szoba ugyanazt a huzalprotokollt beszéli (`src/game/room-protocol.ts`), de a
// teszt folyamatában fut, így nincs plusz kiszolgáló, port vagy hálózat.
// A valódi Cloudflare-worker (Durable Object) a saját tesztjeivel és a szobás
// füstméréssel van lefedve.

type Seat = { socket: WebSocketRoute; role: RoomRole }

/** A szoba állapota: ki van bent, és ki a tanár. */
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
      // Képkeret (ArrayBuffer) nem kell ehhez a forgatókönyvhöz: a kérdés szöveges.
      if (typeof raw !== 'string') return
      const message = JSON.parse(raw) as ClientMessage
      switch (message.type) {
        case 'hello': {
          this.seats.set(id, { socket, role: message.role })
          if (message.role === 'host') this.host = id
          socket.send(
            JSON.stringify({ type: 'welcome', id, role: message.role, players: this.players() }),
          )
          // A tanár a bent lévők számát a saját `welcome`-jából is látja.
          const host = this.host
          if (host && host !== id) {
            this.seats
              .get(host)
              ?.socket.send(
                JSON.stringify({ type: 'welcome', id: host, role: 'host', players: this.players() }),
              )
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
          this.seats
            .get(host)
            ?.socket.send(JSON.stringify({ type: 'reply', from: id, view: message.view }))
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

async function connectRelay(context: BrowserContext): Promise<void> {
  const room = new Room()
  await context.routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))
}

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

async function seedBank(page: Page, name: string, questions: ReturnType<typeof multiChoice>[]) {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await page.evaluate(async (given) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: given.name })
    await banks.commit(bank.id, { kind: 'create-questions', questions: given.questions as never })
  }, { name, questions })
}

test('a diák a saját lapján csatlakozik, és a tanár színpadán vezet', async ({ page }) => {
  await seedBank(page, 'Devices bank', [THREE('s1', 'Which gas do plants take in?')])
  await connectRelay(page.context())

  await page.goto('/jatek')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  // A körönkénti eredmény a diák-eszközös módhoz tartozik: a jelölő ekkor
  // jelenik meg, és a felfedés után az első ötöt írja ki.
  await page.getByRole('checkbox', { name: 'Show the results after each question' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // A tanár szobát nyit: a kóddal lehet bejönni.
  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')
  expect(code).toMatch(/^\d{6}$/)
  await expect(lobby.getByText('Waiting for the first student.')).toBeVisible()

  // A diák ugyanabban a böngészőben, másik lapon jön be a kóddal.
  const student = await page.context().newPage()
  await student.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await expect(student.getByRole('heading', { name: 'Coming in' })).toBeVisible()
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  await expect(student.getByText('You are in.')).toBeVisible()

  await expect(lobby.getByText('1 joined')).toBeVisible()

  // A lobbi szövegei a sötét vásznon világosak: a „Vissza" gomb és a súgók
  // nem barna tintát kapnak (az a világos papírra való).
  const back = lobby.getByRole('button', { name: 'Back', exact: true })
  const ink = await back.evaluate((node) => getComputedStyle(node).color)
  const channels = ink.match(/\d+/g)!.slice(0, 3).map(Number)
  expect(Math.min(...channels)).toBeGreaterThan(150)

  // A QR koppintásra teljes képernyőre vált, és Esc-pel visszatér.
  await lobby.getByRole('button', { name: 'Full-screen QR' }).click()
  const full = page.getByRole('dialog', { name: 'Full-screen QR' })
  await expect(full).toBeVisible()
  await expect(full.locator('svg.gq-qr')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(full).toBeHidden()

  await lobby.getByRole('button', { name: 'Start the game' }).click()

  // A tanár színpadán a kérdés, a diák telefonján a válaszok.
  const stage = page.getByRole('dialog', { name: 'Quiz game' })
  await expect(stage.getByText('Which gas do plants take in?')).toBeVisible()
  await expect(stage.getByText('Students answer on their phones.')).toBeVisible()
  await expect(stage.getByText('0/1 answered')).toBeVisible()

  const choices = student.locator('.gq-stu-choice')
  await expect(choices).toHaveCount(3)
  // A telefon ugyanazt a (kevert) sorrendet látja, mint a tanár színpada: a
  // helyes választ a szövegénél fogva kell megnyomni, nem a helyénél.
  const onPhone = await choices.evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''))
  expect(onPhone).not.toEqual(['Oxygen', 'Carbon dioxide', 'Helium'])
  await choices.filter({ hasText: 'Carbon dioxide' }).click()

  // Mindenki válaszolt, ezért a motor magától felfedi — a tanárnak már csak
  // továbblépnie kell. A diák a saját telefonján látja az eredményt.
  await expect(stage.locator('.gq-answer[data-state="correct"]')).toHaveCount(1)
  await expect(student.getByText('Right!')).toBeVisible()
  await expect(student.getByText(/\d+ points/)).toBeVisible()

  // A tanár színpadán a kör eredménye: az első öt, pontszámmal, mozdulatlanul.
  const round = stage.locator('.gq-round')
  await expect(round).toBeVisible()
  await expect(round).toContainText('Round results')
  await expect(round.locator('.gq-round-name')).toHaveText(['Panni'])
  await expect(round.locator('.gq-round-points')).toHaveText([/^\d+$/])

  await stage.getByRole('button', { name: 'Finish' }).click()
  await expect(stage.getByText('That is every question!')).toBeVisible()
  await expect(stage.getByText('1 of 1 right')).toBeVisible()
  await expect(student.getByText('The game is over')).toBeVisible()

  await student.close()
})

test('ha a relay nem érhető el, a tanár és a diák is megkapja az okot', async ({ page }) => {
  await seedBank(page, 'Unreachable bank', [THREE('u1', 'Which gas do plants take in?')])
  // A hálózat blokkolja a szobát: a WebSocket azonnal lezárul, a sima HTTPS
  // viszont átmegy (a szűrők tipikusan így viselkednek).
  await page.context().routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => socket.close())
  await page.context().route('**/health', (route) =>
    route.fulfill({ status: 200, body: '{"ok":true}', contentType: 'application/json' }),
  )

  await page.goto('/jatek')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // A lobbi nem a végtelenségig „Kapcsolódás…": kimondja, hogy nem érhető el.
  await expect(page.locator('.gq-lobby')).toContainText('The room is not reachable', {
    timeout: 15000,
  })

  // A diák oldalán ugyanez: a belépés előtt megkapja az okot, nem csak a pörgő
  // „Connecting…" szöveget.
  const student = await page.context().newPage()
  await student.goto(new URL('/jatek?kod=123456', page.url()).toString())
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  // A websocket nem nyílik, de a szerver sima HTTPS-en elérhető: a felület
  // megmondja, hogy a hálózat az élő kapcsolatot blokkolja (iskolai szűrő).
  await expect(student.getByText(/blocks the live connection/)).toBeVisible({ timeout: 15000 })
})

test('ha a szerver egyáltalán nem érhető el, azt mondja, hogy nincs kapcsolat', async ({ page }) => {
  await seedBank(page, 'Offline bank', [THREE('o1', 'Which gas do plants take in?')])
  await page.context().routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => socket.close())
  await page.context().route('**/health', (route) => route.abort())

  await page.goto('/jatek?kod=123456')
  await page.getByPlaceholder('For example: Panni').fill('Panni')
  await page.getByRole('button', { name: 'Join the game' }).click()
  await expect(page.getByText(/No connection to the game server/)).toBeVisible({ timeout: 15000 })
})
