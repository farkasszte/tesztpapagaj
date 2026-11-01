import { describe, expect, test } from 'bun:test'
import { BOARD_TILES, MIN_BOARD_QUESTIONS, perilBoard } from './peril-board'
import type { Question } from './types'

function question(index: number, topics?: string[]): Question {
  return {
    id: `q${index}`,
    prompt: `Kérdés ${index}`,
    choices: ['A', 'B'],
    correct: 0,
    ...(topics ? { topics } : {}),
  }
}

const untitled = (index: number) => `${index + 1}. oszlop`
const noTroves = { treasureTrove: false }

describe('a Veszély! táblája egy készletből', () => {
  test('minden kérdés pontosan egyszer kerül a táblára, 100-tól felfelé érő mezőkön', () => {
    const questions = Array.from({ length: 12 }, (_, index) => question(index))
    const board = perilBoard(questions, { ...noTroves, untitled })
    const tiles = board.flatMap((column) => column.tiles)
    expect(tiles).toHaveLength(12)
    expect(new Set(tiles.map((tile) => tile.question.id)).size).toBe(12)
    expect(tiles.every((tile) => tile.value % 100 === 0 && tile.value >= 100 && tile.value <= 500)).toBe(true)
  })

  test('kevés kérdésből alacsony tábla lesz, nem üres mezőkkel teli', () => {
    const board = perilBoard(Array.from({ length: MIN_BOARD_QUESTIONS }, (_, index) => question(index)), { ...noTroves, untitled })
    const tiles = board.flatMap((column) => column.tiles)
    expect(tiles).toHaveLength(MIN_BOARD_QUESTIONS)
    expect(Math.max(...tiles.map((tile) => tile.value))).toBe(200)
  })

  test('a tábla legfeljebb hat oszlop és öt sor', () => {
    const board = perilBoard(Array.from({ length: 40 }, (_, index) => question(index)), { ...noTroves, untitled })
    expect(board.length).toBeLessThanOrEqual(6)
    expect(Math.max(...board.map((column) => column.tiles.length))).toBeLessThanOrEqual(BOARD_TILES)
  })

  test('a Topicokból oszlopcím lesz, ha minden kérdésnek van és elég oszlopra telik', () => {
    const topics = ['Földrajz', 'Történelem', 'Biológia']
    const questions = Array.from({ length: 15 }, (_, index) => question(index, [topics[index % 3]]))
    const board = perilBoard(questions, { ...noTroves, untitled })
    expect(board.map((column) => column.title).sort()).toEqual([...topics].sort())
  })

  test('Topic nélkül számozott oszlopcímek jönnek', () => {
    const board = perilBoard(Array.from({ length: 6 }, (_, index) => question(index)), { ...noTroves, untitled })
    expect(board.map((column) => column.title)).toEqual(['1. oszlop', '2. oszlop'])
  })

  test('a kincsesbarlang az első sor alá kerül, ha kérték', () => {
    const board = perilBoard(Array.from({ length: 15 }, (_, index) => question(index)), { untitled, random: () => 0 })
    const troves = board.flatMap((column) => column.tiles).filter((tile) => tile.treasureTrove)
    expect(troves).toHaveLength(1)
    expect(troves[0].value).toBeGreaterThan(100)
  })

  test('kikapcsolt kincsesbarlangnál nincs egy sem', () => {
    const board = perilBoard(Array.from({ length: 15 }, (_, index) => question(index)), { ...noTroves, untitled })
    expect(board.flatMap((column) => column.tiles).some((tile) => tile.treasureTrove)).toBe(false)
  })
})
