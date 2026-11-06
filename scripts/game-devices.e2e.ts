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

/** Több helyes válasz: a diáknak egynél többet kell megjelölnie. */
const multiAnswer = (id: string, stem: string, choices: Choice[]) => ({
  ...multiChoice(id, stem, choices),
  type: 'multiple-answer' as const,
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
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
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
  // A nagy QR alatt is látja a tanár a létszámot (bruttó: mindenki, aki belepett)
  // és az utoljára belépőt — a táblát nézi, nem a jobb oldali listát.
  await expect(full.getByText('1 joined')).toBeVisible()
  await expect(full.getByText('Last in: Panni')).toBeVisible()
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
  // A diák kártyái ugyanazt a négy színt viselik, mint a tanár színpadán:
  // vörös, kék, arany — a szöveg és a betű mindegyiken fehér (a krémes a mély
  // arany kártyán 4,35:1 lenne, a fehér 4,55:1: a WCAG AA fölött).
  const tints = await choices.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).backgroundColor),
  )
  expect(tints).toEqual(['rgb(196, 64, 47)', 'rgb(47, 92, 140)', 'rgb(154, 110, 13)'])
  const cardInk = await choices.first().evaluate((node) => getComputedStyle(node).color)
  expect(cardInk).toBe('rgb(255, 255, 255)')
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

  // A felfedés után a tanár **előbb a kört** nézi meg: a gomb ide visz, nem a
  // következő kérdésre. A válaszok ilyenkor még a táblán állnak.
  const toBoard = stage.getByRole('button', { name: 'Show the round results' })
  await expect(toBoard).toBeVisible()
  await expect(stage.locator('.gq-answer')).toHaveCount(3)
  await toBoard.click()

  const board = stage.locator('.gq-board')
  await expect(board).toBeVisible()
  await expect(board).toContainText('Round results')
  await expect(board.locator('.gq-board-name')).toHaveText(['Panni'])
  await expect(board.locator('.gq-board-points')).toHaveText([/^\d+$/])
  // A táblán a kérdés kártyái már nem állnak: ez a kör képernyője.
  await expect(stage.locator('.gq-answer')).toHaveCount(0)
  // A tanár laptopján (1366×768) is látszania kell.
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(board).toBeInViewport()
  await page.setViewportSize({ width: 1600, height: 1024 })

  await stage.getByRole('button', { name: 'Finish' }).click()
  await expect(stage.getByText('That is every question!')).toBeVisible()
  await expect(stage.getByText('1 of 1 right')).toBeVisible()
  await expect(student.getByText('The game is over')).toBeVisible()

  // A felfedés után a kérdés kimenetele a tanár gépén marad: a bank listája
  // ebből jelzi, melyik kérdés megy rosszul. Panni eltalálta, tehát 1/1.
  const stats = await page.evaluate(() => window.localStorage.getItem('tesztpapagaj:question-stats'))
  expect(stats).toBeTruthy()
  const parsed = JSON.parse(stats ?? '{}') as Record<string, { asked: number; right: number }>
  expect(Object.values(parsed)).toContainEqual(expect.objectContaining({ asked: 1, right: 1 }))

  // A játék eredménye a tanár naplójába is bekerül: a színpad a jelentés
  // megjelenésekor menti, és a diák válasza cellánként ott van.
  const results = await page.evaluate(async () => {
    const store = (await import(
      /* @vite-ignore */ '/src/game/results-store.ts'
    )) as typeof import('../src/game/results-store')
    const all = await store.listResults()
    return all.map((item) => ({
      id: item.id,
      title: item.title,
      questions: item.questions.length,
      players: item.players.map((player) => ({ nickname: player.nickname, cells: player.cells })),
    }))
  })
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({ title: 'Devices bank', questions: 1 })
  expect(results[0]?.players).toEqual([{ nickname: 'Panni', cells: ['right'] }])

  // A záróképernyőről a ranglista CSV-ben elvihető.
  const downloadPromise = page.waitForEvent('download')
  await stage.getByRole('button', { name: 'Save the standings' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+\.csv$/)
  const saved = await download.path()
  const text = saved ? await (await import('node:fs/promises')).readFile(saved, 'utf8') : ''
  expect(text).toContain('Name;Points')
  expect(text).toContain('Panni')

  await student.close()
})

