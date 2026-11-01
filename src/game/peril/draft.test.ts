import { expect, test } from 'bun:test';
import type { Question, QuestionBank } from '../types';
import {
  addColumn,
  clearTile,
  emptyDraft,
  fillColumn,
  fillNextColumn,
  onBoard,
  placeQuestion,
  removeColumn,
  swapTiles,
  toBoard,
} from './draft';

const q = (id: string): Question => ({ id, prompt: id, choices: ['a', 'b'], correct: 0 });
const library: QuestionBank[] = [{ id: 'b', title: 'Bank', questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].map(q), updatedAt: 0 }];
const titles = (d: ReturnType<typeof emptyDraft>) => d.columns.map((c) => [c.title, c.tiles]);

test('a new Board has three empty Columns of five Tiles; Columns can be added up to six and removed', () => {
  let draft = emptyDraft();
  expect(titles(draft)).toEqual([0, 1, 2].map(() => ['', [null, null, null, null, null]]));
  for (let i = 0; i < 5; i++) draft = addColumn(draft);
  expect(draft.columns).toHaveLength(6);
  draft = removeColumn(draft, 0);
  expect(draft.columns).toHaveLength(5);
});

test('placing a question already on the Board moves it, so each question is used once', () => {
  let draft = placeQuestion(emptyDraft(), 0, 0, 'q1');
  draft = placeQuestion(draft, 1, 3, 'q1');
  expect(draft.columns[0].tiles[0]).toBeNull();
  expect(draft.columns[1].tiles[3]).toBe('q1');
  draft = placeQuestion(draft, 1, 3, 'q2'); // replaces
  expect([...onBoard(draft)]).toEqual(['q2']);
  expect(clearTile(draft, 1, 3).columns[1].tiles[3]).toBeNull();
});

test('dropping a list on a Column fills its empty Tiles in order, skips questions already placed, and names it', () => {
  let draft = placeQuestion(emptyDraft(), 0, 1, 'q9');
  draft = placeQuestion(draft, 2, 0, 'q2');
  draft = fillColumn(draft, 0, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 'Halves');
  expect(titles(draft)[0]).toEqual(['Halves', ['q1', 'q9', 'q3', 'q4', 'q5']]);
  // A Column the teacher already named keeps its name.
  draft = fillColumn({ ...draft, columns: draft.columns.map((c, i) => (i === 1 ? { ...c, title: 'Mine' } : c)) }, 1, ['q6'], 'Other');
  expect(titles(draft)[1]).toEqual(['Mine', ['q6', null, null, null, null]]);
});

test('the Board to play keeps each Tile’s value by its row, leaving out empty Tiles, empty Columns and deleted questions', () => {
  let draft = placeQuestion(emptyDraft(), 0, 0, 'q1');
  draft = placeQuestion(draft, 0, 3, 'q2');
  draft = placeQuestion(draft, 0, 4, 'gone');
  draft = { ...draft, columns: draft.columns.map((c, i) => (i === 0 ? { ...c, title: 'Halves' } : c)) };
  const board = toBoard(draft, library, { treasureTrove: false, random: Math.random });
  expect(board.map((c) => [c.title, c.tiles.map((t) => [t.question.id, t.value])])).toEqual([
    [
      'Halves',
      [
        ['q1', 100],
        ['q2', 400],
      ],
    ],
  ]);
});

test('an untitled Column is called by its place', () => {
  const draft = placeQuestion(emptyDraft(), 1, 0, 'q1');
  expect(toBoard(draft, library, { treasureTrove: false, random: Math.random })[0].title).toBe('Column 2');
});

test('with Treasure Trove on, one Tile below the top row hides it', () => {
  let draft = emptyDraft();
  draft = fillColumn(draft, 0, ['q1', 'q2', 'q3'], 'A');
  for (let i = 0; i < 30; i++) {
    const tiles = toBoard(draft, library, { treasureTrove: true, random: Math.random }).flatMap((c) => c.tiles);
    const troves = tiles.filter((t) => t.treasureTrove);
    expect(troves).toHaveLength(1);
    expect(troves[0].value).toBeGreaterThan(100);
  }
});

test('dragging one Tile onto another swaps their questions; onto an empty Tile, it moves', () => {
  let draft = placeQuestion(emptyDraft(), 0, 0, 'q1');
  draft = placeQuestion(draft, 1, 2, 'q2');
  draft = swapTiles(draft, { column: 0, row: 0 }, { column: 1, row: 2 });
  expect([draft.columns[0].tiles[0], draft.columns[1].tiles[2]]).toEqual(['q2', 'q1']);
  draft = swapTiles(draft, { column: 1, row: 2 }, { column: 2, row: 4 });
  expect([draft.columns[1].tiles[2], draft.columns[2].tiles[4]]).toEqual([null, 'q1']);
});

test('adding a whole list fills the first empty Column, or failing that the first with room', () => {
  let draft = placeQuestion(emptyDraft(), 0, 0, 'q1');
  draft = fillNextColumn(draft, ['q2', 'q3'], 'Halves');
  expect(titles(draft)[1]).toEqual(['Halves', ['q2', 'q3', null, null, null]]);
  draft = fillNextColumn(fillNextColumn(draft, ['q4'], 'A'), ['q5'], 'B');
  // Every Column has a question now, so the next list tops up the first with room.
  expect(titles(draft)[0]).toEqual(['B', ['q1', 'q5', null, null, null]]);
});
