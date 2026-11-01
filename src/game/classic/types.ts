import type { Question } from '../types';

/**
 * Everything a Classic Session knows, as plain data: everyone answers every
 * question, and the teacher sees how the class did. Like the other Game
 * Modes, the teacher's tab owns it and sends each screen only what it may
 * see (see views.ts).
 */

export type ClassicSettings = {
  timerSeconds: number;
  /** Off: right or wrong only. On: points for right answers, more for quick ones. */
  scoring: boolean;
  shuffleQuestions: boolean;
};

export const DEFAULT_CLASSIC_SETTINGS: ClassicSettings = { timerSeconds: 20, scoring: false, shuffleQuestions: false };

export type ClassicPlayer = {
  id: string;
  secret: string;
  nickname: string;
  points: number;
  joinedAt: number;
  connected: boolean;
};

export type ClassicPhase =
  /** Students are joining. */
  | 'LOBBY'
  /** A question is open and everyone is answering. */
  | 'QUESTION'
  /** The answer is on the board, with how many chose each. */
  | 'REVEAL'
  /** Every question is done; the Report is up. */
  | 'REPORT'
  | 'ENDED';

export type ClassicAnswer = { playerId: string; choice: number; ms: number };

export type ClassicSession = {
  mode: 'classic';
  version: 1;
  code: string;
  createdAt: number;
  /** Played with no student devices: a class review with nobody joined, paced by the teacher. */
  noDevices?: boolean;
  title: string;
  settings: ClassicSettings;
  /** In the order they're asked. */
  questions: Question[];
  players: ClassicPlayer[];
  phase: ClassicPhase;
  /** The question open or last shown, counted from 0. */
  index: number;
  /** One list of answers per question asked. */
  answers: ClassicAnswer[][];
  /** When the open question was shown, and when its answers lock. */
  openedAt: number | null;
  deadline: number | null;
  seq: number;
};

export type ClassicReport = {
  questions: { prompt: string; correct: number; answered: number; counts: number[] }[];
  students: { nickname: string; correct: number; answered: number; points: number }[];
};