test('több helyes válasznál a jelölés látszik, és a téves indoklás minden betűt mond', async ({
  page,
}) => {
  await seedBank(page, 'Multi bank', [
    multiAnswer('m1', 'Which gases are noble?', [
      { text: 'Helium', correct: true },
      { text: 'Oxygen', correct: false },
      { text: 'Neon', correct: true },
      { text: 'Nitrogen', correct: false },
    ]),
  ])
  await connectRelay(page.context())

  await page.goto('/jatek')
  await expect(page.getByText('1 of 1 questions can be played.')).toBeVisible()
  // Rövid idő: a kérdés lejárta előtt a jelölések maguktól elmennek.
  await page.getByLabel('Time per question (seconds)').fill('5')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  const student = await page.context().newPage()
  // Telefon-méret: a küldés gombnak négy válasz mellett is a nézetben kell lennie.
  await student.setViewportSize({ width: 390, height: 844 })
  await student.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await student.getByPlaceholder('For example: Panni').fill('Panni')
  await student.getByRole('button', { name: 'Join the game' }).click()
  await expect(student.getByText('You are in.')).toBeVisible()
  await lobby.getByRole('button', { name: 'Start the game' }).click()

  const choices = student.locator('.gq-stu-choice')
  await expect(choices).toHaveCount(4)
  // Két válasz megjelölése: mindkettő láthatóan kijelölt (a kártya krémes
  // gyűrűt és kitöltött betűt kap), nem csak a „Válaszaim elküldése" gomb vár.
  await choices.filter({ hasText: 'Oxygen' }).click()
  await choices.filter({ hasText: 'Neon' }).click()
  await expect(choices.filter({ hasText: 'Oxygen' })).toHaveAttribute('data-tone', 'picked')
  await expect(choices.filter({ hasText: 'Neon' })).toHaveAttribute('data-tone', 'picked')
  // A jelölés a **betű helyén** látszik: a karika krémes lesz, benne pipával
  // (a jelet a stíluslap rajzolja, ezért a kártya szövege nem tördelődik újra).
  const marked = choices.filter({ hasText: 'Oxygen' }).locator('.gq-stu-letter')
  await expect(marked).toHaveAttribute('data-ticked', 'true')
  await expect
    .poll(() => marked.evaluate((node) => getComputedStyle(node, '::after').content))
    .toContain('✓')
  // A küldés gomb négy válasz mellett is a képernyőn van.
  await expect(student.getByRole('button', { name: 'Send my answers' })).toBeInViewport()

  // A betűk a színpadon kevert sorrendből jönnek: a helyes betűket a
  // megjelenített sorrendből olvassuk ki.
  const shown = await choices.evaluateAll((nodes) =>
    nodes.map((node) => ({
      letter: (node.querySelector('.gq-stu-letter')?.textContent ?? '').trim(),
      text: (node.querySelector('.gq-stu-choice-words')?.textContent ?? '').trim(),
    })),
  )
  const right = shown
    .filter((one) => one.text === 'Helium' || one.text === 'Neon')
    .map((one) => one.letter)
    .sort()

  // A küldést **nem** nyomja meg senki: a lejárat előtt a jelölések maguktól
  // elmennek, a válasz nem vész el.
  await expect(
    student.getByText(new RegExp(`the answer was ${right.join(', ')}`), { timeout: 15000 }),
  ).toBeVisible()
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

test('a megoszlás bekapcsolva a betű helyén a válaszok számát mutatja', async ({ page }) => {
  await seedBank(page, 'Counts bank', [THREE('c1', 'Which gas do plants take in?')])
  await connectRelay(page.context())

  await page.goto('/jatek')
  await page.getByRole('checkbox', { name: 'Students on their own devices' }).check()
  // A megoszlás jelölője csak diák-eszközös Klasszikus módban jelenik meg: ott
  // van kitől számolni.
  await page.getByRole('checkbox', { name: 'Show how many picked each answer' }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await expect(lobby).toBeVisible()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  // Egy diák válaszol a helyesre: a megoszlás 1 / 0 / 0.
  const phone = await page.context().newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
  await phone.getByPlaceholder('For example: Panni').fill('Panni')
  await phone.getByRole('button', { name: 'Join the game' }).click()
  await expect(phone.getByText('You are in.')).toBeVisible()
  await lobby.getByRole('button', { name: 'Start the game' }).click()
  const choice = phone.locator('.gq-stu-choice').filter({ hasText: 'Carbon dioxide' })
  await expect(choice).toBeVisible()
  await choice.click()

  const stage = page.locator('.gq-stage')
  await expect(stage.locator('.gq-answer[data-state="correct"]')).toHaveCount(1)
  // A kártya betűjele helyén a választók száma áll, a karikában.
  await expect(stage.locator('.gq-answer[data-counts="true"]')).toHaveCount(3)
  const numbers = await stage
    .locator('.gq-answer .gq-letter')
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()))
  expect(numbers.sort()).toEqual(['0', '0', '1'])
  // A teljes kártya akadálymentes neve is kimondja, hányan választották.
  await expect(stage.locator('.gq-answer').first()).toHaveAttribute('aria-label', /\d+ picked$/)
})
