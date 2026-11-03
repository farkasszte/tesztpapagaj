import { expect, test, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test'
import type { ClientMessage, PeerId, RoomRole } from '../src/game/room-protocol'

// A Bajnok mód diák-eszközös útja: a kliens kártyái ugyanazt a négy aréna-színt
// viselik, mint a tanár színpada, a fejlécsáv pedig hosszú bajnoknév mellett sem
// csúsztatja a nevet a díjalap panelje alá.
// A relayt a Playwright WebSocket-útvonala játssza a közös huzalprotokollal.

type Seat = { socket: WebSocketRoute; role: RoomRole }

const HUNGARIAN = () =>
  window.localStorage.setItem('tesztpapagaj:language', 'hu')

/** Egy szoba: ki van bent, és ki a tanár. */
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
      if (message.type === 'hello') {
        this.seats.set(id, { socket, role: message.role })
        if (message.role === 'host') this.host = id
        socket.send(
          JSON.stringify({ type: 'welcome', id, role: message.role, players: this.players() }),
        )
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
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }))
        return
      }
      if (message.type === 'view') {
        const text = JSON.stringify({ type: 'view', view: message.view })
        if (message.to === 'everyone') {
          for (const [peer, seat] of this.seats) if (peer !== id) seat.socket.send(text)
        } else {
          this.seats.get(message.to)?.socket.send(text)
        }
        return
      }
      if (message.type === 'reply') {
        const host = this.host
        if (host) {
          this.seats
            .get(host)
            ?.socket.send(JSON.stringify({ type: 'reply', from: id, view: message.view }))
        }
      }
    })
    socket.onClose(() => {
      this.seats.delete(id)
      if (id === this.host) this.host = null
    })
  }
}

let bankCounter = 0

async function seedBank(page: Page): Promise<void> {
  bankCounter += 1
  const tag = `b${bankCounter}`
  await page.goto('/about')
  await page.evaluate(async (suffix) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/question-bank-workspaces.ts'
    )) as typeof import('../src/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const bank = await banks.create()
    await banks.commit(bank.id, { kind: 'rename', name: 'Bajnok bank' })
    const question = (id: string) => ({
      id,
      type: 'multiple-choice' as const,
      columns: 2 as const,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Melyik gáz kell a növényeknek a fotoszintézishez?' }],
          },
          {
            type: 'multipleChoice',
            content: [
              ['Szén-dioxid', true],
              ['Oxigén', false],
              ['Hélium', false],
              ['Nitrogén', false],
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
      questions: [question(`c1-${suffix}`), question(`c2-${suffix}`)],
    } as never)
  }, tag)
}

/** A tanár szobát nyit, két diák belép, a menet elindul a bajnok válaszáig. */
async function openChampionRoom(page: Page, room: Room, name: string) {
  const context: BrowserContext = page.context()
  await context.routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))

  await seedBank(page)
  await page.goto('/jatek')
  await page.getByRole('button', { name: /^Bajnok/ }).click()
  await page.getByRole('checkbox', { name: 'Diákok a saját eszközükön' }).check()
  await page.getByRole('button', { name: 'Indítás', exact: true }).click()

  const lobby = page.locator('.gq-lobby')
  await lobby.waitFor()
  const code = (await lobby.locator('.gq-lobby-code').innerText()).replace(/\s+/g, '')

  const join = async (nickname: string) => {
    const other = await context.browser()!.newContext()
    await other.routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))
    const student = await other.newPage()
    await student.addInitScript(HUNGARIAN)
    await student.setViewportSize({ width: 390, height: 844 })
    await student.goto(new URL(`/jatek?kod=${code}`, page.url()).toString())
    await student.getByPlaceholder('Például: Panni').fill(nickname)
    await student.getByRole('button', { name: 'Belépek' }).click()
    await student.waitForTimeout(500)
    return { context: other, student }
  }

  const champion = await join(name)
  await join('Dorka')

  await lobby.getByRole('button', { name: 'Játék indítása' }).click()
  const stage = page.locator('.gq-stage')
  await stage.waitFor()
  // Eszközös módban a bajnok a lobbiból jön (az első diák), nem kell beírni.
  const nameField = stage.getByPlaceholder('Név…')
  if (await nameField.count()) {
    await nameField.fill(name)
    await stage.getByRole('button', { name: 'Indítás', exact: true }).click()
  }
  await stage.getByRole('button', { name: 'Jöhet a kérdés' }).click()
  await stage.getByRole('button', { name: 'Válaszok lezárása' }).click()
  await stage.getByRole('button', { name: /bajnok válaszol/i }).click()
  await page.waitForTimeout(900)

  return { stage, student: champion.student, championContext: champion.context }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(HUNGARIAN)
})

test('a bajnok kliensének kártyái a négy aréna-színt viselik, olvasható szöveggel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const { student, championContext } = await openChampionRoom(page, new Room(), 'Bence')

  const cards = student.locator('.gq-stu-choice')
  await expect(cards).toHaveCount(4)

  const measured = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)
      const letters = (node.textContent ?? '').trim().slice(0, 1)
      return {
        letters,
        background: style.backgroundColor,
        color: style.color,
        tone: node.getAttribute('data-tone'),
      }
    }),
  )

  // A színpad négy színe: vörös, kék, mély arany, szilva — a kártya hordozza.
  expect(measured.map((card) => card.background)).toEqual([
    'rgb(196, 64, 47)',
    'rgb(47, 92, 140)',
    'rgb(154, 110, 13)',
    'rgb(108, 74, 134)',
  ])
  // A szöveg mind a négyen krémes: a szín nem megy a betűre.
  for (const card of measured) expect(card.color).toBe('rgb(255, 255, 255)')

  // Kontraszt (WCAG): a krémes szöveg mind a négy kártyán 4,5 fölött van.
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/\d+/g)!.slice(0, 3).map(Number)
    const channel = (value: number) => {
      const unit = value / 255
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  for (const card of measured) {
    const light = Math.max(luminance(card.color), luminance(card.background))
    const dark = Math.min(luminance(card.color), luminance(card.background))
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThan(4.5)
  }

  // A fejléc nem vágja le a nevet.
  const header = await student.locator('.gq-stu-name').evaluate((node) => ({
    text: (node.textContent ?? '').trim(),
    clipped: node.scrollWidth > node.clientWidth + 1,
  }))
  expect(header.text).toBe('Bence')
  expect(header.clipped).toBe(false)

  await championContext.close()
})

test('a színpad fejlécsávja hosszú bajnoknév mellett sem takarja a nevet', async ({ page }) => {
  for (const width of [1600, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    const { stage, championContext } = await openChampionRoom(
      page,
      new Room(),
      'Benedek Kristóf Zalán',
    )

    const rects = await stage.evaluate((node) => {
      const box = (selector: string) => {
        const found = node.querySelector(selector)
        if (!found) return null
        const rect = found.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }
      return { name: box('.gq-one-name'), pot: box('.gq-stat') }
    })

    expect(rects.name).not.toBeNull()
    expect(rects.pot).not.toBeNull()
    // A név a díjalap panelje ELŐTT véget ér: nincs alálógás.
    expect(rects.name!.right).toBeLessThanOrEqual(rects.pot!.left)

    await championContext.close()
    await page.goto('/about')
  }
})
