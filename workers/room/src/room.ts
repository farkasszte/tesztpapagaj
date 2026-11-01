/**
 * Egy szoba = egy Durable Object.
 *
 * A relay szándékosan buta: nem ismeri a játék szabályait, nem tárol pontot és
 * nem dönt semmiről. Egyetlen dolga, hogy a tanár fülének üzeneteit eljuttassa
 * a diákokhoz, és hogy a képeket **egyszer** fogadja el — így ötven diák nem
 * ötvenszer tölti fel ugyanazt a képet a tanár laptopjáról.
 *
 * Hibernációs WebSocket-API-t használ: a szoba akkor sem fogyaszt CPU-t, ha a
 * tanár épp magyaráz, és a kapcsolatok megmaradnak.
 */
import {
  decodePictureFrame,
  encodePictureFrame,
  isRoomCode,
  MAX_ROOM_PICTURE_BYTES,
  MAX_STUDENTS,
  type ClientMessage,
  type HostMessage,
  type PeerId,
  type RelayMessage,
  type RoomRole,
} from '../../../src/game/room-protocol'

/** Egy kapcsolat címkéje: a relay azonosítója és a szerep. */
type Seat = { id: PeerId; role: RoomRole | null }

export class Room implements DurableObject {
  #state: DurableObjectState
  /**
   * A szoba képei: hash → mime + byte-ok. Szándékosan memóriában, mert a
   * Durable Object tárolója értékenként 128 KiB-ra korlátoz, egy iskolai kép
   * pedig nagyobb. Ha a szoba elhidegül és a példány elszáll, a tanár fülétől
   * `picture-missing`-gel kérjük vissza — ez a ritka út, nem a játék útja.
   */
  #pictures = new Map<string, { mime: string; bytes: ArrayBuffer }>()
  #pictureBytes = 0

