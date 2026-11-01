import type { QuestionBank } from '../types';
import type { Column } from './types';

/**
 * A Board as the teacher builds it before playing: titled Columns of five
 * Tiles, each empty or holding one question (by id). A question sits on at
 * most one Tile. Every change returns a new draft.
 */

export type DraftColumn = { title: string; tiles: (string | null)[] };
export type BoardDraft = { columns: DraftColumn[] };

export const MAX_COLUMNS = 6;
export const TILES_PER_COLUMN = 5;

const emptyColumn = (): DraftColumn => ({ title: '', tiles: Array(TILES_PER_COLUMN).fill(null) });

export const emptyDraft = (): BoardDraft => ({ columns: [emptyColumn(), emptyColumn(), emptyColumn()] });

export function onBoard(draft: BoardDraft): Set<string> {
  return new Set(draft.columns.flatMap((column) => column.tiles.filter((id): id is string => id !== null)));
}

export function addColumn(draft: BoardDraft): BoardDraft {
  return draft.columns.length >= MAX_COLUMNS ? draft : { columns: [...draft.columns, emptyColumn()] };
}

export function removeColumn(draft: BoardDraft, column: number): BoardDraft {
  return { columns: draft.columns.filter((_, i) => i !== column) };
}

export function renameColumn(draft: BoardDraft, column: number, title: string): BoardDraft {
  return { columns: draft.columns.map((c, i) => (i === column ? { ...c, title } : c)) };
}

function setTile(draft: BoardDraft, column: number, row: number, id: string | null): BoardDraft {
  return {
    columns: draft.columns.map((c, i) => ({
      ...c,
      tiles: c.tiles.map((tile, r) => (i === column && r === row ? id : tile === id ? null : tile)),
    })),
  };
}

/** Puts a question on a Tile, moving it there if it was on another. */
export const placeQuestion = (draft: BoardDraft, column: number, row: number, questionId: string) =>
  setTile(draft, column, row, questionId);

export const clearTile = (draft: BoardDraft, column: number, row: number) => setTile(draft, column, row, null);

/** Fills a Column's empty Tiles from a list, top down, skipping questions already placed. An untitled Column takes `title`. */
export function fillColumn(draft: BoardDraft, column: number, questionIds: string[], title?: string): BoardDraft {
  const used = onBoard(draft);
  const queue = questionIds.filter((id) => !used.has(id));
  return {
    columns: draft.columns.map((c, i) =>
      i !== column ? c : { title: c.title || title || '', tiles: c.tiles.map((tile) => tile ?? queue.shift() ?? null) },
    ),
  };
}

/** The Board to play: each Tile worth 100 × its row, without empty Tiles, empty Columns or deleted questions. */
export function toBoard(
  draft: BoardDraft,
  library: QuestionBank[],
  options: { treasureTrove: boolean; random: () => number },
): Column[] {
  const questions = new Map(library.flatMap((bank) => bank.questions.map((q) => [q.id, q] as const)));
  const board = draft.columns
    .map((column, c) => ({
      title: column.title.trim() || `Column ${c + 1}`,
      tiles: column.tiles.flatMap((id, row) => {
        const question = id ? questions.get(id) : undefined;
        return question ? [{ value: (row + 1) * 100, question, treasureTrove: false }] : [];
      }),
    }))
    .filter((column) => column.tiles.length);
  if (options.treasureTrove) {
    const below = board.flatMap((column) => column.tiles.filter((tile) => tile.value > 100));
    if (below.length) below[Math.floor(options.random() * below.length)].treasureTrove = true;
  }
  return board;
}

export type TileSpot = { column: number; row: number };

/** Trades two Tiles' questions; onto an empty Tile, that's a move. */
export function swapTiles(draft: BoardDraft, from: TileSpot, to: TileSpot): BoardDraft {
  const a = draft.columns[from.column]?.tiles[from.row] ?? null;
  const b = draft.columns[to.column]?.tiles[to.row] ?? null;
  return {
    columns: draft.columns.map((c, i) => ({
      ...c,
      tiles: c.tiles.map((tile, r) =>
        i === from.column && r === from.row ? b : i === to.column && r === to.row ? a : tile,
      ),
    })),
  };
}

/** Fills the first empty Column with a list, or, when none is empty, the first with room. */
export function fillNextColumn(draft: BoardDraft, questionIds: string[], title?: string): BoardDraft {
  const empty = draft.columns.findIndex((c) => c.tiles.every((tile) => tile === null));
  const roomy = draft.columns.findIndex((c) => c.tiles.includes(null));
  const column = empty >= 0 ? empty : roomy;
  return column < 0 ? draft : fillColumn(draft, column, questionIds, title);
}
