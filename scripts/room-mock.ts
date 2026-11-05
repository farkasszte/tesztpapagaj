import type { BrowserContext, WebSocketRoute } from '@playwright/test'
import type { ClientMessage, PeerId, RoomRole } from '../src/game/room-protocol'

/**
 * A szoba-relay a teszt folyamatában: ugyanazt a huzalprotokollt beszéli
 * (`src/game/room-protocol.ts`), de nincs mögötte kiszolgáló. A tanár gépe és a
 * diák telefonja így ugyanazon az úton beszél, mint élesben.
 */

type Seat = { socket: WebSocketRoute; role: RoomRole }

export class Room {
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

/** A szoba-útvonal elkapása: minden `/room/<kód>` WebSocket a vizsgált szobába fut. */
export async function connectRelay(context: BrowserContext): Promise<void> {
  const room = new Room()
  await context.routeWebSocket(/\/room\/[0-9]{6}$/, (socket) => room.handle(socket))
}
