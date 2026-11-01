/**
 * A szoba-relay belépési pontja.
 *
 *   GET /health            — életjel, nem kell hozzá szoba
 *   GET /room/<6 jegy>     — WebSocket-kapcsolat a szobához (tanár vagy diák)
 *
 * A szoba kódja nevezi meg a Durable Objectet, tehát egy kód = egy példány =
 * egy szoba; a Cloudflare a világ egyik pontján tartja, a kapcsolatok pedig
 * WebSocketen mennek, nem peer-to-peer hálón.
 */
import { isRoomCode } from '../../../src/game/room-protocol'

export { Room } from './room'

export interface Env {
  ROOM: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }

    const match = /^\/room\/([^/]+)$/.exec(url.pathname)
    const code = match?.[1]
    if (!code) return new Response('not found', { status: 404 })
    if (!isRoomCode(code)) return new Response('bad room code', { status: 400 })

    // Ugyanaz a kód mindig ugyanahhoz a szobához vezet.
    const room = env.ROOM.get(env.ROOM.idFromName(code))
    return room.fetch(request)
  },
} satisfies ExportedHandler<Env>
