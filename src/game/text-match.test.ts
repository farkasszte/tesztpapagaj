import { describe, expect, test } from 'bun:test'
import {
  acceptedAnswersOf,
  normalizeAnswer,
  numberOf,
  textIsRight,
} from './text-match'

describe('a válasz összehasonlítható alakja', () => {
  test('az ékezet, a kisbetű és a fölösleges szóköz nem számít', () => {
    expect(normalizeAnswer('  Párolgás ')).toBe('parolgas')
    expect(normalizeAnswer('PÁROLGÁS')).toBe('parolgas')
    expect(normalizeAnswer('Párolgás.')).toBe('parolgas')
    expect(normalizeAnswer('szén-dioxid')).toBe('szen-dioxid')
    expect(normalizeAnswer('szén – dioxid')).toBe('szen - dioxid')
  })

  test('a magyar ékezetek elhagyhatók, az írásjel pedig lekerül', () => {
    expect(normalizeAnswer('ŐRSÉG!')).toBe('orseg')
    expect(normalizeAnswer('űrhajó?')).toBe('urhajo')
    expect(normalizeAnswer('(zárójel)')).toBe('zarojel')
  })

  test('az üres válasz üres marad', () => {
    expect(normalizeAnswer('   ')).toBe('')
    expect(normalizeAnswer('…')).toBe('')
  })
})

describe('számok', () => {
  test('a vessző és a pont ugyanaz', () => {
    expect(numberOf('3,14')).toBe(3.14)
    expect(numberOf('3.14')).toBe(3.14)
    expect(numberOf('-2')).toBe(-2)
  })

  test('a szöveg nem szám', () => {
    expect(numberOf('három')).toBeNull()
    expect(numberOf('3 alma')).toBeNull()
  })
})

describe('a tanár válaszából az elfogadható alakok', () => {
  test('a perjel, a pontosvessző és a „vagy” elválaszt', () => {
    expect(acceptedAnswersOf('fotoszintézis')).toEqual(['fotoszintézis'])
    expect(acceptedAnswersOf('C6H12O6 / glükóz')).toEqual(['C6H12O6', 'glükóz'])
    expect(acceptedAnswersOf('sejt; sejtszervecske')).toEqual(['sejt', 'sejtszervecske'])
    expect(acceptedAnswersOf('oxigén vagy O2')).toEqual(['oxigén', 'O2'])
  })
})

describe('a beírt válasz elbírálása', () => {
  test('a pontos válasz helyes, bármilyen írásmóddal', () => {
    expect(textIsRight('fotoszintézis', ['fotoszintézis'])).toBe(true)
    expect(textIsRight('  FOTOSZINTEZIS ', ['fotoszintézis'])).toBe(true)
    expect(textIsRight('Fotoszintézis.', ['fotoszintézis'])).toBe(true)
  })

  test('egy elütött betű még helyes, a másik szó nem', () => {
    expect(textIsRight('fotoszintezis', ['fotoszintézis'])).toBe(true)
    expect(textIsRight('fotoszintéziss', ['fotoszintézis'])).toBe(true)
    expect(textIsRight('légzés', ['fotoszintézis'])).toBe(false)
    expect(textIsRight('fotoszintézis helyett valami más', ['fotoszintézis'])).toBe(false)
  })

  test('rövid válasznál nincs elütés-tűrés', () => {
    expect(textIsRight('só', ['só'])).toBe(true)
    expect(textIsRight('so', ['só'])).toBe(true)
    expect(textIsRight('sóó', ['só'])).toBe(false)
    expect(textIsRight('szo', ['só'])).toBe(false)
  })

  test('számnál a vessző, a pont és a kerekítés nem ront', () => {
    expect(textIsRight('3,14', ['3.14'])).toBe(true)
    expect(textIsRight('3.14', ['3,14'])).toBe(true)
    expect(textIsRight('-2', ['-2'])).toBe(true)
    expect(textIsRight('3,15', ['3.14'])).toBe(false)
    expect(textIsRight('14', ['3.14'])).toBe(false)
  })

  test('több elfogadható alak közül bármelyik jó', () => {
    const accepted = acceptedAnswersOf('C6H12O6 / glükóz')
    expect(textIsRight('glükóz', accepted)).toBe(true)
    expect(textIsRight('c6h12o6', accepted)).toBe(true)
    expect(textIsRight('cukor', accepted)).toBe(false)
  })

  test('az üres beírás nem helyes, és válasz nélkül sincs helyes válasz', () => {
    expect(textIsRight('', ['só'])).toBe(false)
    expect(textIsRight('   ', ['só'])).toBe(false)
    expect(textIsRight('só', [])).toBe(false)
    expect(textIsRight('só', ['   '])).toBe(false)
  })
})
