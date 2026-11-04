import { expect, test } from 'bun:test'
import { buildCsv, csvFilename } from './standings-csv'

test('a CSV BOM-mal indul, pontosvesszővel tagol, és a játék nevével kezd', () => {
  const csv = buildCsv(
    'Biológia — 7. osztály',
    ['Hely', 'Név', 'Pont'],
    [
      [1, 'Panni', 300],
      [2, 'Bence', 200],
    ],
  )
  expect(csv.startsWith('\uFEFF')).toBe(true)
  // A BOM a fájl legelején ül, a címsor előtt: ebből ismeri fel az Excel a kódolást.
  expect(csv.slice(1).split('\r\n')[0]).toBe('Biológia — 7. osztály')
  expect(csv.split('\r\n')[1]).toBe('Hely;Név;Pont')
  expect(csv.split('\r\n')[2]).toBe('1;Panni;300')
  expect(csv.endsWith('\r\n')).toBe(true)
})

test('a pontosvesszőt, az idézőjelet és a sortörést tartalmazó cella idézőjelbe kerül', () => {
  const csv = buildCsv('Játék', ['Név', 'Megjegyzés'], [['Kovács; Béla', 'az "egyik" tanuló']])
  const row = csv.split('\r\n')[2]
  expect(row).toBe('"Kovács; Béla";"az ""egyik"" tanuló"')

  const broken = buildCsv('Játék', ['Név'], [['első\nmásodik']])
  expect(broken).toContain('"első\nmásodik"')
})

test('a fájlnév ékezet nélküli, kisbetűs és dátumozott', () => {
  const name = csvFilename('Biológia — 7. osztály', new Date(2026, 10, 3))
  expect(name).toBe('biologia-7-osztaly-2026-11-03.csv')
  // Név nélkül sem üres: a játék az alap.
  expect(csvFilename('', new Date(2026, 0, 1))).toBe('jatek-2026-01-01.csv')
})