  constructor(state: DurableObjectState) {
    this.#state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const code = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)

    if (url.pathname.endsWith('/health')) {
      return json({ ok: true, room: isRoomCode(code) ? code : null, players: this.#players().length })
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'upgrade-required' }, 426)
    }
    if (!isRoomCode(code)) return json({ error: 'bad-room-code' }, 400)

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    if (!client || !server) return json({ error: 'no-socket-pair' }, 500)
    // Hibernációs elfogadás: a kapcsolat életben marad, a példány alhat.
    this.#state.acceptWebSocket(server)
    server.serializeAttachment({ id: crypto.randomUUID(), role: null } satisfies Seat)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const seat = this.#seat(ws)
    if (!seat) return

    if (typeof message !== 'string') {
      const picture = decodePictureFrame(message)
      if (picture && seat.role === 'host') this.#acceptPicture(picture)
      return
    }

    let parsed: ClientMessage | HostMessage
    try {
      parsed = JSON.parse(message) as ClientMessage | HostMessage
    } catch {
      return
    }

    if (parsed.type === 'hello') {
      this.#hello(ws, seat, parsed.role)
      return
    }
    if (parsed.type === 'ping') {
      this.#send(ws, { type: 'pong' })
      return
    }
    if (parsed.type === 'picture-wanted' && typeof parsed.hash === 'string') {
      this.#sendPicture(ws, parsed.hash)
      return
    }
    if (parsed.type === 'reply') {
      // A diák üzenete a tanárhoz megy; a relay bele sem néz.
      if (seat.role !== 'player') return
      const hostSeat = this.#players().find((player) => player.role === 'host')
      const hostSocket = hostSeat ? this.#socketOf(hostSeat.id) : null
      if (hostSocket) this.#send(hostSocket, { type: 'reply', from: seat.id, view: parsed.view })
      return
    }
    if (seat.role !== 'host') return

    if (parsed.type === 'view') {
      this.#deliver(parsed.to, parsed.view)
      return
    }
    if (parsed.type === 'close') {
      for (const socket of this.#sockets()) {
        this.#send(socket, { type: 'denied', reason: 'closed' })
        socket.close(1000, 'closed')
      }
      this.#pictures.clear()
      this.#pictureBytes = 0
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const seat = this.#seat(ws)
    if (!seat) return
    if (seat.role === 'player') {
      for (const socket of this.#sockets()) {
        if (socket !== ws) this.#send(socket, { type: 'left', id: seat.id })
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  // ------------------------------------------------------------------ belső --

  #hello(ws: WebSocket, seat: Seat, role: RoomRole): void {
    if (seat.role) return // már bent van; a szerep nem váltható
    if (role === 'host') {
      // Egy szobának egy tanára van. Újra csatlakozni (újratöltés után) csak
      // akkor lehet, ha az előző tanár kapcsolata már nem él.
      const hostAlive = this.#players().some((player) => player.role === 'host')
      if (hostAlive) {
        this.#send(ws, { type: 'denied', reason: 'not-host' })
        ws.close(1008, 'not-host')
        return
      }
      this.#label(ws, { ...seat, role: 'host' })
      this.#send(ws, { type: 'welcome', id: seat.id, role: 'host', players: this.#players().length - 1 })
      return
    }

    const students = this.#players().filter((player) => player.role === 'player')
    if (students.length >= MAX_STUDENTS) {
      this.#send(ws, { type: 'denied', reason: 'full' })
      ws.close(1008, 'full')
      return
    }
    this.#label(ws, { ...seat, role: 'player' })
    this.#send(ws, {
      type: 'welcome',
      id: seat.id,
      role: 'player',
      players: this.#players().filter((player) => player.role === 'player').length,
    })
    // A szobában már meglévő képek: egyszer töltötte fel a tanár, ide mindenki megkapja.
    for (const hash of this.#pictures.keys()) this.#sendPicture(ws, hash)
  }

  #acceptPicture({ hash, mime, bytes }: { hash: string; mime: string; bytes: ArrayBuffer }): void {
    if (this.#pictures.has(hash)) return // már megvan: nem tároljuk kétszer
    if (this.#pictureBytes + bytes.byteLength > MAX_ROOM_PICTURE_BYTES) return
    this.#pictures.set(hash, { mime, bytes })
    this.#pictureBytes += bytes.byteLength
    for (const socket of this.#sockets()) {
      const seat = this.#seat(socket)
      if (seat?.role === 'player') this.#send(socket, encodePictureFrame(hash, mime, bytes))
    }
  }

  #sendPicture(ws: WebSocket, hash: string): void {
    const picture = this.#pictures.get(hash)
    if (!picture) {
      // Nincs meg (elszállt a példány): a tanártól kérjük vissza, ő az igazság.
      const host = this.#players().find((player) => player.role === 'host')
      const socket = host ? this.#socketOf(host.id) : null
      if (socket) this.#send(socket, { type: 'picture-missing', hash })
      return
    }
    this.#send(ws, encodePictureFrame(hash, picture.mime, picture.bytes))
  }

  /** Egy nézet kikézbesítése: mindenkinek (a tanár kivételével) vagy egyvalakinek. */
  #deliver(to: 'everyone' | PeerId, view: unknown): void {
    if (to === 'everyone') {
      for (const socket of this.#sockets()) {
        const seat = this.#seat(socket)
        if (seat?.role === 'player') this.#send(socket, { type: 'view', view })
      }
      return
    }
    const socket = this.#socketOf(to)
    if (socket) this.#send(socket, { type: 'view', view })
  }

  #send(ws: WebSocket, message: RelayMessage | ArrayBuffer): void {
    try {
      // A WebSocket csak szöveget vagy byte-okat visz: a vezérlő üzeneteket itt
      // szerializáljuk, különben a másik vég `[object Object]`-et kapna.
      ws.send(message instanceof ArrayBuffer ? message : JSON.stringify(message))
    } catch {
      // A kapcsolat épp ment el; a close-esemény rendet tesz.
    }
  }

  #seat(ws: WebSocket): Seat | null {
    return (ws.deserializeAttachment() as Seat | null) ?? null
  }

  #label(ws: WebSocket, seat: Seat): void {
    ws.serializeAttachment(seat)
  }

  #sockets(): WebSocket[] {
    return this.#state.getWebSockets()
  }

  #players(): Seat[] {
    return this.#sockets()
      .map((socket) => this.#seat(socket))
      .filter((seat): seat is Seat => seat !== null && seat.role !== null)
  }

  #socketOf(id: PeerId): WebSocket | null {
    for (const socket of this.#sockets()) {
      if (this.#seat(socket)?.id === id) return socket
    }
    return null
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
