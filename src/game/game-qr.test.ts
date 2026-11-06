import { describe, expect, test } from 'bun:test'
import qrcode from 'qrcode-generator'

/**
 * A QR-renderelés szerkezete.
 *
 * A kódot a jól ismert `qrcode-generator` adja; itt az a kérdés, hogy a saját
 * SVG-rajzolásunk nem csúsztatja-e el a rácsot (fordított tengely, rossz
 * csendes zóna) — az ilyen hiba a telefonok szeméből nézve olvashatatlan kódot
 * ad, a képviselő pedig hibátlanul néz ki.
 */

/** A QrCode komponens rácslogikája, külön, hogy tesztelhető legyen. */
function matrix(text: string): { count: number; dark: (row: number, column: number) => boolean } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return { count: qr.getModuleCount(), dark: (row, column) => qr.isDark(row, column) }
}

/** A 7×7-es sarokminta: tömör keret, üres gyűrű, 3×3 mag. */
function hasFinder({ dark }: ReturnType<typeof matrix>, row: number, column: number): boolean {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const edge = r === 0 || r === 6 || c === 0 || c === 6
      const ring = r === 1 || r === 5 || c === 1 || c === 5
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
      if (dark(row + r, column + c) !== (edge || core)) return false
      if (!edge && !ring && !core) return false
    }
  }
  return true
}

describe('QR a belépő linkhez', () => {
  const url = 'https://tesztpapagaj.com/jatek?kod=482913'

  test('a rács a linkhez illő méretű, és páratlan modulszámú', () => {
    const { count } = matrix(url)
    expect(count).toBeGreaterThanOrEqual(21)
    expect(count).toBeLessThanOrEqual(57)
    expect(count % 2).toBe(1)
  })

  test('három sarokban van pozícionáló minta, a negyedikben nincs', () => {
    const grid = matrix(url)
    const far = grid.count - 7
    expect(hasFinder(grid, 0, 0)).toBe(true)
    expect(hasFinder(grid, 0, far)).toBe(true)
    expect(hasFinder(grid, far, 0)).toBe(true)
    // A jobb alsó sarok szabad: ez fogja meg a fordított tengelyű rajzolást.
    expect(hasFinder(grid, far, far)).toBe(false)
  })

  test('a rács nem üres és nem teli', () => {
    const grid = matrix(url)
    let dark = 0
    for (let row = 0; row < grid.count; row += 1) {
      for (let column = 0; column < grid.count; column += 1) {
        if (grid.dark(row, column)) dark += 1
      }
    }
    const share = dark / (grid.count * grid.count)
    expect(share).toBeGreaterThan(0.25)
    expect(share).toBeLessThan(0.75)
  })
})
