import { expect, test } from 'bun:test'
import { choiceTone, rightLetters } from './student-tone'

test('a téves válasz indoklása minden helyes betűt felsorol', () => {
  // Két helyes válasz: nem csak az első betű kerülhet a szövegbe.
  expect(rightLetters([2, 3])).toBe('C, D')
  expect(rightLetters([0])).toBe('A')
  expect(rightLetters([3, 0, 2])).toBe('A, C, D')
  expect(rightLetters([])).toBe('')
})

test('a kijelölés a felfedés előtt is látszik (több helyes válasz)', () => {
  expect(choiceTone({ index: 0, correctIndexes: null, picked: true })).toBe('picked')
  expect(choiceTone({ index: 1, correctIndexes: null, picked: false })).toBe('idle')
})

test('a felfedés után a helyes kártya mindig helyes, a rossz jelölés téves', () => {
  expect(choiceTone({ index: 2, correctIndexes: [2, 3], picked: true })).toBe('correct')
  expect(choiceTone({ index: 0, correctIndexes: [2, 3], picked: true })).toBe('wrong')
  expect(choiceTone({ index: 1, correctIndexes: [2, 3], picked: false })).toBe('faded')
})
