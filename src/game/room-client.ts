/**
 * A szoba-relay kliens oldala: egy WebSocket, újrapróbálkozással.
 *
 * A tanár fülének és a diák telefonjának ugyanez a kód kell — a különbség csak
 * annyi, hogy a tanár `host`-ként lép be és nézeteket küld, a diák `player`-ként
 * és nézeteket kap. A játék szabályait egyik sem itt tudja meg: a relay csak
 * továbbít, a tanár böngészője az igazság.
 *
 * Gyenge hálózatra tervezve: ha a kapcsolat elszakad, a kliens növekvő
 * várakozással újrapróbál, közben életjelet küld, és a visszatérés után a
 * hívónak átadja a lehetőséget, hogy friss nézetet küldjön (a tanár) vagy
 * kérjen (a diák).
 */
import {
  decodePictureFrame,
  encodePictureFrame,
  type ClientMessage,
  type HostMessage,
  type PeerId,
  type RelayMessage,
  type RoomCode,
  type RoomRole,
} from './room-protocol'

/** A relay címe; a build idején a `VITE_ROOM_URL` adja (wss://…/room). */
export function roomUrl(): string {
  const configured = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_ROOM_URL
  if (configured) return configured.replace(/\/+$/, '')
  // Fejlesztéskor a `wrangler dev` a 8788-on figyel.
  if (typeof location !== 'undefined' && location.hostname === 'localhost') {
    return 'ws://127.0.0.1:8788'
  }
  throw new Error('A VITE_ROOM_URL nincs beállítva: enélkül nincs hova csatlakozni.')
}

export type RoomHandlers = {
  /** Belépés sikerült (újra belépés után is). */
  welcome?: (info: { id: PeerId; role: RoomRole; players: number }) => void
  /** Egy nézet, amit a tanár küldött (diáknál). */
  view?: (view: unknown) => void
  /** Kép byte-jai (nem base64). */
  picture?: (picture: { hash: string; mime: string; bytes: ArrayBuffer }) => void
  /** Egy diák üzenete (a tanárnál): belépés, válasz. */
  reply?: (from: PeerId, view: unknown) => void
  /** Egy diák elment. */
  left?: (id: PeerId) => void
  /** A szoba megtelt vagy lezárult: innen nincs újrapróbálkozás. */
  denied?: (reason: 'full' | 'closed' | 'no-room' | 'not-host') => void
  /** A tanárnak: a relay elvesztette ezt a képet, küldje újra. */
  pictureMissing?: (hash: string) => void
  /** Kapcsolat állapota (a tanár ekkor küldhet teljes nézetet). */
  status?: (status: 'connecting' | 'open' | 'closed' | 'denied') => void
}

export type RoomConnection = {
  readonly id: PeerId | null
  readonly open: boolean
  /** Nézet küldése (tanár). */
  send(view: unknown, to?: 'everyone' | PeerId): void
  /** Kép küldése egyszer (tanár); a relay szétosztja. */
  sendPicture(hash: string, mime: string, bytes: ArrayBuffer): void
  /** A szoba lezárása (tanár) — a diákok `closed` jelzést kapnak. */
  closeRoom(): void
  /** Üzenet a tanárnak (diák): belépés, válasz. */
  sendReply(view: unknown): void
  /** Kép kérése, ha lemaradt (diák). */
  wantPicture(hash: string): void
  /** Végleges kilépés (nem próbál újra). */
  leave(): void
}

export type RoomOptions = {
  code: RoomCode
  role: RoomRole
  handlers?: RoomHandlers
  /** Teszthez: másik WebSocket-gyár. */
  createSocket?: (url: string) => WebSocket
}

/** A legnagyobb várakozás újrapróbálkozás előtt. */
const MAX_BACKOFF_MS = 8000
/** Ennyi ideig csendben feltételezzük, hogy a kapcsolat él. */
const HEARTBEAT_MS = 20000

export function connectRoom({ code, role, handlers = {}, createSocket }: RoomOptions): RoomConnection {
  const make = createSocket ?? ((url: string) => new WebSocket(url))
  let socket: WebSocket | null = null
  let id: PeerId | null = null
  let retry = 0
  let closedForGood = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let pending: ReturnType<typeof setTimeout> | undefined
  /** Amíg nincs meg a welcome, addig a kimenő üzenetek várnak. */
  const queued: (ClientMessage | HostMessage)[] = []

  const url = `${roomUrl()}/room/${code}`

  const send = (message: ClientMessage | HostMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN && id) {
      socket.send(JSON.stringify(message))
      return
    }
    queued.push(message)
  }

  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = undefined
  }

  const scheduleRetry = () => {
    if (closedForGood) return
    handlers.status?.('closed')
    const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** retry)
    retry += 1
    pending = setTimeout(open, wait)
  }

  const flush = () => {
    while (queued.length > 0 && socket && socket.readyState === WebSocket.OPEN && id) {
      const message = queued.shift()
      if (message) socket.send(JSON.stringify(message))
    }
  }

  function open() {
    if (closedForGood) return
    handlers.status?.('connecting')
    const ws = make(url)
    ws.binaryType = 'arraybuffer'
    socket = ws

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', role } satisfies ClientMessage))
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        const picture = decodePictureFrame(event.data as ArrayBuffer)
        if (picture) handlers.picture?.(picture)
        return
      }
      let message: RelayMessage
      try {
        message = JSON.parse(event.data) as RelayMessage
      } catch {
        return
      }
      switch (message.type) {
        case 'welcome':
          id = message.id
          retry = 0
          handlers.status?.('open')
          handlers.welcome?.({ id: message.id, role: message.role, players: message.players })
          stopHeartbeat()
          heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS)
          flush()
          break
        case 'view':
          handlers.view?.(message.view)
          break
        case 'picture':
          handlers.picture?.({ hash: message.hash, mime: message.mime, bytes: message.bytes })
          break
        case 'reply':
          handlers.reply?.(message.from, message.view)
          break
        case 'left':
          handlers.left?.(message.id)
          break
        case 'picture-missing':
          handlers.pictureMissing?.(message.hash)
          break
        case 'denied':
          closedForGood = true
          stopHeartbeat()
          handlers.status?.('denied')
          handlers.denied?.(message.reason)
          break
        default:
          break
      }
    })

    const onGone = () => {
      if (socket !== ws) return
      socket = null
      id = null
      stopHeartbeat()
      scheduleRetry()
    }
    ws.addEventListener('close', onGone)
    ws.addEventListener('error', () => {
      // A close esemény utána jön; itt nem teszünk mást, csak nem dobunk hibát.
    })
  }

  open()

  return {
    get id() {
      return id
    },
    get open() {
      return socket?.readyState === WebSocket.OPEN && id !== null
    },
    send(view, to = 'everyone') {
      send({ type: 'view', to, view })
    },
    sendPicture(hash, mime, bytes) {
      if (socket && socket.readyState === WebSocket.OPEN && id) {
        socket.send(encodePictureFrame(hash, mime, bytes))
        return
      }
      // Nem küldünk képet, amíg nincs kapcsolat: a tanár a welcome után küldi.
      handlers.pictureMissing?.(hash)
    },
    closeRoom() {
      send({ type: 'close' })
    },
    sendReply(view) {
      send({ type: 'reply', view })
    },
    wantPicture(hash) {
      send({ type: 'picture-wanted', hash })
    },
    leave() {
      closedForGood = true
      stopHeartbeat()
      if (pending) clearTimeout(pending)
      socket?.close(1000, 'left')
      socket = null
    },
  }
}
