import type { Question } from '../types';
import type { BoardDraft } from './draft';

export type Tile = {
  /** 100 for the top row, up to 500. */
  value: number;
  question: Question;
  treasureTrove: boolean;
};

export type Column = { title: string; tiles: Tile[] };

/**
 * Everything a Peril! Session knows, as plain data. Like Champion's Session,
 * the teacher's tab owns it, saves it after every change, and sends each
 * screen only what it may see (see views.ts).
 *
 * A contender is whoever scores: a student in Solo, a Team in Teams. Control,
 * Buzzes and lockouts are all held by contenders.
 */

export type TeamSettings = {
  /** One name per Team; their number is the number of Teams. */
  names: string[];
  /** auto: students are spread evenly as they join. manual: they choose. */
  assign: 'auto' | 'manual';
};

export type PerilSettings = {
  /** null plays Solo. */
  teams: TeamSettings | null;
  /** A wrong answer loses the Tile's value. */
  wrongAnswerPenalty: boolean;
  treasureTrove: boolean;
  buzzSeconds: number;
  answerSeconds: number;
  voteSeconds: number;
  wagerSeconds: number;
};

export const DEFAULT_PERIL_SETTINGS: PerilSettings = {
  teams: null,
  wrongAnswerPenalty: true,
  treasureTrove: true,
  buzzSeconds: 10,
  answerSeconds: 10,
  voteSeconds: 15,
  wagerSeconds: 15,
};

export type PerilPlayer = {
  id: string;
  secret: string;
  nickname: string;
  /** Null in Solo, and in Teams until a student chooses one. */
  teamId: string | null;
  /** Solo score. In Teams, the Team holds the score. */
  points: number;
  /** Times this student voted for the right answer (Teams) or answered it (Solo). */
  rightVotes: number;
  buzzesWon: number;
  joinedAt: number;
  connected: boolean;
};

export type Team = { id: string; name: string; points: number };

export type PerilPhase =
  /** Students are joining. */
  | 'LOBBY'
  /** Whoever has Control picks a Tile. */
  | 'BOARD'
  /** A Tile is open; buzzers are locked while the class reads it. */
  | 'READING'
  /** Buzzers are armed. */
  | 'BUZZING'
  /** A Treasure Trove is open and its Wager is being set. */
  | 'WAGERING'
  /** The contender who buzzed (or found the Treasure Trove) answers; a Team votes. */
  | 'ANSWERING'
  /** The answer is on the board. */
  | 'REVEAL'
  /** Every Tile is played; standings are up. */
  | 'FINAL'
  | 'ENDED';

export type Vote = { playerId: string; choice: number; at: number };

export type OpenTile = {
  column: number;
  row: number;
  /** The contender answering now, and the student whose Buzz (or Control) brought them here. */
  answering: string | null;
  buzzer: string | null;
  /** Contenders who answered wrong and may not buzz again. */
  lockedOut: string[];
  /** Solo: the one answer. Teams: every member's vote. */
  votes: Vote[];
  /** Treasure Trove only: each student's number, then the Wager it settles on. */
  wagers: { playerId: string; amount: number }[];
  wager: number | null;
  /** When the current step (buzzing, answering, wagering) runs out. */
  deadline: number | null;
  result: null | {
    /** null when nobody answered. */
    contender: string | null;
    choice: number | null;
    correct: boolean;
    points: number;
  };
};

export type PerilSession = {
  mode: 'peril';
  version: 1;
  code: string;
  createdAt: number;
  /** Played with no student devices: Teams with no members, and the teacher taps who buzzed and what they answered. */
  noDevices?: boolean;
  settings: PerilSettings;
  players: PerilPlayer[];
  /** Empty in Solo. */
  teams: Team[];
  phase: PerilPhase;
  board: Column[];
  /** `${column}:${row}` of every Tile played. */
  played: string[];
  /** The contender who picks the next Tile. */
  control: string | null;
  open: OpenTile | null;
  boardsPlayed: number;
  /** The Board as the teacher built it, to start the next one from. The rules never read it. */
  draft: BoardDraft | null;
  seq: number;
};
