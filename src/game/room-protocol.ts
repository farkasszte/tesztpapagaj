/**
 * A szoba-relay huzalprotokollja — közös a Cloudflare-worker és a böngésző között.
 *
 * A relay **buta**: nem tud semmit a játékról, a kérdésekről vagy a pontokról.
 * Egy szobát tart (6 jegyű kód), továbbítja a tanár fülének üzeneteit a
 * diákoknak, és egyszer fogadja a képeket, hogy azokat ne kelljen minden
 * eszköznek külön feltöltenie. Minden szabály a tanár böngészőjében fut, ahogy
 * a Class Gauntlet modelljében is — így nincs duplikált állapot.
 *
 * Ez a fájl szándékosan csak típusokat és tiszta függvényeket tartalmaz: sem
 * DOM-ot, sem Cloudflare-API-t nem ismer, tehát a worker, a kliens és a tesztek
 * ugyanazt a szerződést használják.
 */

/** Egy szoba kódja: hat számjegy, ahogy a tanár a falra írja. */
export type RoomCode = string

/** Ki ül a kapcsolat másik végén. */
export type RoomRole = 'host' | 'player'

/** A relay belső azonosítója egy kapcsolatra; a tanár ezzel címez. */
export type PeerId = string

/** A tanár üzenetei. */
export type HostMessage =
  /** Egy nézet mindenkinek, vagy egyvalakinek (a címzett a relay `PeerId`-ja). */
  | { type: 'view'; to: 'everyone' | PeerId; view: unknown }
  /** Egy kép byte-jai, egyszer — a relay a szobában tárolja és szétosztja. */
  | { type: 'picture'; hash: string; mime: string; bytes: ArrayBuffer }
  /** A játék véget ért: a relay szobát bont. */
  | { type: 'close' }

/** A diák (és a tanár) üzenetei a relay felé. */
export type ClientMessage =
  | { type: 'hello'; role: RoomRole }
  /** Egy kép kérése, ha a diák a csatlakozáskor nem kapta meg. */
  | { type: 'picture-wanted'; hash: string }
  /** A diáktól a tanárhoz: belépés, válasz — a relay csak továbbítja. */
  | { type: 'reply'; view: unknown }
  /** Életjel; a relay `pong`-gal felel. */
  | { type: 'ping' }

/** A relay üzenetei. */
export type RelayMessage =
  /** Sikeres belépés: ez a kapcsolat azonosítója, és a szobában ülők száma. */
  | { type: 'welcome'; id: PeerId; role: RoomRole; players: number }
  /** Egy nézet, amit a tanár küldött. */
  | { type: 'view'; view: unknown }
  /** Kép byte-jai (a tanár feltöltéséből vagy a szoba tárolójából). */
  | { type: 'picture'; hash: string; mime: string; bytes: ArrayBuffer }
  /** Egy diák üzenete a tanárnak (a relay nem érti, csak viszi). */
  | { type: 'reply'; from: PeerId; view: unknown }
  /** Egy diák elment vagy kiesett. */
  | { type: 'left'; id: PeerId }
  /** A relay elvesztette a képet (a szoba elhidegült): a tanár küldje újra. */
  | { type: 'picture-missing'; hash: string }
  /** A szoba megtelt, vagy a tanár már lezárta. */
  | { type: 'denied'; reason: 'full' | 'closed' | 'no-room' | 'not-host' }
  | { type: 'pong' }

/**
 * Egy szobában ennyi diák fér el. A Class Gauntlet 40-nél áll meg; 50 a
 * magyar iskolai osztály felső határa, és a relay-oldali fan-out ezt bőven
 * elbírja (egy WebSocket-kapcsolat, nem ötven).
 */
export const MAX_STUDENTS = 50

/** Egy szobához ennyi kép byte-jait tartjuk meg (összesen). */
export const MAX_ROOM_PICTURE_BYTES = 32 * 1024 * 1024

/** Egy kép kérésekor ezt a címkézési sémát használjuk (a TP sajátja). */
export const PICTURE_HASH = /^sha256:[a-f0-9]{64}$/

/** Igaz, ha a szöveg szabályos szobakód. */
export function isRoomCode(value: string): value is RoomCode {
  return /^[0-9]{6}$/.test(value)
}

/** A tanár által beírt kódból szabályos kód: csak a számjegyek maradnak. */
export function cleanRoomCode(input: string): RoomCode {
  return input.replace(/[^0-9]/g, '').slice(0, 6)
}

/** A falra írt, olvasható változat: `482 913`. */
export function spacedRoomCode(code: RoomCode): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

/** Új szobakód; a `crypto` a böngészőben és a workerben is megvan. */
export function newRoomCode(random: () => number = Math.random): RoomCode {
  let code = ''
  for (let index = 0; index < 6; index += 1) code += Math.floor(random() * 10)
  return code
}

/** A diák linkje, amit a QR-kód hordoz. */
export function joinUrl(origin: string, code: RoomCode, options: { split?: boolean } = {}): string {
  const base = origin.replace(/\/+$/, '')
  // A differenciált szobában a diák a belépésnél oldalt választ (tp#45): ezt a
  // link viszi, mert a szoba kódja önmagában nem mondja meg, milyen játék lesz.
  return `${base}/diak?kod=${code}${options.split ? '&oldal=1' : ''}`
}

// ---------------------------------------------------------------------------
// Képkeret: a képeket nem JSON-ban, base64-gel toljuk (az 33%-kal hízlal), hanem
// bináris keretben: `TPP1` mágia, 4 bájtos fejléc-hossz, JSON fejléc, majd a
// byte-ok. Ugyanez a keret megy a böngésző és a worker között is.
// ---------------------------------------------------------------------------

const PICTURE_MAGIC = [0x54, 0x50, 0x50, 0x31] // 'TPP1'

/** Kép keretbe csomagolása. */
export function encodePictureFrame(hash: string, mime: string, bytes: ArrayBuffer): ArrayBuffer {
  const header = new TextEncoder().encode(JSON.stringify({ hash, mime }))
  const frame = new Uint8Array(PICTURE_MAGIC.length + 4 + header.byteLength + bytes.byteLength)
  frame.set(PICTURE_MAGIC, 0)
  new DataView(frame.buffer).setUint32(PICTURE_MAGIC.length, header.byteLength)
  frame.set(header, PICTURE_MAGIC.length + 4)
  frame.set(new Uint8Array(bytes), PICTURE_MAGIC.length + 4 + header.byteLength)
  return frame.buffer
}

/** Igaz, ha a bináris üzenet képkeret (és nem más bináris dolog). */
export function isPictureFrame(data: ArrayBuffer): boolean {
  if (data.byteLength < PICTURE_MAGIC.length + 4) return false
  const view = new Uint8Array(data, 0, PICTURE_MAGIC.length)
  return PICTURE_MAGIC.every((byte, index) => view[index] === byte)
}

/** Képkeret kicsomagolása; `null`, ha nem az. */
export function decodePictureFrame(
  data: ArrayBuffer,
): { hash: string; mime: string; bytes: ArrayBuffer } | null {
  if (!isPictureFrame(data)) return null
  const view = new DataView(data)
  const headerLength = view.getUint32(PICTURE_MAGIC.length)
  const headerStart = PICTURE_MAGIC.length + 4
  if (data.byteLength < headerStart + headerLength) return null
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(data, headerStart, headerLength)),
  ) as { hash?: unknown; mime?: unknown }
  if (typeof header.hash !== 'string' || typeof header.mime !== 'string') return null
  return {
    hash: header.hash,
    mime: header.mime,
    bytes: data.slice(headerStart + headerLength),
  }
}
