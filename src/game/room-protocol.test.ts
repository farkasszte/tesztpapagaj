import { describe, expect, test } from 'bun:test'
import {
  cleanRoomCode,
  decodePictureFrame,
  encodePictureFrame,
  isPictureFrame,
  isRoomCode,
  joinUrl,
  MAX_STUDENTS,
  newRoomCode,
  spacedRoomCode,
} from './room-protocol'

describe('szobakód', () => {
  test('hat számjegy, se több, se kevesebb', () => {
    expect(isRoomCode('482913')).toBe(true)
    expect(isRoomCode('48291')).toBe(false)
    expect(isRoomCode('4829134')).toBe(false)
    expect(isRoomCode('48291a')).toBe(false)
  })

  test('a beírt szövegből csak a számjegyek maradnak meg, hatig', () => {
    expect(cleanRoomCode('482 913')).toBe('482913')
    expect(cleanRoomCode('kód: 482-913')).toBe('482913')
    expect(cleanRoomCode('1234567890')).toBe('123456')
  })

  test('a falra hármasával kerül', () => {
    expect(spacedRoomCode('482913')).toBe('482 913')
  })

  test('az új kód mindig szabályos, és a véletlent használja', () => {
    const zeros = newRoomCode(() => 0)
    expect(zeros).toBe('000000')
    expect(isRoomCode(zeros)).toBe(true)
    const nines = newRoomCode(() => 0.999999)
    expect(isRoomCode(nines)).toBe(true)
    expect(nines).not.toBe(zeros)
  })

  test('a diák linkje a játék oldalra visz, a kóddal', () => {
    expect(joinUrl('https://tesztpapagaj.com/', '482913')).toBe(
      'https://tesztpapagaj.com/jatek?kod=482913',
    )
    expect(joinUrl('https://tesztpapagaj.com', '482913')).toBe(
      'https://tesztpapagaj.com/jatek?kod=482913',
    )
  })

  test('ötven diák fér egy szobába', () => {
    expect(MAX_STUDENTS).toBe(50)
  })
})

describe('képkeret', () => {
  const bytes = (size: number) => {
    const buffer = new Uint8Array(size)
    for (let index = 0; index < size; index += 1) buffer[index] = index % 251
    return buffer.buffer
  }

  test('a byte-ok érintetlenül mennek át, a hash és a mime is', () => {
    const original = bytes(300_000)
    const frame = encodePictureFrame('sha256:' + 'a'.repeat(64), 'image/png', original)
    expect(isPictureFrame(frame)).toBe(true)
    const back = decodePictureFrame(frame)
    expect(back).not.toBeNull()
    expect(back?.hash).toBe('sha256:' + 'a'.repeat(64))
    expect(back?.mime).toBe('image/png')
    expect(back?.bytes.byteLength).toBe(original.byteLength)
    expect(new Uint8Array(back!.bytes)).toEqual(new Uint8Array(original))
  })

  test('az üres kép is szabályos keret', () => {
    const frame = encodePictureFrame('sha256:' + 'b'.repeat(64), 'image/webp', new ArrayBuffer(0))
    const back = decodePictureFrame(frame)
    expect(back?.bytes.byteLength).toBe(0)
    expect(back?.mime).toBe('image/webp')
  })

  test('más bináris adat nem képkeret', () => {
    expect(isPictureFrame(new TextEncoder().encode('nem kép').buffer)).toBe(false)
    expect(isPictureFrame(new ArrayBuffer(2))).toBe(false)
    expect(decodePictureFrame(new TextEncoder().encode('nem kép').buffer)).toBeNull()
  })

  test('a csonka keretet nem értelmezzük képként', () => {
    const frame = encodePictureFrame('sha256:' + 'c'.repeat(64), 'image/jpeg', bytes(64))
    const cut = frame.slice(0, 10)
    expect(decodePictureFrame(cut)).toBeNull()
  })
})
